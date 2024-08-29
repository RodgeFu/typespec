import { CompileResultSlim } from "@typespec/compiler";
import { ResolveModuleHost } from "@typespec/compiler/module-resolver";
import fs from "fs";
import { readFile, realpath, stat } from "fs/promises";
import path, { dirname, join } from "path";
import vscode, { commands, ExtensionContext, QuickPickItem, QuickPickItemKind, workspace } from "vscode";
import {
  Executable,
  ExecutableOptions,
  LanguageClient,
  LanguageClientOptions
} from "vscode-languageclient/node.js";
import YAML from "yaml";
import logger from "./extension-logger.js";
import { TypeSpecLogOutputChannel } from "./typespec-log-output-channel.js";
import { createCompileTask, createWatchTask, ensureNpmPackageInstalled, getAllMainTspFiles, getMainTspFile, loadEmitterOptions, recommendedEmitters } from "./util-typespec.js";
import { createTempDir, executeVscodeTask } from "./util.js";

let client: LanguageClient | undefined;
/**
 * Workaround: LogOutputChannel doesn't work well with LSP RemoteConsole, so having a customized LogOutputChannel to make them work together properly
 * More detail can be found at https://github.com/microsoft/vscode-discussions/discussions/1149
 */
const outputChannel = new TypeSpecLogOutputChannel("TypeSpec");
logger.outputChannel = outputChannel;

const openApi3FileCache = new Map<string, string>();
let cli: Executable | undefined;

export async function activate(context: ExtensionContext) {
  cli = await resolveTypeSpecCli(context);
  
  const provider = vscode.tasks.registerTaskProvider("typespec", {
    provideTasks: async () => {
      if(!cli){
        logger.warning("TypeSpec CLI is not resolved to generate vscode Tasks. Please try again later. If the problem persists, please double check the configuration typespec.tsp-cli.path.");
        return [];
      }
      const mailFiles = await getAllMainTspFiles();
      const tasks: vscode.Task[] = [];
      mailFiles.forEach((f) => {
        const task = createCompileTask(cli!, f.fsPath);
        if(task){
          tasks.push(task);
        }
        const wTask = createWatchTask(cli!, f.fsPath);
        if(wTask){
          tasks.push(wTask);
        }
      })
      return tasks;
    },
    resolveTask: (task: vscode.Task): vscode.Task | undefined => {
      return undefined;
    },
  });

  context.subscriptions.push(provider);

  context.subscriptions.push(
    commands.registerCommand("typespec.showOutputChannel", () => {
      outputChannel.show(true /*preserveFocus*/);
    })
  );

  context.subscriptions.push(
    commands.registerCommand("typespec.restartServer", restartTypeSpecServer)
  );

  context.subscriptions.push(
    commands.registerCommand("typespec.showOpenApi3", async (uri: vscode.Uri) => {
      await showOpenApi3(context, uri);
    })
  );

  context.subscriptions.push(
    commands.registerCommand("typespec.compile", async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: "TypeSpec Compiling",
        cancellable: false,
      },
      async (progress) => {
        const uri = await getMainTspFile();
        if(!uri){
          logger.error("No main.tsp file found in the workspace to compile.");
          return;
        }
        const task = createCompileTask(cli!, uri);
        if(task)
          void executeVscodeTask(task);
        else
          logger.error("Failed to create compile task. Please try again later.", false, true);
      });
    })
  )

  context.subscriptions.push(
    commands.registerCommand("typespec.watch", async () => {
      const uri = await getMainTspFile();
      if(!uri){
        logger.error("No main.tsp file found in the workspace to watch.");
        return;
      }
      const task = createWatchTask(cli!, uri);
      if(task)
        void executeVscodeTask(task);
      else
        logger.error("Failed to create watch task. Please try again later.", false, true);
    })
  )

  context.subscriptions.push(
    commands.registerCommand("typespec.emit", async (uri: vscode.Uri) => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: "TypeSpec Emitting",
        cancellable: false,
      },
      async (progress) => await doEmit(context, uri, progress))
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

