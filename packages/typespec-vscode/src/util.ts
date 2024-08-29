import { spawn, SpawnOptions } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import vscode from "vscode";

export interface ExecOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  error: string;
  spawnOptions: SpawnOptions;
}

export interface spawnExecutionEvents{
  onStdioOut?: (data: string) => void;
  onStdioError?: (error: string) => void;
  onError?: (error: any, stdout: string, stderr: string) => void;
  onExit?: (code: number | null, stdout: string, stderror: string) => void;
}

export function spawnExecution(
  exe: string,
  args: string[],
  cwd: string,
  on?: spawnExecutionEvents
): Promise<ExecOutput> {
  const shell = process.platform === "win32";
  const cmd = shell && exe.includes(" ") ? `"${exe}"` : exe;
  let stdout = "";
  let stderr = "";

  const options: SpawnOptions = {
    shell,
    stdio: "pipe",
    windowsHide: true,
    cwd,
  };
  const child = spawn(cmd, args, options);

  child.stdout!.on("data", (data) => {
    stdout += data.toString();
  });
  if (on && on.onStdioOut) {
    child.stdout!.on("data", (data) => {
      on.onStdioOut!(data.toString());
    });
  }
  child.stderr!.on("data", (data) => {
    stderr += data.toString();
  });
  if (on && on.onStdioError) {
    child.stderr!.on("data", (data) => {
      on.onStdioError!(data.toString());
    });
  }
  if (on && on.onError) {
    child.on("error", (error: any) => {
      on.onError!(error, stdout, stderr);
    });
  }
  if (on && on.onExit) {
    child.on("exit", (code) => {
      on.onExit!(code, stdout, stderr);
    });
  }
  return new Promise((res, rej) => {
    child.on("error", (error: any) => {
      rej({
        stdout,
        stderr,
        exitCode: 0x1212,
        error: error,
        spawnOptions: options,
      });
    });
    child.on("exit", (exitCode) => {
      if (exitCode === 0 || exitCode === null) {
        res({
          stdout,
          stderr,
          exitCode: exitCode ?? 0,
          error: "",
          spawnOptions: options,
        });
      } else {
        rej({
          stdout,
          stderr,
          exitCode: exitCode,
          error: `${exe} ${args.join(" ")} failed with exit code ${exitCode}`,
          spawnOptions: options,
        });
      }
    });
  });
}

export function createTempDir() {
  const tempDir = os.tmpdir();
  const realTempDir = fs.realpathSync(tempDir);
  const uid = createGuid();
  const subDir = path.join(realTempDir, uid);
  fs.mkdirSync(subDir);
  return subDir;
}

export function createGuid(){
  return crypto.randomUUID();
}

export async function executeVscodeTask(task: vscode.Task) {
  const r = new Promise<void>(resolve => {
      const disposable = vscode.tasks.onDidEndTask(e => {
          if (e.execution.task === task) {
              disposable.dispose();
              resolve();
          }
      });
  });
  await vscode.tasks.executeTask(task);
  return r;
}

export function normalizeSlashInPath(path: string){
  return path.replaceAll(/\\/g, "/");
}
