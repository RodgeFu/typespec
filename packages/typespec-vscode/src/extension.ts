import { CompileContext } from "@typespec/compiler";
import { ResolveModuleHost } from "@typespec/compiler/module-resolver";
import fs from "fs";
import { readFile, realpath, stat } from "fs/promises";
import path, { dirname, join } from "path";
import { pathToFileURL } from "url";
import vscode, {
  commands,
  ExtensionContext,
  QuickPickItem,
  QuickPickItemKind,
  workspace,
} from "vscode";
import {
  Executable,
  ExecutableOptions,
  LanguageClient,
  LanguageClientOptions,
} from "vscode-languageclient/node.js";
import YAML from "yaml";
import { createExtensionLogger } from "./extension-logger.js";
import { createNpmUtil } from "./npm-util.js";
import { TypeSpecLogOutputChannel } from "./typespec-log-output-channel.js";

let client: LanguageClient | undefined;
let serverVersion: string = "";
/**
 * Workaround: LogOutputChannel doesn't work well with LSP RemoteConsole, so having a customized LogOutputChannel to make them work together properly
 * More detail can be found at https://github.com/microsoft/vscode-discussions/discussions/1149
 */
const outputChannel = new TypeSpecLogOutputChannel("TypeSpec");
export const logger = createExtensionLogger(outputChannel);
let cli: Executable | undefined = undefined;

export async function activate(context: ExtensionContext) {
  cli = await resolveTypeSpecCli(context);
  context.subscriptions.push(
    commands.registerCommand("typespec.showOutputChannel", () => {
      outputChannel.show(true /*preserveFocus*/);
    })
  );

  context.subscriptions.push(
    commands.registerCommand("typespec.restartServer", restartTypeSpecServer)
  );

  const taskProvider = vscode.tasks.registerTaskProvider("typespec", {
    provideTasks: () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const result: vscode.Task[] = [];
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return result;
      }
      for (const workspaceFolder of workspaceFolders) {
        const folderString = workspaceFolder.uri.fsPath;
        if (!folderString) {
          continue;
        }
        const mainFile = path.join(folderString, "main.tsp");
        if (!fs.existsSync(mainFile)) {
          continue;
        }

        const task = createCompileTask(mainFile);
        if (task) {
          result.push(task);
        }
      }
      return result;
    },
    resolveTask: (task: vscode.Task): vscode.Task | undefined => {
      return undefined;
    },
  });

  context.subscriptions.push(
    commands.registerCommand("typespec.emit", async (uri: vscode.Uri) => await doEmit(context, uri))
  );

  context.subscriptions.push(
    commands.registerCommand("typespec.genTypeSpecDoc", async (uri: vscode.Uri) => {
      await startWebview(context, uri);
    })
  );

  return await vscode.window.withProgress(
    {
      title: "Launching TypeSpec language service...",
      location: vscode.ProgressLocation.Notification,
    },
    async () => launchLanguageClient(context)
  );
}

interface EmitPackageQuickPickItem extends QuickPickItem {
  package: string;
  fromConfig: boolean;
}

