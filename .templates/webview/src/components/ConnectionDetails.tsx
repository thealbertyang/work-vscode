import { useAppContext } from "../contexts/app-context";
import { getAuthLabel, getSourceLabel, getTokenStorageLabel } from "../lib/connection-labels";
import { KvGrid, type KvItem } from "./KvGrid";

export type ConnectionField = "baseUrl" | "email" | "authMode" | "configSource" | "tokenStorage";

type ConnectionDetailsProps = {
  fields: ConnectionField[];
};

export function ConnectionDetails({ fields }: ConnectionDetailsProps) {
  const { state } = useAppContext();

  const authLabel = getAuthLabel(state.authType);
  const sourceLabel = getSourceLabel(state.configSource);
  const tokenStorageLabel = getTokenStorageLabel(state.hasStoredToken);

  const fieldMap: Record<ConnectionField, KvItem> = {
    baseUrl: { label: "Base URL", value: state.baseUrl || "Not set", muted: !state.baseUrl },
    email: { label: "Email", value: state.email || "Not set", muted: !state.email },
    authMode: { label: "Auth mode", value: authLabel, muted: authLabel === "Not set" },
    configSource: {
      label: "Config source",
      value: sourceLabel,
      muted: sourceLabel === "Not configured",
    },
    tokenStorage: { label: "Token storage", value: tokenStorageLabel },
  };

  const items = fields.map((field) => fieldMap[field]);

  return <KvGrid items={items} />;
}
