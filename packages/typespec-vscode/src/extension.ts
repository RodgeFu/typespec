import { CompileResultSlim } from "@typespec/compiler";
import { ResolveModuleHost } from "@typespec/compiler/module-resolver";
import fs from "fs";
import { readFile, realpath, stat } from "fs/promises";
import { dirname, isAbsolute, join, resolve } from "path";
import vscode, { commands, ExtensionContext, QuickPickItemKind, workspace } from "vscode";
import {
  Executable,
  ExecutableOptions,
  LanguageClient,
  LanguageClientOptions,
} from "vscode-languageclient/node.js";
import YAML from "yaml";
import logger from "./extension-logger.js";
import { TypeSpecLogOutputChannel } from "./typespec-log-output-channel.js";
import {
  EmitPackageQuickPickItem,
  ensureNpmPackageInstalled,
  execCompile,
  getMainTspFile,
  loadEmitterOptions,
  recommendedEmitters,
} from "./util-typespec.js";
import { createTempDir, normalizeSlash } from "./utils.js";

let client: LanguageClient | undefined;
const openApi3FileCache = new Map<string, string>();
/**
 * Workaround: LogOutputChannel doesn't work well with LSP RemoteConsole, so having a customized LogOutputChannel to make them work together properly
 * More detail can be found at https://github.com/microsoft/vscode-discussions/discussions/1149
 */
const outputChannel = new TypeSpecLogOutputChannel("TypeSpec");
logger.outputChannel = outputChannel;

export async function activate(context: ExtensionContext) {
  context.subscriptions.push(createTaskProvider());

  context.subscriptions.push(
    commands.registerCommand("typespec.showOutputChannel", () => {
      outputChannel.show(true /*preserveFocus*/);
    }),
  );

  context.subscriptions.push(
    commands.registerCommand("typespec.restartServer", restartTypeSpecServer),
  );

  context.subscriptions.push(
    commands.registerCommand("typespec.showOpenApi3", async (uri: vscode.Uri) => {
      await showOpenApi3(context, uri);
    }),
  );

  context.subscriptions.push(
    commands.registerCommand("typespec.emit", async (uri: vscode.Uri) => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: "TypeSpec Emitting",
          cancellable: false,
        },
        async (progress) => await doEmit(context, uri, progress),
      );
    }),
  );

  return await vscode.window.withProgress(
    {
      title: "Launching TypeSpec language service...",
      location: vscode.ProgressLocation.Notification,
    },
    async () => launchLanguageClient(context),
  );
}