async function doEmit(context: ExtensionContext, uri: vscode.Uri) {
  // also load recommendation from .vscode
  const recommendedEmitters: EmitPackageQuickPickItem[] = [
    {
      package: "@typespec/openapi3",
      label: "emit OpenAPI 3.0",
      description: "from @typespec/openapi3",
      fromConfig: false,
    },
    {
      package: "@typespec/json-schema",
      label: "emit JSON Schema",
      description: "from @typespec/json-schema",
      fromConfig: false,
    },
    {
      package: "@typespec/protobuf",
      label: "emit Protobuf",
      description: "from @typespec/protobuf",
      fromConfig: false,
    },
    {
      package: "@azure-tools/typespec-csharp",
      label: "emit C# code",
      description: "from @azure-tools/typespec-csharp",
      fromConfig: false,
    },
  ];

  const hasCompileError = await client?.sendRequest("custom/compile/has-error", {
    doc: { uri: uri.toString() },
    additionalOptions: {},
  });
  if (hasCompileError) {
    logger.error("Compilation failed. Please fix it first.", false, true);
    void vscode.commands.executeCommand("workbench.actions.view.problems");
    return;
  }
  const cc = (await client?.sendRequest("custom/compileContext", {
    uri: uri.toString(),
  })) as any as CompileContext;

  const toQuickPickItem = (
    e: string,
    picked: boolean,
    fromConfig: boolean
  ): EmitPackageQuickPickItem => {
    const found = recommendedEmitters.findIndex((ke) => ke.package === e);
    if (found >= 0) {
      const deleted = recommendedEmitters.splice(found, 1);
      deleted[0].picked = picked;
      return { ...deleted[0], ...{ picked, fromConfig } };
    } else {
      return { package: e, label: e, picked, fromConfig };
    }
  };

  const basedir = await getDirectoryPathProxy(cc.mainFile);
  const emitOnlyInOptions = Object.keys(cc.config.options ?? {})
    .filter((key) => !cc.config.emit?.includes(key))
    .map((e) => toQuickPickItem(e, false, true));
  const emitInEmit = (cc.config.emit ?? []).map((e) => toQuickPickItem(e, true, true));

  const all = [...emitInEmit, ...emitOnlyInOptions];

  if (recommendedEmitters.length > 0) {
    all.push({
      package: "",
      label: "Recommended Emitters",
      kind: QuickPickItemKind.Separator,
      fromConfig: false,
    });
  }
  recommendedEmitters.forEach((e) => {
    all.push(e);
  });

  const selectedEmitters = await vscode.window.showQuickPick(all, {
    canPickMany: true,
    placeHolder: "Select emitters to run",
  });
  const TO_BE_COMMENTED = "___to_be_commented___";
  const NEWLINE = "___newline___";
  if (selectedEmitters && selectedEmitters.length > 0) {
    outputChannel.show();
    const allSupported = {} as Record<string, Record<string, string>>;
    for (const e of selectedEmitters) {
      await ensureNpmPackageInstalled(e.package, dirname(uri.fsPath));
      if (!e.fromConfig) {
        const emitter = await resolveEmitter(basedir, e.package);
        const supported = {} as Record<string, string>;
        supported["emitter-output-dir"] = "{output-dir}/{emitter-name}";
        const optionSchema = emitter?.$lib?.emitter.options;
        if (optionSchema) {
          Object.entries(optionSchema.properties).forEach(([key, value]) => {
            supported[TO_BE_COMMENTED + key] = (
              (value as any)?.description ?? "no description"
            ).replaceAll("\n", NEWLINE);
          });
        }
        allSupported[e.package] = supported;
      }
    }
    if (cc.configFile && Object.keys(allSupported).length > 0) {
      const content = fs.readFileSync(cc.configFile);
      const doc = YAML.parse(content.toString());
      if (!doc["options"]) {
        doc["options"] = allSupported;
      } else {
        doc["options"] = { ...allSupported, ...doc["options"] };
      }
      let output = YAML.stringify(doc, undefined, { indent: 2, lineWidth: 0 });
      output = output.replaceAll(TO_BE_COMMENTED, "#").replaceAll(NEWLINE, "\n      # ");
      fs.writeFileSync(cc.configFile, output);
    } else {
      logger.warning("No tspconfig.yaml found to save the emitters", false, true);
    }
  }
  const t = createCompileTask(cc.mainFile);
  if (t) {
    await vscode.tasks.executeTask(t);
  }
  void vscode.window.showInformationMessage(`Action: next step`);
}

function createCompileTask(mainFile: string) {
  if (cli === undefined) {
    logger.error("Failed to create compile task: cli is undefined", false, true);
    return undefined;
  }
  const cmd = `${cli.command} ${cli.args?.join(" ") ?? ""} compile "${mainFile}"`;
  const cwd = path.dirname(mainFile);
  logger.debug(`tsp compile task created '${mainFile}' with command: '${cmd}' in cwd: '${cwd}'`);
  return new vscode.Task(
    {
      type: "typespec",
      mainFile: mainFile,
    },
    vscode.TaskScope.Workspace,
    `${mainFile}`,
    "tsp:compile",
    new vscode.ShellExecution(cmd, { cwd })
  );
}

