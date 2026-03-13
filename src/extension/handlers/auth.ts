import { ConfigurationTarget, ExtensionMode, env, window, workspace } from "vscode";
import {
  getApiTokenConfig,
  getApiTokenConfigSource,
} from "../providers/data/jira/jiraConfig";
import { MASKED_SECRET } from "../constants";
import { SETTINGS_KEYS, type WebviewState } from "../../shared/contracts";
import type { HandlerDependencies } from "./types";

type AuthDependencies = Pick<
  HandlerDependencies,
  "context" | "storage" | "client" | "provider" | "buildWatcher" | "renderTracker"
>;

export const createAuthHandlers = ({
  context,
  storage,
  client,
  provider,
  buildWatcher,
  renderTracker,
}: AuthDependencies) => {
  const getState = async (): Promise<WebviewState> => {
    const defaults = await client.getApiTokenDefaults();
    const envApiConfig = getApiTokenConfig();
    const hasStoredToken = await client.hasStoredApiToken();
    const hasEnvToken = Boolean(
      envApiConfig.baseUrl && envApiConfig.email && envApiConfig.apiToken,
    );
    const hasStoredConfig = Boolean(defaults.baseUrl && defaults.email && hasStoredToken);
    const isConfigured = hasEnvToken || hasStoredConfig;
    const authType = isConfigured ? "apiToken" : "none";

    const configSource = isConfigured ? getApiTokenConfigSource() : "none";

    return {
      baseUrl: envApiConfig.baseUrl || defaults.baseUrl,
      email: envApiConfig.email || defaults.email,
      apiTokenConfigured: isConfigured,
      configSource,
      authType,
      hasStoredToken,
      devMode: context.extensionMode === ExtensionMode.Development,
      extensionId: context.extension.id,
      uriScheme: env.uriScheme,
      dev: {
        lastExtensionBuildAt: buildWatcher.getLastBuildAt(),
        lastWebviewRenderAt: renderTracker.getLastRenderedAt(),
      },
    };
  };

  return {
    getState,

    saveApiToken: async (baseUrl: string, email: string, apiToken: string) => {
      const token = apiToken.trim();
      const hasStoredToken = await client.hasStoredApiToken();
      const shouldStoreToken = token.length > 0 && token !== MASKED_SECRET;
      if (!shouldStoreToken && !hasStoredToken) {
        const envToken = getApiTokenConfig().apiToken;
        if (!envToken) {
          throw new Error("API token is required to connect.");
        }
        await client.saveApiTokenAuth(baseUrl, email, envToken);
      } else if (shouldStoreToken) {
        await client.saveApiTokenAuth(baseUrl, email, token);
      } else {
        await client.updateApiTokenDefaults(baseUrl, email);
      }

      const target =
        workspace.workspaceFolders && workspace.workspaceFolders.length > 0
          ? ConfigurationTarget.Workspace
          : ConfigurationTarget.Global;
      await Promise.all([
        storage.updateSetting(SETTINGS_KEYS.BASE_URL, baseUrl, target),
        storage.updateSetting(SETTINGS_KEYS.EMAIL, email, target),
        storage.updateSetting(SETTINGS_KEYS.API_TOKEN, MASKED_SECRET, target),
      ]);

      provider.refresh();
      window.showInformationMessage("Jira API token saved.");
    },

    disconnect: async () => {
      await client.clearAuth();
      provider.refresh();
      window.showInformationMessage("Jira connection removed.");
    },
  };
};