async function doEmit(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
  overallProgress: vscode.Progress<{ message?: string; increment?: number }>,
) {
  const cli = await resolveTypeSpecCli(uri.fsPath);
  if (!cli) {
    logger.error(
      "TypeSpec CLI is not resolved to emit. Please try again later. If the problem persists, please double check the configuration typespec.tsp-cli.path.",
      [],
      {
        showOutput: false,
        showPopup: true,
      },
    );
    return;
  }

  let startFile: string | undefined = uri?.fsPath;
  if (!client) {
    logger.error("TypeSpec server is not started. Please restart the server and try again.");
    return;
  }
  if (!startFile) {
    startFile = await getMainTspFile();
    if (!startFile) {
      logger.error("No main.tsp file found in the workspace to start emit.");
      return;
    }
    uri = vscode.Uri.file(startFile);
  }

  logger.info("Verify compilation...", [], {
    showOutput: false,
    showPopup: false,
    progress: overallProgress,
  });
  const {
    hasError,
    entryPoint,
    options: config,
  } = await client.sendRequest<CompileResultSlim>("custom/compile", {
    doc: { uri: uri.toString() },
    options: {},
  });
  if (hasError) {
    logger.error("Compilation failed. Please fix it first.", [], {
      showOutput: false,
      showPopup: true,
    });
    void vscode.commands.executeCommand("workbench.actions.view.problems");
    return;
  }
  if (!entryPoint || !config) {
    logger.error("Failed to get entry point or config to compile.", [], {
      showOutput: false,
      showPopup: true,
    });
    return;
  }

  startFile = entryPoint;
  if (!startFile) {
    logger.error(`Can't find entry point for the file '${uri?.fsPath ?? "N/A"}' to start emit.`);
    return;
  }

  logger.info("Collecting emitters...", [], {
    showOutput: false,
    showPopup: false,
    progress: overallProgress,
  });
  const recommended: EmitPackageQuickPickItem[] = [...recommendedEmitters];
  const toQuickPickItem = (
    packageName: string,
    picked: boolean,
    fromConfig: boolean,
  ): EmitPackageQuickPickItem => {
    const found = recommended.findIndex((ke) => ke.package === packageName);
    if (found >= 0) {
      const deleted = recommended.splice(found, 1);
      deleted[0].picked = picked;
      return { ...deleted[0], ...{ picked, fromConfig } };
    } else {
      return { package: packageName, label: packageName, picked, fromConfig };
    }
  };
  const emitOnlyInOptions = Object.keys(config.options ?? {})
    .filter((key) => !config.emit?.includes(key))
    .map((e) => toQuickPickItem(e, false, true));
  const emitInEmit = (config.emit ?? []).map((e: any) => toQuickPickItem(e.toString(), true, true));

  const all = [...emitInEmit, ...emitOnlyInOptions];

  if (recommended.length > 0) {
    all.push({
      package: "",
      label: "Recommended Emitters",
      kind: QuickPickItemKind.Separator,
      fromConfig: false,
    });
  }
  recommended.forEach((e) => {
    all.push(e);
  });

  let selectedEmitters = await vscode.window.showQuickPick<EmitPackageQuickPickItem>(all, {
    canPickMany: true,
    placeHolder: "Select emitters to run",
  });

  if (!selectedEmitters || selectedEmitters.length === 0) {
    logger.info("No emitters selected. Emit canceled.", [], {
      showOutput: false,
      showPopup: true,
      progress: overallProgress,
    });
    return;
  }

  const TO_BE_COMMENTED = "___to_be_commented___";
  const NEWLINE = "___newline___";
  const basedir = dirname(startFile);
  const allSupported = {} as Record<string, Record<string, string>>;
  const ignoredEmitters: EmitPackageQuickPickItem[] = [];
  for (const e of selectedEmitters) {
    let checkPackage = true;
    let cancelled = false;
    while (checkPackage) {
      checkPackage = false;
      await ensureNpmPackageInstalled(e.package, undefined, dirname(uri.fsPath), async () => {
        const options = {
          ok: `OK (install ${e.package} by 'npm install'`,
          recheck: `Check again (install ${e.package} manually)`,
          ignore: `Ignore emitter ${e.label}`,
          cancel: "Cancel",
        };
        const selected = await vscode.window.showQuickPick(Object.values(options), {
          canPickMany: false,
          ignoreFocusOut: true,
          placeHolder: `Package '${e.package}' needs to be installed for emitting`,
          title: `TypeSpec Emit...`,
        });

        if (selected === options.ok) {
          logger.info(`installing ${e.package}...`, [], {
            showOutput: true,
            showPopup: false,
            progress: overallProgress,
          });
          return "install";
        } else if (selected === options.recheck) {
          checkPackage = true;
          return "skip";
        } else if (selected === options.ignore) {
          ignoredEmitters.push(e);
          logger.info(`ignore ${e.package}`, [], {
            showOutput: true,
            showPopup: false,
            progress: overallProgress,
          });
          return "skip";
        } else if (selected === options.cancel || !selected) {
          cancelled = true;
          logger.info(`Operation canceled by user`, [], {
            showOutput: true,
            showPopup: false,
            progress: overallProgress,
          });
          return "skip";
        } else {
          logger.error(
            `Unexpected selected value for installing package ${e.package}: ${selected}`,
            [],
            {
              showOutput: false,
              showPopup: false,
            },
          );
          cancelled = true;
          return "skip";
        }
      });
      if (cancelled) {
        return;
      }
    }
    if (!e.fromConfig && !ignoredEmitters.includes(e)) {
      const supported =
        (await loadEmitterOptions(
          basedir,
          e.package,
          (key) => `${TO_BE_COMMENTED}${key}`,
          (value) => value.replaceAll("\n", NEWLINE),
        )) ?? ({} as Record<string, string>);
      if (supported) allSupported[e.package] = supported;
    }
  }

  let configFile = config.config;
  if (!configFile) {
    configFile = join(basedir, "tspconfig.yaml");
    const s = await vscode.window.showQuickPick(["Yes", "Cancel"], {
      canPickMany: false,
      ignoreFocusOut: true,
      title: "TypeSpec Emit...",
      placeHolder: `tspconfig.yaml not found. Create one at ${configFile}?`,
    });

    if (s === "Yes") {
      fs.writeFileSync(configFile, "options:\n");
    } else {
      logger.info("Operation canceled by user", [], {
        showOutput: false,
        showPopup: false,
        progress: overallProgress,
      });
      return;
    }
  }

  selectedEmitters = selectedEmitters.filter((e) => !ignoredEmitters.includes(e));
  logger.info("Updating config...", [], {
    showOutput: false,
    showPopup: false,
    progress: overallProgress,
  });
  let doc: any = {};
  if (Object.keys(allSupported).length > 0) {
    const buffer = fs.readFileSync(configFile);
    const content = buffer.toString().trim();
    const lines = content.split("\n");
    const commentOnlyFile = lines.every((l) => l.trim().startsWith("#"));

    if (content.length === 0 || commentOnlyFile) {
      doc.options = allSupported;
    } else {
      doc = YAML.parse(content);
      if (!doc) {
        logger.warning("Failed to parse tspconfig.yaml. Please double check.", [], {
          showOutput: false,
          showPopup: false,
        });
        doc = {};
      }
      if (!doc["options"]) {
        doc["options"] = allSupported;
      } else {
        doc["options"] = { ...allSupported, ...doc["options"] };
      }
    }
    doc["emit"] = selectedEmitters.map((e) => e.package);
    let output = YAML.stringify(doc, undefined, { indent: 2, lineWidth: 0 });
    output = output.replaceAll(TO_BE_COMMENTED, "#").replaceAll(NEWLINE, "\n      # ");
    if (commentOnlyFile) {
      // remove emitter, options...
      output = content + "\n" + output;
    }
    fs.writeFileSync(configFile, output);
    logger.info(`Emitter config updated at ${configFile}`, [], {
      showOutput: false,
      showPopup: false,
    });
  }

  logger.info("Emitting...", [], {
    showOutput: false,
    showPopup: false,
    progress: overallProgress,
  });
  try {
    const compileOutput = await execCompile(cli, startFile);
    if (compileOutput && compileOutput?.exitCode === 0) {
      logger.info(compileOutput?.stdout);
      logger.info("Emitting finished successfully", [], {
        showOutput: false,
        showPopup: true,
        progress: overallProgress,
      });
    } else {
      if (compileOutput && compileOutput.stderr) {
        logger.error(compileOutput?.stderr);
      }
      logger.error("Emitting finished with error. Check the output for details", [compileOutput], {
        showOutput: false,
        showPopup: true,
        progress: overallProgress,
      });
    }
  } catch (e) {
    logger.error(`Emitting finished with error. Check the output for details`, [e], {
      showOutput: false,
      showPopup: true,
      progress: overallProgress,
    });
  }

  // const t = await createCompileTask(cli!, startFile);
  // spawnExecution(t?.execution.)
  // if (t) {
  //   executeVscodeTask(t).then(
  //     (value) => {
  //       logger.info("Emitting finished successfully", [], {
  //         showOutput: false,
  //         showPopup: true,
  //         progress: overallProgress,
  //       });
  //     },
  //     (reason) => {
  //       logger.error(`Error when emitting: ${reason}`, [], {
  //         showOutput: true,
  //         showPopup: true,
  //       });
  //       logger.info("Emitting finished with error. Check the output for details", [], {
  //         showOutput: false,
  //         showPopup: false,
  //         progress: overallProgress,
  //       });
  //     },
  //   );
  // }
}

