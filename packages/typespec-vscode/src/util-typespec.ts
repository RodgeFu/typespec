import { ResolveModuleHost } from "@typespec/compiler/module-resolver";
import { readFile, realpath, stat } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import vscode from "vscode";
import { Executable } from "vscode-languageclient/node.js";
import logger from "./extension-logger.js";
import { NpmUtil } from "./util-npm.js";
import { ExecOutput, normalizeSlashInPath } from "./utils.js";

/** we only care the installed compiler version in package.json which may conflict with other typespec packages we want to install */
export async function getInstalledTypespecCompilerVersion(directory: string) {
  const util = new NpmUtil(directory);
  const COMPILER_PACKAGE_NAME = "@typespec/compiler";
  if (util.isPackageInstalled(COMPILER_PACKAGE_NAME)) {
    const packageJson = await util.loadPackageJsonInPackage(COMPILER_PACKAGE_NAME);
    return packageJson.version;
  }
}

export async function ensureNpmPackageInstalled(
  packageName: string,
  version: string | undefined,
  directory: string,
  onPreInstall: () => Promise<"install" | "skip"> = async () => "install",
  onPostInstall: (output: ExecOutput) => Promise<void> = async () => {},
) {
  const isCompilerVersionSensitivePackage = (name: string): boolean => {
    return [
      "@typespec/http",
      "@typespec/http-server-javascript",
      "@typespec/html-program-viewer",
      "@typespec/json-schema",
      "@typespec/openapi",
      "@typespec/openapi3",
      "@typespec/protobuf",
      "@typespec/rest",
      "@typespec/versioning",
      "@typespec/xml",
    ].includes(name);
  };
  const util = new NpmUtil(directory);
  if (util.isPackageInstalled(packageName)) {
    if (!version) {
      logger.debug(`Package ${packageName} is already installed.`);
      return;
    }
    const packageJson = await util.loadPackageJsonInPackage(packageName);
    if (version === packageJson.version) {
      logger.debug(`Package ${packageName}@${version} is already installed`);
      return;
    }
    logger.info(
      `Package ${packageName} installed but version mismatch. Expect ${version}, but got ${packageJson.version}. Will try to npm install it with the given version.`,
    );
  } else {
    if (!version) {
      if (isCompilerVersionSensitivePackage(packageName)) {
        const compilerVersion = await getInstalledTypespecCompilerVersion(directory);
        if (compilerVersion) {
          // compiler version should be in format of major.minor.patch
          // because the patch may or may not exist for other packages, so we just try to install the major.minor version
          // to make sure it's compatible with the compiler
          const [major, minor] = compilerVersion.split(".");
          version = `${major}.${minor}.0`;
          logger.debug(
            `Compiler version found as ${compilerVersion}, so will try to install ${packageName}@${version}`,
          );
        }
      }
    }
    logger.info(
      `Package ${packageName} is not installed. Will try to npm install it with version ${version ?? "N/A"}.`,
    );
  }

  const toOutput = (str: string) => {
    str
      .trim()
      .split("\n")
      .forEach((line) => logger.info(line));
  };
  const toError = (str: string) => {
    str
      .trim()
      .split("\n")
      .forEach((line) =>
        logger.error(line, [], {
          showOutput: true,
          showPopup: false,
        }),
      );
  };
  const fullName = version ? `${packageName}@${version}` : packageName;
  const preInstallResult = await onPreInstall();
  switch (preInstallResult) {
    case "install":
      logger.debug(`Install npm package ${fullName}`);
      await util
        .install(fullName, [], {
          onStdioOut: toOutput,
          onStdioError: toError,
        })
        .then(
          async (output: ExecOutput) => {
            await onPostInstall(output);
          },
          async (err) => {
            logger.debug(
              `Failed to install ${fullName}. Please check the previous logs for details`,
            );
            await onPostInstall(err);
          },
        );
      break;
    case "skip":
      logger.debug(`Skip npm install for ${fullName}`);
      break;
    default:
      throw new Error("Unknown onPreInstall return value: " + preInstallResult);
  }
}

export function getAllMainTspFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace
    .findFiles("**/main.tsp")
    .then((uris) =>
      uris.filter((uri) => uri.scheme === "file" && !uri.fsPath.includes("node_modules")),
    );
}

