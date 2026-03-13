import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_UNIVERSAL_INTENT_SCHEME,
  ROUTE_META,
  buildDeepLinkUrl,
  buildUniversalIntentUrl,
} from "@shared/contracts";
import { DEFAULT_UNIVERSAL_CONFIG } from "@shared/universal";
import { useAppContext } from "../../contexts/app-context";
import { useHandlers } from "../../hooks/use-handlers";
import { StatusDot } from "../../components/StatusDot";
import { OpenSettingsButton } from "../../components/OpenSettingsButton";
import { KvGrid } from "../../components/KvGrid";
import { MASKED_SECRET } from "../../constants";
import { formatBuildAge, buildStatusVariant } from "../../lib/build-status";
import { getAuthLabel, getSourceLabel, getTokenStorageLabel } from "../../lib/connection-labels";

export const Route = createFileRoute("/system/settings")({
  component: SettingsPage,
  staticData: ROUTE_META.systemSettings,
});

function SettingsPage() {
  const {
    state,
    form,
    updateForm,
    saveToken,
    syncEnv,
    loading,
    isWebview,
    deepLinkBase,
    navigate,
    runDevWebview,
    reloadWebviews,
    reinstallExtension,
    restartExtensionHost,
    startTaskTerminal,
    buildExtension,
    buildWebview,
    universalConfig,
  } = useAppContext();

  const handlers = useHandlers();
  const isConnected = state.apiTokenConfigured;
  const [credentialsOpen, setCredentialsOpen] = useState(!isConnected);
  const [configOpen, setConfigOpen] = useState(false);
  const [internalsOpen, setInternalsOpen] = useState(false);
  const [fullConfig, setFullConfig] = useState<Record<string, unknown> | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [configError, setConfigError] = useState("");

  const isTokenMasked = form.apiToken === MASKED_SECRET;
  const wsBridgeToken =
    typeof (fullConfig as any)?.dev?.wsBridgeToken === "string"
      ? String((fullConfig as any).dev.wsBridgeToken)
      : "";
  const wsBridgePort =
    typeof (fullConfig as any)?.dev?.wsBridgePort === "number"
      ? String((fullConfig as any).dev.wsBridgePort)
      : "";

  const appId = universalConfig?.app.id ?? DEFAULT_UNIVERSAL_CONFIG.app.id ?? "work";
  const intentScheme =
    universalConfig?.app.intentScheme ?? DEFAULT_UNIVERSAL_CONFIG.app.intentScheme ?? DEFAULT_UNIVERSAL_INTENT_SCHEME;

  const deepLinkExamples = useMemo(() => {
    const preferred = (routePath: string) => {
      const appPath = `/app/${appId}/route${routePath}`;
      return deepLinkBase ? buildDeepLinkUrl(deepLinkBase, appPath) : "";
    };
    const canonical = (routePath: string) =>
      buildUniversalIntentUrl({ kind: "route", path: routePath }, intentScheme, appId);
    return {
      preferredSettings: preferred("/system/settings"),
      preferredIssue: preferred("/review/issues/CSO-7144"),
      preferredPlan: preferred("/plan"),
      canonicalSettings: canonical("/system/settings"),
      canonicalIssue: canonical("/review/issues/CSO-7144"),
      canonicalPlan: canonical("/plan"),
    };
  }, [appId, deepLinkBase, intentScheme]);

  const loadFullConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError("");
    try {
      const config = await handlers.getFullConfig();
      setFullConfig(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load config.";
      setConfigError(message);
    } finally {
      setConfigLoading(false);
    }
  }, [handlers]);

  useEffect(() => {
    if (!fullConfig && isWebview) {
      void loadFullConfig();
    }
  }, [fullConfig, isWebview, loadFullConfig]);

  const copyConfig = async () => {
    if (!fullConfig) return;
    const text = JSON.stringify(fullConfig, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setConfigCopied(true);
    setTimeout(() => setConfigCopied(false), 2000);
  };

  const copyText = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const toolGroups = [
    {
      label: "Extension",
      actions: [
        { label: "Build:Extension", icon: "\u{1F528}", onClick: buildExtension, tooltip: "Compile extension host (src/extension)" },
        { label: "Restart Extension Hosts", icon: "\u{1F501}", onClick: restartExtensionHost, tooltip: "Restart ALL extensions (workbench.action.restartExtensionHost)" },
        { label: "Reinstall", icon: "\u{1F4E6}", onClick: reinstallExtension, tooltip: "Build + package + install vsix (reload window after)" },
      ],
      footer: (
        <div className="tool-group-footer">
          <StatusDot variant={buildStatusVariant(state.dev?.lastExtensionBuildAt)} />
          <span>Built {formatBuildAge(state.dev?.lastExtensionBuildAt)}</span>
        </div>
      ),
    },
    {
      label: "WebView",
      actions: [
        { label: "Build:WebView", icon: "\u{1F3D7}\uFE0F", onClick: buildWebview, tooltip: "Compile webview UI (src/webview)" },
        { label: "Reload WebViews", icon: "\u{1F504}", onClick: reloadWebviews, tooltip: "Reload webview panels to pick up new UI" },
        { label: "Dev:Web", icon: "\u{25B6}\uFE0F", onClick: runDevWebview, tooltip: "Start Vite dev server with HMR for webview changes" },
      ],
    },
    {
      label: "Dev Environment",
      actions: [
        { label: "Reload Window", icon: "\u{1F504}", onClick: () => handlers.execCommand("workbench.action.reloadWindow"), tooltip: "Reload the VS Code window (workbench.action.reloadWindow)" },
        { label: "Terminal", icon: "\u{1F5A5}\uFE0F", onClick: startTaskTerminal, tooltip: "Open a dev task terminal in the repo" },
      ],
    },
  ];

  const credentialsForm = (
    <>
      <div className="row">
        <label htmlFor="baseUrl">Jira site URL</label>
        <input
          id="baseUrl"
          type="text"
          placeholder="https://your-domain.work.net"
          value={form.baseUrl}
          onChange={updateForm("baseUrl")}
          disabled={loading}
        />
        <div className="input-hint">Example: https://your-domain.work.net</div>
      </div>
      <div className="row">
        <label htmlFor="email">Atlassian account email</label>
        <input
          id="email"
          type="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={updateForm("email")}
          disabled={loading}
        />
      </div>
      <div className="row">
        <label htmlFor="apiToken">API token</label>
        <input
          id="apiToken"
          type="password"
          placeholder="Paste your API token"
          value={form.apiToken}
          onChange={updateForm("apiToken")}
          onFocus={(event) => {
            if (isTokenMasked) event.currentTarget.select();
          }}
          disabled={loading}
        />
        <div className="input-hint">
          Create one at{" "}
          <a
            href="https://id.work.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
          >
            Atlassian account settings
          </a>
          .
        </div>
      </div>
      <div className="actions">
        <button onClick={saveToken} disabled={loading}>
          {isConnected ? "Update" : "Connect"}
        </button>
        <button className="secondary" onClick={syncEnv} disabled={!isWebview || loading}>
          Sync .env.local
        </button>
      </div>
    </>
  );

  return (
    <section className="settings-unified">
      {/* ================================================================
          LAYER 1 — Identity Card
          ================================================================ */}
      {isConnected ? (
        <div className="identity-card identity-card-ok">
          <div className="identity-url">{state.baseUrl}</div>
          <div className="identity-email">{state.email}</div>
          <div className="identity-badges">
            <span className="pill pill-outline">{getAuthLabel(state.authType)}</span>
            <span className="pill pill-outline">{getSourceLabel(state.configSource)}</span>
            <span className="pill pill-outline">{getTokenStorageLabel(state.hasStoredToken)}</span>
          </div>
          <div className="identity-actions">
            <OpenSettingsButton loading={loading} />
            <button className="secondary" onClick={syncEnv} disabled={!isWebview || loading}>
              Sync .env
            </button>
            <button className="secondary" onClick={copyConfig} disabled={!fullConfig}>
              {configCopied ? "Copied" : "Copy Config"}
            </button>
          </div>
        </div>
      ) : (
        <div className="identity-card identity-card-warn">
          <div className="identity-message">Not connected</div>
          <div className="identity-message-hint">Set up your Jira credentials below.</div>
          <div style={{ marginTop: 12 }}>
            {credentialsForm}
          </div>
        </div>
      )}

      {/* ================================================================
          LAYER 2 — Developer tools
          ================================================================ */}
      <div className="section">
        <div className="section-heading">Developer tools</div>
        <div className="tools-grid">
          {toolGroups.map((group) => (
            <div key={group.label} className={`tool-group${group.full ? " tool-group-full" : ""}`}>
              <div className="tool-group-label">{group.label}</div>
              <div className="tool-group-actions">
                {group.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="secondary tooltip-wrap"
                    onClick={action.onClick}
                    disabled={!isWebview || loading}
                    data-tooltip={action.tooltip}
                  >
                    <span>{action.icon}</span> {action.label}
                  </button>
                ))}
              </div>
              {group.footer}
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================
          LAYER 3 — Details
          ================================================================ */}

      {/* Update Credentials (only when connected) */}
      {isConnected && (
        <div className="section">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setCredentialsOpen(!credentialsOpen)}
          >
            <span className="section-toggle-icon">{credentialsOpen ? "\u25BE" : "\u25B8"}</span>
            <span className="section-heading">Update credentials</span>
          </button>

          {credentialsOpen && (
            <div className="section-body">
              {credentialsForm}
            </div>
          )}
        </div>
      )}

      {/* Configuration */}
      <div className="section">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setConfigOpen(!configOpen)}
        >
          <span className="section-toggle-icon">{configOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Configuration</span>
          <StatusDot
            variant={fullConfig ? "ok" : configLoading ? "warn" : "muted"}
            label={fullConfig ? "Loaded" : configLoading ? "Loading..." : ""}
          />
        </button>

        {configOpen && (
          <div className="section-body">
            {configError && <div className="error" style={{ marginBottom: 8 }}>{configError}</div>}
            <div className="actions" style={{ marginBottom: 8 }}>
              <button
                className="secondary"
                onClick={loadFullConfig}
                disabled={configLoading || !isWebview}
              >
                {configLoading ? "Loading..." : "Refresh"}
              </button>
              <button
                className="secondary"
                onClick={copyConfig}
                disabled={!fullConfig}
              >
                {configCopied ? "Copied" : "Copy"}
              </button>
            </div>
            {!isWebview && !fullConfig && (
              <div className="note">Connect via VS Code or WS bridge to load config.</div>
            )}
            <div className="note" style={{ marginBottom: 8 }}>
              Snapshot is written automatically to <code>.claude/app-global-state.json</code>.
            </div>
            {fullConfig && (
              <pre className="code-block" style={{ maxHeight: 480, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(fullConfig, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Internals */}
      <div className="section">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setInternalsOpen(!internalsOpen)}
        >
          <span className="section-toggle-icon">{internalsOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Internals</span>
        </button>

        {internalsOpen && (
          <div className="section-body">
            <KvGrid
              items={[
                { label: "Extension ID", value: state.extensionId ?? "\u2014" },
                { label: "URI scheme", value: state.uriScheme ?? "\u2014" },
                { label: "Deep link base", value: deepLinkBase || "\u2014" },
                {
                  label: "WS bridge port",
                  value: wsBridgePort || "\u2014",
                  muted: !wsBridgePort,
                },
                {
                  label: "WS bridge token",
                  value: wsBridgeToken ? "********" : "\u2014",
                  muted: !wsBridgeToken,
                },
              ]}
            />
            {wsBridgeToken ? (
              <div className="actions" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void copyText(wsBridgeToken)}
                  disabled={!isWebview}
                >
                  Copy WS token
                </button>
              </div>
            ) : null}
            <div className="section-heading" style={{ marginTop: 12 }}>
              Preferred deep link examples (<code>/app</code>)
            </div>
            <ul className="list">
              <li>
                Settings:{" "}
                <a href="#" className="inline-route-link" onClick={(e) => { e.preventDefault(); navigate("/system/settings"); }}>
                  <code>{deepLinkExamples.preferredSettings || "\u2014"}</code>
                </a>
              </li>
              <li>
                Issue:{" "}
                <a href="#" className="inline-route-link" onClick={(e) => { e.preventDefault(); navigate("/review/issues/CSO-7144"); }}>
                  <code>{deepLinkExamples.preferredIssue || "\u2014"}</code>
                </a>
              </li>
              <li>
                Plan:{" "}
                <a href="#" className="inline-route-link" onClick={(e) => { e.preventDefault(); navigate("/plan"); }}>
                  <code>{deepLinkExamples.preferredPlan || "\u2014"}</code>
                </a>
              </li>
            </ul>
            <div className="section-heading" style={{ marginTop: 12 }}>
              Canonical universal URL examples (<code>{intentScheme}://</code>)
            </div>
            <ul className="list">
              <li>
                Settings: <code>{deepLinkExamples.canonicalSettings || "\u2014"}</code>
              </li>
              <li>
                Issue: <code>{deepLinkExamples.canonicalIssue || "\u2014"}</code>
              </li>
              <li>
                Plan: <code>{deepLinkExamples.canonicalPlan || "\u2014"}</code>
              </li>
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