async function showOpenApi3(context: vscode.ExtensionContext, uri: vscode.Uri) {
  let startFile: string | undefined = uri?.fsPath;
  if (!startFile) {
    startFile = await getMainTspFile();
    if (!startFile) {
      logger.error("No main.tsp file found in the workspace to generate OpenAPI3 document.");
      return;
    }
  } else {
    // TODO: try to update startfile to main file for better cache (but not needed if we use memory)
  }

  const dir = dirname(startFile);
  try {
    await ensureNpmPackageInstalled("@typespec/openapi3", undefined, dir, async () => {
      return "install";
    });
  } catch (e) {
    logger.error("Error when installing openapi3: \n" + JSON.stringify(e), [], {
      showOutput: true,
      showPopup: false,
    });
    return;
  }

  const root = vscode.Uri.joinPath(context.extensionUri, "openapi3_view");
  const panel = vscode.window.createWebviewPanel(
    "webview",
    "OpenAPI3 from Typespec",
    vscode.ViewColumn.Beside,
    {
      retainContextWhenHidden: true,
      enableScripts: true,
      localResourceRoots: [root],
    },
  );

  const bundleJs = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(root, "swagger-ui", "dist", "swagger-ui-bundle.js"),
  );
  const presetJs = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(root, "swagger-ui", "dist", "swagger-ui-standalone-preset.js"),
  );
  const initJs = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(root, "swagger-ui", "dist", "swagger-initializer.js"),
  );
  const css = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(root, "swagger-ui", "dist", "swagger-ui.css"),
  );

  // <html lang="en" data-bs-theme="vscode">
  panel.webview.html = `<!doctype html>
                        <html lang="en">
                          <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1">
                            <link rel="stylesheet" type="text/css" href="${css}" />
                          </head>
                          <body class="no-margin-padding full-device-view" style="background-color:white">
                            <div id="swagger-ui"></div>
                            <script src="${bundleJs}" charset="UTF-8"> </script>
                            <script src="${presetJs}" charset="UTF-8"> </script>
                            <script src="${initJs}" charset="UTF-8"> </script>
                          </body>
                        </html>`;

  let tmpFolder = openApi3FileCache.get(startFile);
  if (!tmpFolder) {
    tmpFolder = createTempDir();
    openApi3FileCache.set(startFile, tmpFolder);
  }

  const loadHandler = async () => {
    const result = await client?.sendRequest<{ hasError: boolean; diagnostics: string }>(
      "custom/compile",
      {
        doc: { uri: uri.toString() },
        options: {
          options: {
            "@typespec/openapi3": {
              "emitter-output-dir": tmpFolder,
              "file-type": "json",
            },
          },
          emit: ["@typespec/openapi3"],
          outputDir: tmpFolder,
          noEmit: false,
        },
      },
    );
    if ((result?.hasError ?? true) === true) {
      void panel.webview.postMessage({
        command: "diagnostics",
        param: result?.diagnostics ?? "no diagnostics info",
      });
    } else {
      const outputs = fs.readdirSync(tmpFolder);
      if (outputs.length === 0) {
        void panel.webview.postMessage({
          command: "diagnostics",
          param: "No openApi3 files generated.",
        });
      } else {
        const first = outputs[0];
        const fileContent = fs.readFileSync(join(tmpFolder, first), "utf-8");
        // BETTER ERROR HANDLING
        const content = JSON.parse(fileContent);
        void panel.webview.postMessage({ command: "load", param: content });
      }
    }
  };
  setTimeout(async () => {
    await loadHandler();
  }, 200);

  const watch = vscode.workspace.createFileSystemWatcher("**/*.{tsp,ts}");
  watch.onDidChange(async (e) => {
    await loadHandler();
  });
  watch.onDidCreate(async (e) => {
    await loadHandler();
  });
  watch.onDidDelete(async (e) => {
    await loadHandler();
  });
  panel.onDidDispose(() => {
    watch.dispose();
  });
}