export async function getMainTspFile(): Promise<string | undefined> {
  const files = await getAllMainTspFiles();
  if (files.length === 0) {
    logger.error("No main.tsp file found in the workspace.");
    return undefined;
  } else if (files.length === 1) {
    return files[0].fsPath;
  } else {
    const selected = await vscode.window.showQuickPick(
      files.map((f) => f.fsPath),
      {
        canPickMany: false,
        title: "Select a main.tsp file",
      },
    );
    if (!selected || selected.length === 0) {
      return undefined;
    } else {
      return selected[0];
    }
  }
}

export function createWatchTask(cli: Executable, mainFile: string, outputDir?: string) {
  if (cli === undefined) {
    logger.error("Failed to create compile task: cli is undefined", [], {
      showOutput: false,
      showPopup: true,
    });
    return undefined;
  }
  mainFile = normalizeSlashInPath(mainFile);
  let cmd = `${cli.command} ${cli.args?.join(" ") ?? ""} compile "${mainFile}" --watch`;
  if (outputDir) {
    cmd += ` --output-dir "${outputDir}"`;
  }

  const cwd = path.dirname(mainFile);
  logger.debug(`tsp watch task created '${mainFile}' with command: '${cmd}' in cwd: '${cwd}'`);
  return new vscode.Task(
    {
      type: "typespec",
      action: "watch",
      mainFile: mainFile,
      outputDir: outputDir,
    },
    vscode.TaskScope.Workspace,
    `watch - ${mainFile}`,
    "tsp",
    new vscode.ShellExecution(cmd, { cwd }),
  );
}

export function createCompileTask(cli: Executable, mainFile: string, outputDir?: string) {
  if (cli === undefined) {
    logger.error("Failed to create compile task: cli is undefined", [], {
      showOutput: false,
      showPopup: true,
    });
    return undefined;
  }
  mainFile = normalizeSlashInPath(mainFile);
  let cmd = `${cli.command} ${cli.args?.join(" ") ?? ""} compile "${mainFile}"`;
  if (outputDir) {
    cmd += ` --output-dir "${outputDir}"`;
  }
  const cwd = path.dirname(mainFile);
  logger.debug(`tsp compile task created '${mainFile}' with command: '${cmd}' in cwd: '${cwd}'`);
  return new vscode.Task(
    {
      type: "typespec",
      action: "compile",
      mainFile: mainFile,
      outputDir: outputDir,
    },
    vscode.TaskScope.Workspace,
    `compile - ${mainFile}`,
    "tsp",
    new vscode.ShellExecution(cmd, { cwd }),
  );
}

export interface EmitPackageQuickPickItem extends vscode.QuickPickItem {
  package: string;
  fromConfig: boolean;
}

export const recommendedEmitters: ReadonlyArray<EmitPackageQuickPickItem> = [
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

export async function loadEmitterOptions(
  baseDir: string,
  packageNameOrPath: string,
  getKey: (s: string) => string,
  getValue: (v: string) => string,
): Promise<Record<string, string> | undefined> {
  const emitter = await resolveEmitter(baseDir, packageNameOrPath);
  const supported = {} as Record<string, string>;
  supported["emitter-output-dir"] = "{output-dir}/{emitter-name}";
  const optionSchema = emitter?.$lib?.emitter.options;
  if (optionSchema) {
    Object.entries(optionSchema.properties).forEach(([key, value]) => {
      supported[getKey(key)] = getValue((value as any)?.description ?? "no description");
    });
  }
  return supported;
}

export async function resolveEmitter(
  baseDir: string,
  packageNameOrPath: string,
): Promise<Record<string, any> | undefined> {
  const { resolveModule } = await import("@typespec/compiler/module-resolver");

  const host: ResolveModuleHost = {
    realpath,
    readFile: (path: string) => readFile(path, "utf-8"),
    stat,
  };
  try {
    logger.debug(`Try to resolve emitter ${packageNameOrPath} from local, baseDir: ${baseDir}`);
    const module = await resolveModule(host, packageNameOrPath, {
      baseDir,
    });
    const entrypoint = module.type === "file" ? module.path : module.mainFile;
    const path = pathToFileURL(entrypoint).href;
    const exports = await import(path);

    return exports;
  } catch (e) {
    logger.debug(`Exception when resolving emitter from local: ${e}`);
    return undefined;
  }
}