async function startWebview(context: vscode.ExtensionContext, uri: vscode.Uri) {
  // const libraries = [
  //   "@typespec/compiler",
  //   "@typespec/http",
  //   "@typespec/rest",
  //   "@typespec/openapi",
  //   "@typespec/versioning",
  //   "@typespec/openapi3",
  //   "@typespec/json-schema",
  //   "@typespec/protobuf",
  // ];
  // const importConfig = {
  //   useShim: false
  // };

  // const host = NodeHost;

  //const host = await createBrowserHost(libraries, importConfig);

  // TODO: click on main.tsp please
  // const program = await compile(host, uri.fsPath, {
  //   noEmit: true
  //   }
  //   // outputDir: "tsp-output",
  //   // emit: selectedEmitter ? [selectedEmitter] : [],
  // );

  const root = vscode.Uri.joinPath(context.extensionUri, "dist", "webview");
  const panel = vscode.window.createWebviewPanel("webview", "React", vscode.ViewColumn.Beside, {
    retainContextWhenHidden: true,
    enableScripts: true,
    localResourceRoots: [root],
  });

  //web is for my react root directory, rename for yours
  const scriptSrc = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, "bundled.js"));

  // <html lang="en" data-bs-theme="vscode">
  panel.webview.html = `<!doctype html>
                        <html lang="en">
                          <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1">
                          </head>
                          <body class="no-margin-padding full-device-view">
                            <script>var exports = {};</script>
                            <div class="no-margin-padding h-100" id="root"></div>
                            <script src="${scriptSrc}"></script>
                          </body>
                        </html>`;

  // const cc = (await client?.sendRequest("custom/compileContext", {
  //   uri: uri.toString(),
  // })) as any as CompileContext;

  const dir = dirname(uri.fsPath);
  try {
    await ensureTypeSpecNpmPackageInstalled("@typespec/openapi3", dir);
  } catch (e) {
    void vscode.window.showErrorMessage("Error when installing openapi3: \n" + JSON.stringify(e));
    return;
  }

  const loadHandler = async () => {
    const result = (await client?.sendRequest<string>("custom/requestProgram", {
      uri: uri.toString(),
    })) as any as Record<string, string>;
    const first = result[Object.keys(result).filter((k) => k !== "diagnostics")[0]];
    if (first) {
      void panel.webview.postMessage({ command: "load", param: first });
    } else if ("diagnostics" in result) {
      const d = result.diagnostics;
      void panel.webview.postMessage({ command: "diagnostics", param: d });
    }
  };
  setTimeout(async () => {
    await loadHandler();
  }, 1000);

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
}

async function restartTypeSpecServer(): Promise<void> {
  if (client) {
    await client.stop();
    await client.start();
    outputChannel.debug("TypeSpec server restarted");
  }
}

async function launchLanguageClient(context: ExtensionContext) {
  const exe = await resolveTypeSpecServer(context);
  outputChannel.debug("TypeSpec server resolved as ", exe);
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
    serverVersion = (await client.sendRequest("custom/version")) as string;
    outputChannel.debug("TypeSpec server started, version: ", serverVersion);
  } catch (e) {
    if (typeof e === "string" && e.startsWith("Launching server using command")) {
      const workspaceFolder = workspace.workspaceFolders?.[0]?.uri?.fsPath ?? "";

      outputChannel.error(
        [
          `TypeSpec server executable was not found: '${exe.command}' is not found. Make sure either:`,
          ` - TypeSpec is installed locally at the root of this workspace ("${workspaceFolder}") or in a parent directory.`,
          " - TypeSpec is installed globally with `npm install -g @typespec/compiler'.",
          " - TypeSpec server path is configured with https://github.com/microsoft/typespec#installing-vs-code-extension.",
        ].join("\n")
      );
      outputChannel.error("Error detail", e);
      throw `TypeSpec server executable was not found: '${exe.command}' is not found.`;
    } else {
      throw e;
    }
  }
}