function createTaskProvider() {
  return vscode.tasks.registerTaskProvider("typespec", {
    provideTasks: async () => {
      logger.info("Providing tsp tasks");
      const targetPathes = await vscode.workspace
        .findFiles("**/main.tsp", "**/node_modules/**")
        .then((uris) =>
          uris
            .filter((uri) => uri.scheme === "file" && !uri.fsPath.includes("node_modules"))
            .map((uri) => normalizeSlash(uri.fsPath)),
        );
      logger.info(`Found ${targetPathes.length} main.tsp files`);
      const tasks: vscode.Task[] = [];
      for (const targetPath of targetPathes) {
        tasks.push(...(await createBuiltInTasks(targetPath)));
      }
      logger.info(`Provided ${tasks.length} tsp tasks`);
      return tasks;
    },
    resolveTask: async (task: vscode.Task): Promise<vscode.Task | undefined> => {
      if (task.definition.type === "typespec" && task.name && task.definition.path) {
        const t = await createTask(task.name, task.definition.path, task.definition.args);
        if (t) {
          // returned task's definition must be the same object as the given task's definition
          // otherwise vscode would report error that the task is not resolved
          t.definition = task.definition;
          return t;
        } else {
          return undefined;
        }
      }
      return undefined;
    },
  });
}

