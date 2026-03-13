import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { statSync } from "fs";
import { join } from "path";
import * as vscode from "vscode";
import { APP_NAME } from "../../shared/app-identity";

const BUILD_COMMAND = "bun run build:ext";
const WATCH_COMMAND = "bun run dev:ext";
const OUTPUT_CHANNEL_NAME = `${APP_NAME} Build`;
const FORCE_KILL_TIMEOUT_MS = 2000;

export class ExtensionBuildWatcher implements vscode.Disposable {
  private process?: ChildProcessWithoutNullStreams;
  private buildProcess?: ChildProcessWithoutNullStreams;
  private output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  private lastCwd = "";
  private lastBuildAt: number | null = null;
  private readonly _onDidBuild = new vscode.EventEmitter<number>();
  readonly onDidBuild = this._onDidBuild.event;

  start(cwd: string): void {
    if (this.isRunning()) {
      if (this.lastCwd === cwd) {
        this.output.appendLine(`[build] already running (cwd=${cwd})`);
        return;
      }
      this.stop("restart");
    }

    this.lastCwd = cwd;
    this.output.appendLine(`[build] starting: ${BUILD_COMMAND} (cwd=${cwd})`);
    const build = spawnCommand(cwd, BUILD_COMMAND);
    this.buildProcess = build;

    build.stdout.on("data", (data) => this.output.append(data.toString()));
    build.stderr.on("data", (data) => this.output.append(data.toString()));
    build.on("exit", (code, signal) => {
      this.output.appendLine(
        `[build] initial compile exited${code !== null ? ` (code=${code})` : ""}${
          signal ? ` (signal=${signal})` : ""
        }`,
      );
      if (code === 0) {
        this.setBuildAt(Date.now());
      }
      this.buildProcess = undefined;
      this.startWatch(cwd);
    });
    build.on("error", (error) => {
      this.output.appendLine(`[build] error: ${error.message}`);
      this.buildProcess = undefined;
      this.startWatch(cwd);
    });
  }

  private setBuildAt(timestamp: number): void {
    this.lastBuildAt = timestamp;
    this._onDidBuild.fire(timestamp);
  }

  seedFromDisk(extensionPath: string): void {
    if (this.lastBuildAt !== null) {
      return;
    }
    try {
      const outFile = join(extensionPath, "out", "extension", "extension.js");
      const stat = statSync(outFile);
      this.lastBuildAt = stat.mtimeMs;
    } catch {
      // output file doesn't exist yet
    }
  }

  markBuild(): void {
    this.setBuildAt(Date.now());
  }

  getLastBuildAt(): number | null {
    return this.lastBuildAt;
  }

  stop(reason = "stop"): void {
    if (this.buildProcess) {
      const buildProc = this.buildProcess;
      this.buildProcess = undefined;
      buildProc.kill("SIGTERM");
    }
    if (!this.process) {
      return;
    }
    const proc = this.process;
    this.process = undefined;

    this.output.appendLine(`[build] stopping (${reason})`);
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
    return Boolean(
      (this.process && !this.process.killed) || (this.buildProcess && !this.buildProcess.killed),
    );
  }

  dispose(): void {
    this.stop("dispose");
    this._onDidBuild.dispose();
    this.output.dispose();
  }

  private startWatch(cwd: string) {
    this.output.appendLine(`[build] starting: ${WATCH_COMMAND} (cwd=${cwd})`);
    const child = spawnCommand(cwd, WATCH_COMMAND);
    child.stdout.on("data", (data) => {
      const text = data.toString();
      this.output.append(text);
      if (/\bBundled\b/i.test(text) || /\bbuild finished\b/i.test(text)) {
        this.setBuildAt(Date.now());
      }
    });
    child.stderr.on("data", (data) => this.output.append(data.toString()));
    child.on("exit", (code, signal) => {
      this.output.appendLine(
        `[build] watch exited${code !== null ? ` (code=${code})` : ""}${
          signal ? ` (signal=${signal})` : ""
        }`,
      );
      this.process = undefined;
    });
    child.on("error", (error) => {
      this.output.appendLine(`[build] watch error: ${error.message}`);
      this.process = undefined;
    });
    this.process = child;
  }
}

function spawnCommand(cwd: string, command: string): ChildProcessWithoutNullStreams {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", command], {
      cwd,
      stdio: "pipe",
      windowsHide: true,
    });
  }

  const shell = process.env.SHELL || "/bin/bash";
  return spawn(shell, ["-lc", command], {
    cwd,
    stdio: "pipe",
  });
}