async function resolveTypeSpecCli(context: ExtensionContext): Promise<Executable> {
  const nodeOptions = process.env.TYPESPEC_CLI_NODE_OPTIONS;
  const args: string[] = [];

  // In development mode (F5 launch from source), resolve to locally built server.js.
  if (process.env.TYPESPEC_DEVELOPMENT_MODE) {
    const script = context.asAbsolutePath("../compiler/entrypoints/cli.js");
    // we use CLI instead of NODE_OPTIONS environment variable in this case
    // because --nolazy is not supported by NODE_OPTIONS.
    const options = nodeOptions?.split(" ").filter((o) => o) ?? [];
    outputChannel.debug("TypeSpec cli resolved in development mode");
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
    outputChannel.debug(
      `Server path loaded from VS Code configuration for cli parsing: ${serverPath}`
    );
  } else {
    serverPath = await resolveLocalCompiler(workspaceFolder);
  }
  if (!serverPath) {
    const executable = process.platform === "win32" ? "tsp.cmd" : "tsp";
    outputChannel.debug(
      `Can't resolve server path, try to use default value for cli: ${executable}.`
    );
    return { command: executable, args, options };
  }
  const variableResolver = new VSCodeVariableResolver({
    workspaceFolder,
    workspaceRoot: workspaceFolder, // workspaceRoot is deprecated but we still support it for backwards compatibility.
  });

  serverPath = variableResolver.resolve(serverPath);
  let cliPath = serverPath.replace("tsp-server", "tsp");
  outputChannel.debug(`Cli path expanded to: ${cliPath}`);

  if (!cliPath.endsWith(".js")) {
    // Allow path to tsp-server.cmd to be passed.
    if (await isFile(cliPath)) {
      const command =
        process.platform === "win32" && !cliPath.endsWith(".cmd") ? `${cliPath}.cmd` : "tsp";

      return { command, args, options };
    } else {
      cliPath = join(cliPath, "cmd/tsp.js");
    }
  }

  options.env["TYPESPEC_SKIP_COMPILER_RESOLVE"] = "1";
  return { command: "node", args: [cliPath, ...args], options };
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
    outputChannel.debug("TypeSpec server resolved in development mode");
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
    outputChannel.debug(`Server path loaded from VS Code configuration: ${serverPath}`);
  } else {
    serverPath = await resolveLocalCompiler(workspaceFolder);
  }
  if (!serverPath) {
    const executable = process.platform === "win32" ? "tsp-server.cmd" : "tsp-server";
    outputChannel.debug(`Can't resolve server path, try to use default value ${executable}.`);
    return { command: executable, args, options };
  }
  const variableResolver = new VSCodeVariableResolver({
    workspaceFolder,
    workspaceRoot: workspaceFolder, // workspaceRoot is deprecated but we still support it for backwards compatibility.
  });

  serverPath = variableResolver.resolve(serverPath);
  outputChannel.debug(`Server path expanded to: ${serverPath}`);

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

async function resolveEmitter(
  baseDir: string,
  packageNameOrPath: string
): Promise<Record<string, any> | undefined> {
  const { resolveModule } = await import("@typespec/compiler/module-resolver");

  const host: ResolveModuleHost = {
    realpath,
    readFile: (path: string) => readFile(path, "utf-8"),
    stat,
  };
  try {
    outputChannel.debug(
      `Try to resolve emitter ${packageNameOrPath} from local, baseDir: ${baseDir}`
    );
    const module = await resolveModule(host, packageNameOrPath, {
      baseDir,
    });
    const entrypoint = module.type === "file" ? module.path : module.mainFile;
    const path = pathToFileURL(entrypoint).href;
    const exports = await import(path);

    return exports;
  } catch (e) {
    outputChannel.debug("Exception when resolving emitter from local", e);
    return undefined;
  }
}

async function getDirectoryPathProxy(filePath: string): Promise<string> {
  const { getDirectoryPath } = await import("@typespec/compiler/path-utils");
  return getDirectoryPath(filePath);
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
    outputChannel.debug(`Try to resolve compiler from local, baseDir: ${baseDir}`);
    const executable = await resolveModule(host, "@typespec/compiler", {
      baseDir,
    });
    if (executable.type === "module") {
      outputChannel.debug(`Resolved compiler from local: ${executable.path}`);
      return executable.path;
    } else {
      outputChannel.debug(
        `Failed to resolve compiler from local. Unexpected executable type: ${executable.type}`
      );
    }
  } catch (e) {
    // Couldn't find the module
    outputChannel.debug("Exception when resolving compiler from local", e);
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
}