function getTaskPath(targetPath: string): { absoluteTargetPath: string; workspaceFolder: string } {
  let workspaceFolder = workspace.getWorkspaceFolder(vscode.Uri.file(targetPath))?.uri.fsPath;
  if (!workspaceFolder) {
    workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    logger.warning(
      `Can't resolve workspace folder from given file ${targetPath}. Try to use the first workspace folder ${workspaceFolder}.`,
    );
  }
  const variableResolver = new VSCodeVariableResolver({
    workspaceFolder,
    workspaceRoot: workspaceFolder, // workspaceRoot is deprecated but we still support it for backwards compatibility.
  });
  targetPath = variableResolver.resolve(targetPath);
  targetPath = resolve(workspaceFolder, targetPath);
  targetPath = normalizeSlash(variableResolver.resolve(targetPath));
  return { absoluteTargetPath: targetPath, workspaceFolder };
}

function createTaskInternal(
  name: string,
  absoluteTargetPath: string,
  args: string,
  cli: Executable,
  workspaceFolder: string,
) {
  let cmd = `${cli.command} ${cli.args?.join(" ") ?? ""} compile "${absoluteTargetPath}" ${args}`;
  const variableResolver = new VSCodeVariableResolver({
    workspaceFolder,
    workspaceRoot: workspaceFolder, // workspaceRoot is deprecated but we still support it for backwards compatibility.
  });
  cmd = variableResolver.resolve(cmd);
  logger.debug(
    `Command of tsp compile task "${name}" is resolved to: ${cmd} with cwd "${workspaceFolder}"`,
  );
  return new vscode.Task(
    {
      type: "typespec",
      path: absoluteTargetPath,
      args: args,
    },
    vscode.TaskScope.Workspace,
    name,
    "tsp",
    workspaceFolder
      ? new vscode.ShellExecution(cmd, { cwd: workspaceFolder })
      : new vscode.ShellExecution(cmd),
  );
}

async function createTask(name: string, targetPath: string, args?: string) {
  const { absoluteTargetPath, workspaceFolder } = getTaskPath(targetPath);
  const cli = await resolveTypeSpecCli(absoluteTargetPath);
  if (!cli) {
    return undefined;
  }
  return await createTaskInternal(name, absoluteTargetPath, args ?? "", cli, workspaceFolder);
}

async function createBuiltInTasks(targetPath: string): Promise<vscode.Task[]> {
  const { absoluteTargetPath, workspaceFolder } = getTaskPath(targetPath);
  const cli = await resolveTypeSpecCli(absoluteTargetPath);
  if (!cli) {
    return [];
  }
  return [
    { name: `compile - ${targetPath}`, args: "" },
    { name: `watch - ${targetPath}`, args: "--watch" },
  ].map(({ name, args }) => {
    return createTaskInternal(name, absoluteTargetPath, args, cli, workspaceFolder);
  });
}

