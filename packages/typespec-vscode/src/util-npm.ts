import fs from "fs";
import path from "path";
import { ExecOutput, spawnExecution, spawnExecutionEvents } from "./util.js";

type versionFilter = (version: string) => boolean;

export class NpmPackageInfo{
  version?: string;
  resolved?: string;
  overridden?: string;
  dependencies?: Record<string, NpmPackageInfo>;

  private constructor(dep: {
    version?: string;
    resolved?: string;
    overridden?: string;
    dependencies?: Record<string, NpmPackageInfo>;
  }){
    this.version = dep.version;
    this.resolved = dep.resolved;
    this.overridden = dep.overridden;
    this.dependencies = {} as Record<string, NpmPackageInfo>;
    if(dep.dependencies){
      for (const key in dep.dependencies) {
        this.dependencies[key] = new NpmPackageInfo(dep.dependencies[key]);
      }
    }
  }

  static parse(json: string): NpmPackageInfo{
    return new NpmPackageInfo(JSON.parse(json));
  }

  findDependencyPackage(packageName: string): NpmPackageInfo | undefined{
    if (this.dependencies) {
      if (this.dependencies[packageName]) {
        return this.dependencies[packageName];
      }
      for (const key in this.dependencies) {
        const p = this.dependencies[key].findDependencyPackage(packageName);
        if (p) {
          return p;
        }
      }
    }
    return undefined;
  }
}

export class NpmUtil {
  private _cwd : string;
  private _packageJsonDir: string | undefined;

  constructor(cwd: string) {
    this._cwd = cwd;
  }

  get packageJsonDir(): string | undefined {
    if(!this._packageJsonDir){
      this._packageJsonDir = this.getPackageJsonDir(this._cwd);
    }
    return this._packageJsonDir;
  }

  get nodeModulesDir(): string | undefined {
    return this.packageJsonDir ? path.join(this.packageJsonDir, 'node_modules') : undefined; 
  }
  
  private getPackageJsonDir(directory: string): string | undefined {
    const cur = path.join(directory, 'package.json');
    if (fs.existsSync(cur)) {
      return directory;
    }
    else{
      const parent = path.dirname(directory);
      if(parent === directory){
        return undefined;
      }else{
        return this.getPackageJsonDir(parent);
      }
    }
  }

  /** version is not considered here */
  isPackageInstalled(packageName: string): boolean{
    const nmDir = this.nodeModulesDir;
    if(!nmDir){
      return false;
    }
    const packageDir = path.join(nmDir, packageName);
    return fs.existsSync(packageDir);
  }

  async loadPackageJsonInPackage(packageName: string): Promise<any>{
    return this.loadFileInPackage(packageName, 'package.json').then((data) => {return JSON.parse(data || '{}');});
  }

  /**
   * 
   * @param packageName 
   * @param filepath relative path from package directory
   * @returns 
   */
  async loadFileInPackage(packageName: string, filepath: string): Promise<string | undefined> {
    const nmDir = this.nodeModulesDir;
    if(!nmDir){
      return undefined;
    }
    const fullPath = path.join(nmDir, packageName, filepath);
    const result = new Promise<any>((resolve, reject) => {
    fs.readFile(fullPath, (err, data) => {
        if (err) {
          reject(err);
        }
        else{
          resolve(data.toString());
        }
      });
    });
    return result;
  }

  /** npm --version */
  version(): Promise<string> {
    return spawnExecution("npm", ["--version"], this._cwd).then((output) => {
      return output.stdout.trim();
    });
  }

  async getInstalledPackages() : Promise<NpmPackageInfo> {
    return await this.list();
  }

  /** npm install */
  install(
    packageNameWithVersion: string,
    args: string[],
    on?: spawnExecutionEvents
  ): Promise<ExecOutput> {
    if (packageNameWithVersion){
      return spawnExecution("npm", ["install", packageNameWithVersion, ...args], this._cwd, on);
    }
    else return spawnExecution("npm", ["install", ...args], this._cwd, on);
  }

  /** npm list [packageName] --json --all --include=dev --include=prod */
  list(packageName?: string): Promise<NpmPackageInfo> {
    const args =
      !packageName || packageName === ""
        ? ["list", "--json", "--all", "--include=dev", "--include=prod"]
        : ["list", packageName, "--json", "--all", "--include=dev", "--include=prod"];
    return spawnExecution("npm", args, this._cwd).then((output) => {
      return NpmPackageInfo.parse(output.stdout.trim());
    });
  }

  /** npm view [packageName] versions --json */
  viewPackageVersions(
    packageName: string,
    filter: versionFilter = (version) => true
  ): Promise<string[]> {
    return spawnExecution("npm", ["view", packageName, "versions", "--json"], this._cwd).then(
      (output) => {
        return (JSON.parse(output.stdout.trim()) as string[]).filter((v) => filter(v));
      }
    );
  }

  isVersionExist(packageName: string, version: string): Promise<boolean> {
    return this.viewPackageVersions(packageName).then((versions) => {
      return versions.includes(version);
    });
  }
}
