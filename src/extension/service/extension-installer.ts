import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import * as vscode from "vscode";
import { APP_NAME } from "../../shared/app-identity";

const COMMAND = "bun run install:ext";
const OUTPUT_CHANNEL_NAME = `${APP_NAME} Extension Install`;
const FORCE_KILL_TIMEOUT_MS = 2000;

export class ExtensionInstaller implements vscode.Disposable {
  private process?: ChildProcessWithoutNullStreams;
  private output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  private lastCwd = "";

  start(cwd: string): void {
    if (this.isRunning()) {
      if (this.lastCwd === cwd) {
        this.output.appendLine(`[install] already running (cwd=${cwd})`);
        this.output.show(true);
        return;
      }
      this.stop("restart");
    }

    this.lastCwd = cwd;
    this.output.appendLine(`[install] starting: ${COMMAND} (cwd=${cwd})`);
    const child = spawnInstallCommand(cwd);
    this.process = child;

    child.stdout.on("data", (data) => this.output.append(data.toString()));
    child.stderr.on("data", (data) => this.output.append(data.toString()));
    child.on("exit", (code, signal) => {
      this.output.appendLine(
        `[install] exited${code !== null ? ` (code=${code})` : ""}${
          signal ? ` (signal=${signal})` : ""
        }`,
      );
      this.process = undefined;
      if (code === 0) {
        vscode.window.showInformationMessage(
          "Extension reinstall complete. Reload window to use the updated version.",
        );
      }
    });
    child.on("error", (error) => {
      this.output.appendLine(`[install] error: ${error.message}`);
      this.process = undefined;
    });

    this.output.show(true);
  }

  stop(reason = "stop"): void {
    if (!this.process) {
      return;
    }
    const proc = this.process;
    this.process = undefined;

    this.output.appendLine(`[install] stopping (${reason})`);
    proc.kill("SIGTERM");

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, FORCE_KILL_TIMEOUT_MS);

    proc.once("exit", () => clearTimeout(timer));
  }

  isRunning(): boolean {
    return Boolean(this.process && !this.process.killed);
  }

  dispose(): void {
    this.stop("dispose");
    this.output.dispose();
  }
}

function spawnInstallCommand(cwd: string): ChildProcessWithoutNullStreams {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", COMMAND], {
      cwd,
      stdio: "pipe",
      windowsHide: true,
    });
  }

  const shell = process.env.SHELL || "/bin/bash";
  return spawn(shell, ["-lc", COMMAND], {
    cwd,
    stdio: "pipe",
  });
}