async function restartTypeSpecServer(): Promise<void> {
  if (client) {
    await client.stop();
    await client.start();
    logger.debug("TypeSpec server restarted");
  }
}

async function launchLanguageClient(context: ExtensionContext) {
  const exe = await resolveTypeSpecServer(context);
  logger.debug("TypeSpec server resolved as ", [exe]);
  const options: LanguageClientOptions = {
    synchronize: {
      // Synchronize the setting section 'typespec' to the server
      configurationSection: "typespec",
      fileEvents: [
        workspace.createFileSystemWatcher("**/*.cadl"),
        workspace.createFileSystemWatcher("**/cadl-project.yaml"),
        workspace.createFileSystemWatcher("**/*.tsp"),
        workspace.createFileSystemWatcher("**/tspconfig.yaml"),
        workspace.createFileSystemWatcher("**/package.json"),
      ],
    },
    documentSelector: [
      { scheme: "file", language: "typespec" },
      { scheme: "untitled", language: "typespec" },
    ],
    outputChannel,
  };

  const name = "TypeSpec";
  const id = "typespec";
  try {
    client = new LanguageClient(id, name, { run: exe, debug: exe }, options);
    await client.start();
    logger.debug("TypeSpec server started");
  } catch (e) {
    if (typeof e === "string" && e.startsWith("Launching server using command")) {
      const workspaceFolder = workspace.workspaceFolders?.[0]?.uri?.fsPath ?? "";

      logger.error(
        [
          `TypeSpec server executable was not found: '${exe.command}' is not found. Make sure either:`,
          ` - TypeSpec is installed locally at the root of this workspace ("${workspaceFolder}") or in a parent directory.`,
          " - TypeSpec is installed globally with `npm install -g @typespec/compiler'.",
          " - TypeSpec server path is configured with https://github.com/microsoft/typespec#installing-vs-code-extension.",
        ].join("\n"),
        [],
        { showOutput: false, showPopup: true },
      );
      logger.error("Error detail", [e]);
      throw `TypeSpec server executable was not found: '${exe.command}' is not found.`;
    } else {
      throw e;
    }
  }
}

/**
 *
 * @param absoluteTargetPath the path is expected to be absolute path and no further expanding or resolving needed.
 * @returns
 */
async function resolveTypeSpecCli(absoluteTargetPath: string): Promise<Executable | undefined> {
  if (!isAbsolute(absoluteTargetPath)) {
    logger.error(`Expect absolute path for resolving cli, but got ${absoluteTargetPath}`);
    return undefined;
  }

  const options: ExecutableOptions = {
    env: { ...process.env },
  };

  const baseDir = (await isFile(absoluteTargetPath))
    ? dirname(absoluteTargetPath)
    : absoluteTargetPath;

  const compilerPath = await resolveLocalCompiler(baseDir);
  if (!compilerPath || compilerPath.length === 0) {
    const executable = process.platform === "win32" ? `tsp.cmd` : "tsp";
    logger.debug(
      `Can't resolve compiler path for tsp task, try to use default value ${executable}.`,
    );
    return { command: executable, args: [], options };
  } else {
    logger.debug(`Compiler path resolved as: ${compilerPath}`);
    const jsPath = join(compilerPath, "cmd/tsp.js");
    options.env["TYPESPEC_SKIP_COMPILER_RESOLVE"] = "1";
    return { command: "node", args: [jsPath], options };
  }
}

