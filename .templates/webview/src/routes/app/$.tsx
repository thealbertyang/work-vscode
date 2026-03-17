import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_UNIVERSAL_INTENT_SCHEME,
  ROUTE_META,
  parseUniversalIntentUrl,
  resolveIntentToAction,
  type UniversalIntent,
  type UniversalIntentKind,
} from "@shared/contracts";
import { DEFAULT_UNIVERSAL_CONFIG } from "@shared/universal";
import { useHandlers } from "../../hooks/use-handlers";
import { toSearchParams } from "../../lib/to-search-params";
import { sanitizeSearchParams } from "../../lib/sanitize-query";

export const Route = createFileRoute("/app/$")({
  component: AppDispatchPage,
  staticData: ROUTE_META.appDispatch,
});

const toStringArgs = (args?: unknown[]): string => {
  if (!args || args.length === 0) return "[]";
  try {
    return JSON.stringify(args);
  } catch {
    return "[unserializable]";
  }
};

const decodePathSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const buildCanonicalIntentUrl = (input: {
  appId: string;
  kind: UniversalIntentKind;
  idOrPath: string;
  search: unknown;
}): string => {
  const base = `${DEFAULT_UNIVERSAL_INTENT_SCHEME}://${input.appId}/${input.kind}${
    input.idOrPath ? `/${input.idOrPath}` : ""
  }`;
  const url = new URL(base);
  const params = sanitizeSearchParams(toSearchParams(input.search));
  for (const [k, v] of params.entries()) {
    url.searchParams.append(k, v);
  }
  return url.toString();
};

function AppDispatchPage() {
  const handlers = useHandlers();
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const params = Route.useParams();

  const raw = useMemo(() => {
    const splat = String(params._splat ?? "").replace(/^\/+/, "");
    const segments = splat.split("/").filter(Boolean).map(decodePathSegment);
    const appId = segments[0] ?? "";
    const kind = (segments[1] ?? "") as UniversalIntentKind;
    const idOrPath = segments.slice(2).join("/");

    if (!appId || !kind) {
      return "";
    }

    return buildCanonicalIntentUrl({
      appId,
      kind,
      idOrPath,
      search: location.search,
    });
  }, [location.search, params._splat]);

  const intent: UniversalIntent | null = useMemo(() => {
    if (!raw) return null;
    // The /app dispatcher always speaks the canonical app:// grammar.
    return parseUniversalIntentUrl(raw, DEFAULT_UNIVERSAL_INTENT_SCHEME);
  }, [raw]);

  const [error, setError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    setError("");
    setNeedsConfirm(false);

    if (!raw) {
      navigate({ to: DEFAULT_UNIVERSAL_CONFIG.app.defaultRoute ?? "/plan", replace: true });
      return;
    }

    if (!intent) {
      setError("Invalid app dispatcher URL.");
      return;
    }

    // Safe auto-dispatch kinds.
    if (intent.kind === "route") {
      navigate({
        to: intent.path,
        search: intent.query,
        replace: true,
      });
      return;
    }

    if (
      intent.kind === "doc" ||
      intent.kind === "runbook" ||
      intent.kind === "plan" ||
      intent.kind === "skill" ||
      intent.kind === "automation"
    ) {
      navigate({
        to: "/system/docs",
        search: { doc: intent.id },
        replace: true,
      });
      return;
    }

    // Command-like intents require confirmation to avoid "drive-by" execution.
    setNeedsConfirm(true);
  }, [intent, navigate, raw]);

  const resolved = useMemo(() => (intent ? resolveIntentToAction(intent) : null), [intent]);

  const execute = async () => {
    setError("");

    if (!intent) {
      setError("Missing intent.");
      return;
    }

    if (!resolved) {
      setError("Unsupported intent kind.");
      return;
    }

    setIsExecuting(true);
    try {
      if (resolved.route) {
        navigate({ to: resolved.route, replace: true });
        return;
      }

      if (resolved.command) {
        await handlers.execCommand(resolved.command, ...(resolved.args ?? []));
        navigate({ to: "/plan", replace: true });
        return;
      }

      if (resolved.rpc) {
        const fn = (handlers as any)[resolved.rpc] as unknown;
        if (typeof fn !== "function") {
          setError(`Unknown RPC method: ${resolved.rpc}`);
          return;
        }
        await fn(...(resolved.args ?? []));
        navigate({ to: "/plan", replace: true });
        return;
      }

      setError("Nothing to execute.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed.");
    } finally {
      setIsExecuting(false);
    }
  };

  const title = intent ? `${intent.kind}` : "dispatch";

  return (
    <section className="settings-unified">
      <div className="section">
        <div className="section-heading">Dispatcher</div>
        <p className="note">
          This is a universal dispatcher for canonical <code>{DEFAULT_UNIVERSAL_INTENT_SCHEME}://</code>{" "}
          URLs expressed as a path under <code>/app/&lt;appId&gt;/&lt;kind&gt;/...</code>.
        </p>
      </div>

      <div className="section">
        <div className="section-heading">{title}</div>
        {error ? <div className="error">{error}</div> : null}
        <div className="note" style={{ marginTop: 6 }}>
          <code>{raw || "\u2014"}</code>
        </div>

        {intent ? (
          <div className="note" style={{ marginTop: 10 }}>
            {intent.kind === "route" ? (
              <>
                route <code>{intent.path}</code>
              </>
            ) : null}
            {"id" in intent && intent.kind !== "route" ? (
              <>
                id <code>{intent.id}</code>
              </>
            ) : null}
            {"method" in intent ? (
              <>
                method <code>{intent.method}</code>
              </>
            ) : null}
            {"args" in intent ? (
              <>
                {" "}
                args <code>{toStringArgs(intent.args)}</code>
              </>
            ) : null}
          </div>
        ) : null}

        {needsConfirm ? (
          <div className="actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="primary"
              disabled={isExecuting}
              onClick={() => void execute()}
            >
              Execute
            </button>
            <button
              type="button"
              className="secondary"
              disabled={isExecuting}
              onClick={() => navigate({ to: "/plan", replace: true })}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="note" style={{ marginTop: 12 }}>
            Resolving...
          </div>
        )}
      </div>
    </section>
  );
}
