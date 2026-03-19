import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import * as vscode from "vscode";
import { buildEnvKeys } from "../../shared/app-identity";

const COMMAND = "bun run dev:webview:template";
const OUTPUT_CHANNEL_NAME = "Work Webview Server";
const FORCE_KILL_TIMEOUT_MS = 2000;
const WEBVIEW_PORT_ENV_KEYS = buildEnvKeys("WEBVIEW_PORT");

export class WebviewServer implements vscode.Disposable {
  private process?: ChildProcessWithoutNullStreams;
  private output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  private lastCwd = "";
  private lastPort = 0;

  start(cwd: string, port: number, extraEnv: Record<string, string> = {}): void {
    if (this.isRunning()) {
      if (this.lastCwd === cwd && this.lastPort === port) {
        this.output.appendLine(`[devserver] already running (cwd=${cwd}, port=${port})`);
        this.output.show(true);
        return;
      }
      this.stop("restart");
    }

    this.lastCwd = cwd;
    this.lastPort = port;
    this.output.appendLine(`[devserver] starting: ${COMMAND} (cwd=${cwd}, port=${port})`);

    const env = {
      ...process.env,
      ...extraEnv,
    };
    for (const key of WEBVIEW_PORT_ENV_KEYS) {
      env[key] = String(port);
    }

    const child = spawnDevCommand(cwd, env);
    this.process = child;

    child.stdout.on("data", (data) => this.output.append(data.toString()));
    child.stderr.on("data", (data) => this.output.append(data.toString()));
    child.on("exit", (code, signal) => {
      this.output.appendLine(
        `[devserver] exited${code !== null ? ` (code=${code})` : ""}${
          signal ? ` (signal=${signal})` : ""
        }`,
      );
      this.process = undefined;
    });
    child.on("error", (error) => {
      this.output.appendLine(`[devserver] error: ${error.message}`);
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

    this.output.appendLine(`[devserver] stopping (${reason})`);
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

function spawnDevCommand(cwd: string, env: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", COMMAND], {
      cwd,
      env,
      stdio: "pipe",
      windowsHide: true,
    });
  }

  const shell = process.env.SHELL || "/bin/bash";
  return spawn(shell, ["-lc", COMMAND], {
    cwd,
    env,
    stdio: "pipe",
  });
}