async function resolveTypeSpecServer(context: ExtensionContext): Promise<Executable> {
  const nodeOptions = process.env.TYPESPEC_SERVER_NODE_OPTIONS;
  const args = ["--stdio"];

  // In development mode (F5 launch from source), resolve to locally built server.js.
  if (process.env.TYPESPEC_DEVELOPMENT_MODE) {
    const script = context.asAbsolutePath("../compiler/entrypoints/server.js");
    // we use CLI instead of NODE_OPTIONS environment variable in this case
    // because --nolazy is not supported by NODE_OPTIONS.
    const options = nodeOptions?.split(" ").filter((o) => o) ?? [];
    logger.debug("TypeSpec server resolved in development mode");
    return { command: "node", args: [...options, script, ...args] };
  }

  const options: ExecutableOptions = {
    env: { ...process.env },
  };
  if (nodeOptions) {
    options.env.NODE_OPTIONS = nodeOptions;
  }

  // In production, first try VS Code configuration, which allows a global machine
  // location that is not on PATH, or a workspace-specific installation.
  let serverPath: string | undefined = workspace.getConfiguration().get("typespec.tsp-server.path");
  if (serverPath && typeof serverPath !== "string") {
    throw new Error("VS Code configuration option 'typespec.tsp-server.path' must be a string");
  }
  const workspaceFolder = workspace.workspaceFolders?.[0]?.uri?.fsPath ?? "";

  // Default to tsp-server on PATH, which would come from `npm install -g
  // @typespec/compiler` in a vanilla setup.
  if (serverPath) {
    logger.debug(`Server path loaded from VS Code configuration: ${serverPath}`);
  } else {
    serverPath = await resolveLocalCompiler(workspaceFolder);
  }
  if (!serverPath) {
    const executable = process.platform === "win32" ? "tsp-server.cmd" : "tsp-server";
    logger.debug(`Can't resolve server path, try to use default value ${executable}.`);
    return { command: executable, args, options };
  }
  const variableResolver = new VSCodeVariableResolver({
    workspaceFolder,
    workspaceRoot: workspaceFolder, // workspaceRoot is deprecated but we still support it for backwards compatibility.
  });

  serverPath = variableResolver.resolve(serverPath);
  logger.debug(`Server path expanded to: ${serverPath}`);

  if (!serverPath.endsWith(".js")) {
    // Allow path to tsp-server.cmd to be passed.
    if (await isFile(serverPath)) {
      const command =
        process.platform === "win32" && !serverPath.endsWith(".cmd")
          ? `${serverPath}.cmd`
          : "tsp-server";

      return { command, args, options };
    } else {
      serverPath = join(serverPath, "cmd/tsp-server.js");
    }
  }

  options.env["TYPESPEC_SKIP_COMPILER_RESOLVE"] = "1";
  return { command: "node", args: [serverPath, ...args], options };
}

async function resolveLocalCompiler(baseDir: string): Promise<string | undefined> {
  // dynamic import required when unbundled as this module is CommonJS for
  // VS Code and the module-resolver is an ES module.
  const { resolveModule } = await import("@typespec/compiler/module-resolver");

  const host: ResolveModuleHost = {
    realpath,
    readFile: (path: string) => readFile(path, "utf-8"),
    stat,
  };
  try {
    logger.debug(`Try to resolve compiler from local, baseDir: ${baseDir}`);
    const executable = await resolveModule(host, "@typespec/compiler", {
      baseDir,
    });
    if (executable.type === "module") {
      logger.debug(`Resolved compiler from local: ${executable.path}`);
      return executable.path;
    } else {
      logger.debug(
        `Failed to resolve compiler from local. Unexpected executable type: ${executable.type}`,
      );
    }
  } catch (e) {
    // Couldn't find the module
    logger.debug("Exception when resolving compiler from local", [e]);
    return undefined;
  }
  return undefined;
}

async function isFile(path: string) {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function deactivate() {
  await client?.stop();
  openApi3FileCache.forEach((value, key) => {
    try {
      fs.rmSync(value);
    } catch (e) {}
  });
}

/**
 * Resolve some of the VSCode variables.
 * Simpler aLternative until https://github.com/microsoft/vscode/issues/46471 is supported.
 */
class VSCodeVariableResolver {
  static readonly VARIABLE_REGEXP = /\$\{([^{}]+?)\}/g;

  public constructor(private variables: Record<string, string>) {}

  public resolve(value: string): string {
    const replaced = value.replace(
      VSCodeVariableResolver.VARIABLE_REGEXP,
      (match: string, variable: string) => {
        return this.variables[variable] ?? match;
      },
    );

    return replaced;
  }
}
