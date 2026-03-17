import type { ConfigSource } from "../types/handlers";

export const getAuthLabel = (authType: string): "API token" | "Not set" =>
  authType === "apiToken" ? "API token" : "Not set";

export const getSourceLabel = (configSource: ConfigSource): string => {
  switch (configSource) {
    case "env.local":
      return ".env.local";
    case "env":
      return ".env";
    case "process.env":
      return "Environment";
    case "settings":
      return "Settings";
    case "mixed":
      return "Mixed";
    default:
      return "Not configured";
  }
};

export const getTokenStorageLabel = (hasStoredToken: boolean | undefined): string =>
  hasStoredToken ? "Stored in SecretStorage" : "Not stored";