/**
 * Resolve some of the VSCode variables.
 * Simpler aLternative until https://github.com/microsoft/vscode/issues/46471 is supported.
 */
class VSCodeVariableResolver {
  static readonly VARIABLE_REGEXP = /\$\{(.*?)\}/g;

  public constructor(private variables: Record<string, string>) {}

  public resolve(value: string): string {
    const replaced = value.replace(
      VSCodeVariableResolver.VARIABLE_REGEXP,
      (match: string, variable: string) => {
        return this.variables[variable] ?? match;
      }
    );

    return replaced;
  }
}

/**
 * Try to install the npm package with a compatible version of the compiler
 * @param packageName the npm package name without version
 * @param dir
 * @returns
 */
export async function ensureNpmPackageInstalled(packageName: string, dir: string) {
  logger.info(`Installing package ${packageName}...`);
  // more thought needed on how to make sure this will be
  // compatible with other installed emitter (especially for the compiler version)
  if (packageName.startsWith("@typespec")) {
    await ensureTypeSpecNpmPackageInstalled(packageName, dir);
  }
  const toOutput = (str: string) => {
    logger.info(str);
  };
  const toError = (str: string) => {
    logger.error(str, true);
  };
  const npm = createNpmUtil(dir);
  await npm.install(packageName, [], {
    onStdioOut: toOutput,
    onStdioError: toError,
    onExit(code) {
      if (code !== 0) {
        logger.error(`Failed to install package ${packageName}`, true, true);
      } else {
        logger.info(`Package ${packageName} installed successfully`);
      }
    },
  });
}

/**
 * Try to install the npm package with a compatible version of the compiler
 * @param packageName the npm package name without version
 * @param dir
 * @returns
 */
export async function ensureTypeSpecNpmPackageInstalled(packageName: string, dir: string) {
  if (!packageName.startsWith("@typespec")) {
    throw Error(
      `package name ${packageName} doesn't start with @typespec, @typespec/... package expected.`
    );
  }
  if (packageName.indexOf("@", 1) >= 1) {
    throw Error(`package name ${packageName} shouldn't contain version`);
  }

  const toOutput = (str: string) => {
    str
      .trim()
      .split("\n")
      .forEach((line) => {
        logger.info(line);
      });
  };
  const toError = (str: string) => {
    str
      .trim()
      .split("\n")
      .forEach((line) => {
        logger.error(line, true);
      });
  };

  const npm = createNpmUtil(dir);

  const packageInfo = await npm.list();
  if (!packageInfo) {
    throw new Error("Can't list installed npm packages");
  }
  const exist = packageInfo.findDependencyPackage(packageName);
  if (exist) {
    return;
  }
  const compiler = packageInfo.findDependencyPackage("@typespec/compiler");
  const targetVersion: string = compiler && compiler.version ? compiler.version : "latest";
  if (targetVersion === "latest") {
    await npm.install(packageName, [], { onStdioOut: toOutput, onStdioError: toError });
    return;
  }
  const availableVersions = await npm.viewPackageVersions(packageName, (v) => !v.includes("dev"));
  if (availableVersions.includes(targetVersion)) {
    await npm.install(`${packageName}@${targetVersion}`, [], {
      onStdioOut: toOutput,
      onStdioError: toError,
    });
  } else {
    // the compiler may have hotfix version which the target package doesn't have, so try the version without hotfix version which should always be available
    const arr = targetVersion.split(".");
    if (arr.length < 2) throw new Error("Invalid compiler version: " + targetVersion);
    const targetVersion2 = `${arr[0]}.${arr[1]}.0`;
    if (!availableVersions.includes(targetVersion2)) {
      throw new Error(
        `Can't find version ${targetVersion} or ${targetVersion2} for ${packageName}`
      );
    }
    await npm.install(`${packageName}@${targetVersion2}`, [], {
      onStdioOut: toOutput,
      onStdioError: toError,
      onExit(code) {
        if (code !== 0) {
          logger.error(`Failed to install package ${packageName}`, true, true);
        } else {
          logger.info(`Package ${packageName} installed successfully`);
        }
      },
    });
  }
}
