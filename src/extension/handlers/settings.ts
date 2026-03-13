import path from "path";
import { ConfigurationTarget, Uri, window, workspace } from "vscode";
import { parseEnvFile } from "../providers/data/jira/jiraConfig";
import { MASKED_SECRET } from "../constants";
import { openExtensionSettings } from "../util/open-extension-settings";
import { SETTINGS_KEYS } from "../../shared/contracts";
import { buildEnvKeys } from "../../shared/app-identity";
import type { HandlerDependencies } from "./types";

type SettingsDependencies = Pick<HandlerDependencies, "context" | "storage" | "client">;

const BASE_URL_ENV_KEYS = buildEnvKeys("BASE_URL", ["JIRA_URL"]);
const EMAIL_ENV_KEYS = buildEnvKeys("EMAIL", ["JIRA_USER_EMAIL"]);
const API_TOKEN_ENV_KEYS = buildEnvKeys("API_TOKEN", ["JIRA_API_TOKEN"]);
const WEBVIEW_SERVER_URL_ENV_KEYS = buildEnvKeys("WEBVIEW_SERVER_URL");
const WEBVIEW_PATH_ENV_KEYS = buildEnvKeys("WEBVIEW_PATH");
const DOCS_PATH_ENV_KEYS = buildEnvKeys("DOCS_PATH");

const firstPresentKey = (env: Record<string, string>, keys: readonly string[]): string | null =>
  keys.find((key) => Boolean(env[key])) ?? null;

export const createSettingsHandlers = ({ context, storage, client }: SettingsDependencies) => ({
  openSettings: async () => {
    await openExtensionSettings(context);
  },

  syncEnvToSettings: async () => {
    const workspaceFolder =
      workspace.getWorkspaceFolder(Uri.file(context.extensionPath)) ??
      workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      window.showWarningMessage("Open a workspace to sync .env.local settings.");
      return;
    }

    const envPath = path.join(workspaceFolder.uri.fsPath, ".env");
    const envLocalPath = path.join(workspaceFolder.uri.fsPath, ".env.local");
    const envData = {
      ...parseEnvFile(envPath),
      ...parseEnvFile(envLocalPath),
    };

    const updates: Array<{ key: string; value: unknown; env: string; sensitive?: boolean }> = [];

    const baseUrlEnv = firstPresentKey(envData, BASE_URL_ENV_KEYS);
    const emailEnv = firstPresentKey(envData, EMAIL_ENV_KEYS);
    const apiTokenEnv = firstPresentKey(envData, API_TOKEN_ENV_KEYS);

    if (baseUrlEnv) {
      updates.push({ key: SETTINGS_KEYS.BASE_URL, value: envData[baseUrlEnv], env: baseUrlEnv });
    }
    if (emailEnv) {
      updates.push({ key: SETTINGS_KEYS.EMAIL, value: envData[emailEnv], env: emailEnv });
    }
    if (apiTokenEnv) {
      updates.push({ key: SETTINGS_KEYS.API_TOKEN, value: MASKED_SECRET, env: apiTokenEnv, sensitive: true });
    }
    if (envData.JIRA_JQL) {
      updates.push({ key: SETTINGS_KEYS.JQL, value: envData.JIRA_JQL, env: "JIRA_JQL" });
    }

    const webviewServerEnv = firstPresentKey(envData, WEBVIEW_SERVER_URL_ENV_KEYS);
    if (webviewServerEnv) {
      updates.push({
        key: SETTINGS_KEYS.WEBVIEW_SERVER_URL,
        value: envData[webviewServerEnv],
        env: webviewServerEnv,
      });
    }
    const webviewPathEnv = firstPresentKey(envData, WEBVIEW_PATH_ENV_KEYS);
    if (webviewPathEnv) {
      updates.push({
        key: SETTINGS_KEYS.WEBVIEW_PATH,
        value: envData[webviewPathEnv],
        env: webviewPathEnv,
      });
    }
    const docsPathEnv = firstPresentKey(envData, DOCS_PATH_ENV_KEYS);
    if (docsPathEnv) {
      updates.push({
        key: SETTINGS_KEYS.DOCS_PATH,
        value: envData[docsPathEnv],
        env: docsPathEnv,
      });
    }

    if (updates.length === 0) {
      window.showWarningMessage(
        `No workspace/Jira settings found in ${path.basename(envLocalPath)} or ${path.basename(
          envPath,
        )}.`,
      );
      return;
    }

    const target =
      workspace.workspaceFolders && workspace.workspaceFolders.length > 0
        ? ConfigurationTarget.Workspace
        : ConfigurationTarget.Global;

    await Promise.all(
      updates.map(({ key, value }) => storage.updateSetting(key, value, target)),
    );

    const baseUrl = baseUrlEnv ? envData[baseUrlEnv] : undefined;
    const email = emailEnv ? envData[emailEnv] : undefined;
    const apiToken = apiTokenEnv ? envData[apiTokenEnv] : undefined;

    if (baseUrl && email && apiToken) {
      await client.saveApiTokenAuth(baseUrl, email, apiToken);
    } else if (baseUrl || email) {
      await client.updateApiTokenDefaults(baseUrl, email);
    }

    const source = path.basename(envLocalPath);

    window.showInformationMessage(
      `Synced ${updates.length} setting${updates.length === 1 ? "" : "s"} from ${source}.`,
    );

    return {
      count: updates.length,
      source,
      items: updates.map(({ env, key, sensitive }) => ({
        env,
        setting: key,
        masked: sensitive ?? false,
      })),
    };
  },
});