async function doEmit(context: vscode.ExtensionContext, uri: vscode.Uri, overallProgress: vscode.Progress<{ message?: string; increment?: number }>) {

  if(!cli){
    logger.error("TypeSpec CLI is not resolved to emit. Please try again later. If the problem persists, please double check the configuration typespec.tsp-cli.path.", false, true);
  }

  let startFile : string | undefined = uri?.fsPath
  if(!client){
    logger.error("TypeSpec server is not started. Please restart the server and try again.");
    return;
  }
  if(!startFile){
    startFile = await getMainTspFile();
    if(!startFile){
      logger.error("No main.tsp file found in the workspace to start emit.");
      return;
    }
    uri = vscode.Uri.file(startFile);
  }
  
  logger.info("Verify compilation...", false, false, overallProgress);
  const { hasError, entryPoint, options: config } = await client.sendRequest<CompileResultSlim>("custom/compile", {doc: {uri: uri.toString()}, options: {}});
  if(hasError){
    logger.error("Compilation failed. Please fix it first.", false, true);
    void vscode.commands.executeCommand("workbench.actions.view.problems");
    return;
  }
  if(!entryPoint || !config){
    logger.error("Failed to get entry point or config to compile.", false, true);
    return;
  }

  startFile = entryPoint;
  if(!startFile){
    logger.error(`Can't find entry point for the file '${uri?.fsPath ?? "N/A"}' to start emit.`);
    return;
  }

  logger.info("Collecting emitters...", false, false, overallProgress);
  const recommended: EmitPackageQuickPickItem[] = [...recommendedEmitters];
  const toQuickPickItem = (
    packageName: string,
    picked: boolean,
    fromConfig: boolean
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

  if(!selectedEmitters || selectedEmitters.length === 0){
    logger.info("No emitters selected. Emit canceled.", false, false, overallProgress);
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
    while(checkPackage){
      checkPackage = false;
      await ensureNpmPackageInstalled(e.package, undefined, dirname(uri.fsPath), 
      async () => {
        const options = {
          ok: `OK (install ${e.package} by 'node install'`,
          recheck: `Check again (${e.package} has been installed manually)`,
          ignore: `Ignore emitter ${e.label}`,
          cancel: "Cancel"
        };
        const selected = await vscode.window.showQuickPick(Object.values(options),
          {
            canPickMany: false,
            ignoreFocusOut: true,
            placeHolder: `Package '${e.package}' needs to be installed for emitting`,
            title: `TypeSpec Emit...`,
          });
      
        if(selected === options.ok){
          logger.info(`installing ${e.package}...`, true, false, overallProgress);
          return "install";
        }
        else if(selected === options.recheck){
          checkPackage = true;
          return "skip";
        }
        else if(selected === options.ignore){
          ignoredEmitters.push(e);
          logger.info(`ignore ${e.package}`, true, false, overallProgress);
          return "skip";
        }
        else if(selected === options.cancel || !selected){
          cancelled = true;
          logger.info(`Operation canceled by user`, true, false, overallProgress);
          return "skip";
        }
        else{
          logger.error(`Unexpected selected value for installing package ${e.package}: ${selected}`, false, false);
          cancelled = true;
          return "skip";
        }
      },
      async (output) => {
        if(output.exitCode === 0){
          logger.info(`successfully installing package/emitter ${e.package}`, false, false, overallProgress);
        }else{
          logger.error(`Error when installing package/emitter ${e.package}`, true, true, overallProgress);
          cancelled = true;
        }
      });
      if(cancelled){
        return;      
      }
    }
    if (!e.fromConfig && !ignoredEmitters.includes(e)) {
      const supported = await loadEmitterOptions(basedir, e.package,
        (key) => `${TO_BE_COMMENTED}${key}`,
        (value) => value.replaceAll("\n", NEWLINE)
      ) ?? {} as Record<string, string>;
      if(supported)
        allSupported[e.package] = supported;
    }
  }

  let configFile = config.config;
  if(!configFile){
    configFile = path.join(basedir, "tspconfig.yaml");
    const s = await vscode.window.showQuickPick(["Yes", "Cancel"], { 
      canPickMany: false,
      ignoreFocusOut: true,
      title: "TypeSpec Emit...",
      placeHolder: `tspconfig.yaml not found. Create one at ${configFile}?` 
    })

    if(s === "Yes"){
      fs.writeFileSync(configFile, "options:\n");
    }
    else {
      logger.info("Operation canceled by user", false, false, overallProgress);
      return;
    }
  }

  selectedEmitters = selectedEmitters.filter((e) => !ignoredEmitters.includes(e));
  logger.info("Updating config...", false, false, overallProgress);
  if (Object.keys(allSupported).length > 0) {
    const content = fs.readFileSync(configFile);
    const doc = YAML.parse(content.toString());
    if (!doc["options"]) {
      doc["options"] = allSupported;
    } else {
      doc["options"] = { ...allSupported, ...doc["options"] };
    }
    doc["emit"] = selectedEmitters.map((e) => e.package);
    let output = YAML.stringify(doc, undefined, { indent: 2, lineWidth: 0 });
    output = output.replaceAll(TO_BE_COMMENTED, "#").replaceAll(NEWLINE, "\n      # ");
    fs.writeFileSync(configFile, output);
  }
  
  logger.info("Emitting...", false, false, overallProgress);
  const t = createCompileTask(cli!, startFile);
  if (t) {
    executeVscodeTask(t)
    .then((value) => {
      logger.info("Emitting finished successfully", false, true, overallProgress);
    }, (reason) => {
      logger.error(`Error when emitting: ${reason}`, true, true);
      logger.info("Emitting finished with error. Check the output for details", false, false, overallProgress);
    });
  }
}

async function showOpenApi3(context: vscode.ExtensionContext, uri: vscode.Uri) {

  let startFile : string | undefined = uri?.fsPath
  if(!startFile){
    startFile = await getMainTspFile();
    if(!startFile){
      logger.error("No main.tsp file found in the workspace to generate OpenAPI3 document.");
      return;
    }
  }
  else{
    // TODO: try to update startfile to main file for better cache (but not needed if we use memory)
  }

  const dir = dirname(startFile);
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "Checking @typespec/openapi3...", cancellable: false }
      , async (progress) => {
      await ensureNpmPackageInstalled("@typespec/openapi3", undefined, dir, 
        async ()=>{
          progress.report({ message: "install @typespec/openapi3...", increment: 10 });
          return "install";
        },
        async (output) => {
          if(output.exitCode === 0){
            progress.report({ message: "finish installing @typespec/openapi3", increment: 100 });
          }
          else{
            progress.report({ message: "error when installing @typespec/openapi3. please check Output for detail", increment: 100 });
            logger.error("Error when installing @typespec/openapi3", true, true);
          }
        });
      });
  } catch (e) {
    logger.error("Error when installing openapi3: \n" + JSON.stringify(e), true, true);
    return;
  }

  const root = vscode.Uri.joinPath(context.extensionUri, "openapi3_view");
  const panel = vscode.window.createWebviewPanel("webview", "OpenAPI3 from Typespec", vscode.ViewColumn.Beside, {
    retainContextWhenHidden: true,
    enableScripts: true,
    localResourceRoots: [root],
  });

  const bundleJs = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, "swagger-ui", "dist", "swagger-ui-bundle.js"));
  const presetJs = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, "swagger-ui", "dist", "swagger-ui-standalone-preset.js"));
  const initJs = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, "swagger-ui", "dist", "swagger-initializer.js"));
  const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, "swagger-ui", "dist", "swagger-ui.css")); 

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
  if(!tmpFolder){
    tmpFolder = createTempDir();
    openApi3FileCache.set(startFile, tmpFolder);
  }
  
  const loadHandler = async () => {
    const result = (await client?.sendRequest<{hasError: boolean, diagnostics: string}>("custom/compile", {
      doc: {uri: uri.toString()},
      options:{
        options: {
          "@typespec/openapi3": {
            "emitter-output-dir": tmpFolder,
            "file-type": "json",
          },
        },
        emit: ["@typespec/openapi3"],
        outputDir: tmpFolder,
        noEmit: false,
      }
    }));
    if((result?.hasError ?? true) === true)
    {
      void panel.webview.postMessage({ command: "diagnostics", param: result?.diagnostics ?? "no diagnostics info" });
    }
    else{
      const outputs = fs.readdirSync(tmpFolder)
      if(outputs.length === 0){
        void panel.webview.postMessage({ command: "diagnostics", param: "No openApi3 files generated." });
      }
      else{
        const first = outputs[0];
        // BETTER ERROR HANDLING
        const content = JSON.parse(fs.readFileSync(path.join(tmpFolder, first), "utf8"));
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
    outputChannel.debug("TypeSpec server started");
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
  const args = [] as string[];

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
  let cliPath: string | undefined = workspace.getConfiguration().get("typespec.tsp-cli.path");
  if (cliPath && typeof cliPath !== "string") {
    throw new Error("VS Code configuration option 'typespec.tsp-cli.path' must be a string");
  }
  const workspaceFolder = workspace.workspaceFolders?.[0]?.uri?.fsPath ?? "";

  // Default to tsp-server on PATH, which would come from `npm install -g
  // @typespec/compiler` in a vanilla setup.
  if (cliPath) {
    outputChannel.debug(`Cli path loaded from VS Code configuration: ${cliPath}`);
  } else {
    cliPath = await resolveLocalCompiler(workspaceFolder);
  }
  if (!cliPath) {
    const executable = process.platform === "win32" ? "tsp.cmd" : "tsp";
    outputChannel.debug(`Can't resolve cli path, try to use default value ${executable}.`);
    return { command: executable, args, options };
  }
  const variableResolver = new VSCodeVariableResolver({
    workspaceFolder,
    workspaceRoot: workspaceFolder, // workspaceRoot is deprecated but we still support it for backwards compatibility.
  });

  cliPath = variableResolver.resolve(cliPath);
  outputChannel.debug(`Cli path expanded to: ${cliPath}`);

  if (!cliPath.endsWith(".js")) {
    // Allow path to tsp-server.cmd to be passed.
    if (await isFile(cliPath)) {
      const command =
        process.platform === "win32" && !cliPath.endsWith(".cmd")
          ? `${cliPath}.cmd`
          : "tsp";

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
  openApi3FileCache.forEach((value, key) => {
    try{
      fs.rmSync(value);
    }
    catch(e){}
  })
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
