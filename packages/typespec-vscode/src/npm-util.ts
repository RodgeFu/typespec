import { ExecOutput, spawnExecution } from "./util.js";

type versionFilter = (version: string) => boolean;

interface NpmPackageInfo {
  version?: string;
  resolved?: string;
  overridden?: string;
  dependencies?: Record<string, NpmPackageInfo>;
  findDependencyPackage(packageName: string): NpmPackageInfo | undefined;
}

function createNpmPackageInfo(json: string): NpmPackageInfo {
  const obj = typeof json === "object" ? json : JSON.parse(json);
  const version = obj["version"];
  const resolved = obj["resolved"];
  const overridden = obj["overridden"];
  const dependencies = {} as Record<string, NpmPackageInfo>;
  for (const key in obj["dependencies"] ?? {}) {
    dependencies[key] = createNpmPackageInfo(obj["dependencies"][key]);
  }

  return {
    version,
    resolved,
    overridden,
    dependencies,
    findDependencyPackage,
  };

  function findDependencyPackage(packageName: string): NpmPackageInfo | undefined {
    if (dependencies) {
      if (dependencies[packageName]) {
        return dependencies[packageName];
      }
      for (const key in dependencies) {
        const p = dependencies[key].findDependencyPackage(packageName);
        if (p) {
          return p;
        }
      }
    }
    return undefined;
  }
}

export function createNpmUtil(workDirectory: string) {
  const cwd = workDirectory;
  return {
    version,
    install,
    list,
    viewPackageVersions,
    isVersionExist,
  };

  function version(): Promise<string> {
    return spawnExecution("npm", ["--version"], cwd).then((output) => {
      return output.stdout.trim();
    });
  }

  function install(
    packageNameWithVersion: string,
    args: string[],
    on?: {
      onStdioOut?: (data: string) => void;
      onStdioError?: (error: string) => void;
      onError?: (error: any) => void;
      onExit?: (code: number | null) => void;
    }
  ): Promise<ExecOutput> {
    if (packageNameWithVersion)
      return spawnExecution("npm", ["install", packageNameWithVersion, ...args], cwd, on);
    else return spawnExecution("npm", ["install", ...args], cwd, on);
  }

  function list(packageName?: string): Promise<NpmPackageInfo | undefined> {
    const args =
      !packageName || packageName === ""
        ? ["list", "--json", "--all", "--include=dev", "--include=prod"]
        : ["list", packageName, "--json", "--all", "--include=dev", "--include=prod"];
    return spawnExecution("npm", args, cwd).then((output) => {
      return createNpmPackageInfo(output.stdout.trim());
    });
  }

  function viewPackageVersions(
    packageName: string,
    filter: versionFilter = (version) => true
  ): Promise<string[]> {
    return spawnExecution("npm", ["view", packageName, "versions", "--json"], cwd).then(
      (output) => {
        return (JSON.parse(output.stdout.trim()) as string[]).filter((v) => filter(v));
      }
    );
  }

  function isVersionExist(packageName: string, version: string): Promise<boolean> {
    return viewPackageVersions(packageName).then((versions) => {
      return versions.includes(version);
    });
  }
}
