import { spawn, SpawnOptions } from "child_process";

export interface ExecOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function spawnExecution(
  exe: string,
  args: string[],
  cwd: string,
  on?: {
    onStdioOut?: (data: string) => void;
    onStdioError?: (error: string) => void;
    onError?: (error: any) => void;
    onExit?: (code: number | null) => void;
  }
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
      on.onError!(error);
    });
  }
  if (on && on.onExit) {
    child.on("exit", (code) => {
      on.onExit!(code);
    });
  }
  return new Promise((res, rej) => {
    child.on("error", (error: any) => {
      rej(error);
    });
    child.on("exit", (exitCode) => {
      if (exitCode === 0 || exitCode === null) {
        res({
          stdout,
          stderr,
          exitCode: exitCode ?? 0,
        });
      } else {
        rej({
          message: `${exe} ${args.join(" ")} failed with exit code ${exitCode}`,
          exitCode: exitCode,
          spawnOptions: options,
        });
      }
    });
  });
}
