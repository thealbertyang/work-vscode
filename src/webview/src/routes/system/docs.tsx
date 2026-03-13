import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ROUTE_META, parseUniversalIntentUrl, settingKey, SETTINGS_KEYS } from "@shared/contracts";
import { DEFAULT_UNIVERSAL_CONFIG } from "@shared/universal";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type MutableRefObject } from "react";
import { parseAsString, useQueryState } from "nuqs";
import DOMPurify from "dompurify";
import { marked } from "marked";
import mermaid from "mermaid";
import type { DocContent, DocEntry, DocsIndex, DocGroup } from "@shared/docs-contract";
import { parseNavTarget } from "../../lib/parse-nav-target";
import { useHandlers } from "../../hooks/use-handlers";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/system/docs")({
  component: DocsPage,
  staticData: ROUTE_META.systemDocs,
});

const GROUP_LABELS: Record<DocGroup, string> = {
  docs: "Docs",
  runbooks: "Runbooks",
  plans: "Plans",
  skills: "Skills",
};

type Frontmatter = { fields: [string, string][]; body: string };

const extractFrontmatter = (markdown: string): Frontmatter => {
  const source = typeof markdown === "string" ? markdown : String(markdown ?? "");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { fields: [], body: source };
  }
  const fields: [string, string][] = [];
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(":");
    if (sep > 0) {
      fields.push([line.slice(0, sep).trim(), line.slice(sep + 1).trim()]);
    }
  }
  return { fields, body: match[2] };
};

const parseMarkdown = (markdown: string) => {
  const raw = marked.parse(markdown, { gfm: true, breaks: true });
  return DOMPurify.sanitize(raw);
};

const resolveDocTarget = (
  href: string,
  currentId: string,
): { id: string; anchor?: string } | null => {
  const trimmed = String(href ?? "").trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("//")) {
    return null;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }
  if (trimmed.startsWith("#")) {
    return { id: currentId, anchor: trimmed.slice(1) };
  }
  const baseId = currentId.replace(/^\/+/, "");
  let url: URL;
  try {
    url = new URL(trimmed, `https://docs/${baseId}`);
  } catch {
    return null;
  }
  let pathname = url.pathname.replace(/^\/+/, "");
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // ignore decode errors and use the raw path
  }
  if (!pathname.toLowerCase().endsWith(".md")) {
    return null;
  }
  return { id: pathname, anchor: url.hash ? url.hash.slice(1) : "" };
};

const scrollToAnchor = (anchor: string, container?: HTMLElement | null): boolean => {
  if (!anchor) {
    return false;
  }
  const target =
    container?.querySelector<HTMLElement>(`[id="${anchor.replace(/"/g, '\\"')}"]`) ??
    document.getElementById(anchor);
  if (!target) {
    return false;
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
};

const renderMermaid = async (
  container: HTMLElement | null,
  initializedRef: MutableRefObject<boolean>,
) => {
  if (!container || !container.isConnected) {
    return;
  }
  const codeBlocks = Array.from(
    container.querySelectorAll("pre code.language-mermaid, pre code.lang-mermaid"),
  );
  if (codeBlocks.length === 0) {
    return;
  }

  try {
    if (!mermaid) {
      return;
    }

    if (!initializedRef.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "strict",
        flowchart: {
          useMaxWidth: true,
        },
      });
      initializedRef.current = true;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    let index = 0;
    for (const code of codeBlocks) {
      const parent = code.parentElement;
      if (!parent) {
        continue;
      }
      const diagram = code.textContent ?? "";
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid";
      parent.replaceWith(wrapper);

      if (!wrapper.isConnected) {
        continue;
      }

      const id = `mermaid-${Date.now()}-${index++}`;
      try {
        const { svg, bindFunctions } = await mermaid.render(id, diagram, wrapper);
        if (!wrapper.isConnected) {
          continue;
        }
        wrapper.innerHTML = svg;
        bindFunctions?.(wrapper);
      } catch (error) {
        wrapper.innerHTML = `<pre class="mermaid-error">${String(
          (error as Error)?.message ?? error,
        )}</pre>`;
        console.warn("Mermaid render failed", error);
      }
    }
  } catch (error) {
    console.warn("Mermaid render failed", error);
  }
};

function DocsPage() {
  const handlers = useHandlers();
  const { isWebview, universalConfig } = useAppContext();
  const navigate = useNavigate();

  const openDocsPathSetting = () => {
    void handlers.execCommand(
      "workbench.action.openSettings",
      settingKey(SETTINGS_KEYS.DOCS_PATH),
    );
  };

  const allowedIntentSchemes = useMemo(() => {
    const configured = universalConfig?.app.intentScheme;
    const legacy = DEFAULT_UNIVERSAL_CONFIG.app.intentScheme ?? "work";
    return configured ? [configured, legacy] : [legacy];
  }, [universalConfig?.app.intentScheme]);

  const [index, setIndex] = useState<DocsIndex | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState("");
  const [activeId, setActiveId] = useState<string>("");
  const [content, setContent] = useState<DocContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState("");
  const [pendingAnchor, setPendingAnchor] = useState("");
  const markdownRef = useRef<HTMLElement | null>(null);
  const mermaidReadyRef = useRef(false);

  const [docParam, setDocParam] = useQueryState(
    "doc",
    parseAsString.withDefault("").withOptions({ history: "replace" }),
  );
  const [anchorParam, setAnchorParam] = useQueryState(
    "anchor",
    parseAsString.withDefault("").withOptions({ history: "replace" }),
  );

  const entries = index?.entries ?? [];

  const groupedEntries = useMemo(() => {
    const grouped: Record<DocGroup, DocEntry[]> = { docs: [], runbooks: [], plans: [], skills: [] };
    entries.forEach((entry) => grouped[entry.group].push(entry));
    return grouped;
  }, [entries]);

  useEffect(() => {
    if (!isWebview) {
      return;
    }
    let cancelled = false;
    setIndexLoading(true);
    setIndexError("");
    handlers
      .getDocsIndex()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setIndex(result);
        setIndexError(result.error ?? "");
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Unable to load docs index.";
        setIndexError(message);
        setIndex(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIndexLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handlers, isWebview]);

  useEffect(() => {
    if (!index) {
      return;
    }
    if (docParam) {
      const match = index.entries.find((entry) => entry.id === docParam);
      if (match && match.id !== activeId) {
        setActiveId(match.id);
        return;
      }
    }
    if (!activeId && index.entries.length > 0) {
      const fallbackId = index.entries[0].id;
      setActiveId(fallbackId);
      void setDocParam(fallbackId);
      void setAnchorParam(null);
    }
  }, [index, activeId, docParam, setAnchorParam, setDocParam]);

  useEffect(() => {
    if (!isWebview || !activeId) {
      setContent(null);
      setContentError("");
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContentError("");
    handlers
      .getDocContent(activeId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result) {
          setContent(null);
          setContentError("Document not found.");
          return;
        }
        setContent(result);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Unable to load document.";
        setContentError(message);
        setContent(null);
      })
      .finally(() => {
        if (!cancelled) {
          setContentLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, handlers, isWebview]);

  useEffect(() => {
    if (!pendingAnchor) {
      return;
    }
    if (!content) {
      return;
    }
    const didScroll = scrollToAnchor(pendingAnchor, markdownRef.current);
    if (didScroll) {
      setPendingAnchor("");
    }
  }, [pendingAnchor, content]);

  useEffect(() => {
    const next = anchorParam.trim();
    if (!next) {
      return;
    }
    setPendingAnchor(next);
  }, [anchorParam]);

  const { frontmatter, markdownHtml } = useMemo(() => {
    if (!content) {
      return { frontmatter: [] as [string, string][], markdownHtml: "" };
    }
    const { fields, body } = extractFrontmatter(content.markdown);
    return { frontmatter: fields, markdownHtml: parseMarkdown(body) };
  }, [content]);

  useEffect(() => {
    void renderMermaid(markdownRef.current, mermaidReadyRef);
  }, [markdownHtml]);

  const selectDoc = (nextId: string, anchor?: string) => {
    if (!nextId) {
      return;
    }
    if (nextId !== activeId) {
      setActiveId(nextId);
    }
    const nextAnchor = String(anchor ?? "").trim();
    if (nextAnchor) {
      setPendingAnchor(nextAnchor);
    }
    if (docParam !== nextId) {
      void setDocParam(nextId);
    }
    void setAnchorParam(nextAnchor ? nextAnchor : null);
  };

  const sourceLabel = index?.source
    ? index.source === "settings"
      ? "Settings"
      : index.source === "extension"
        ? "Extension"
        : index.source === "local"
          ? "Local"
          : "None"
    : "None";

  const handleMarkdownClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest("a") as HTMLAnchorElement | null;
    if (!link) {
      return;
    }
    const href = String(link.getAttribute("href") ?? "");
    const trimmed = href.trim();

    // Treat canonical universal links as internal navigation via the /app dispatcher.
    if (parseUniversalIntentUrl(trimmed, allowedIntentSchemes)) {
      event.preventDefault();
      const target = parseNavTarget(trimmed);
      if (target) {
        const [pathPart, queryPart] = target.split("?");
        const search = queryPart ? Object.fromEntries(new URLSearchParams(queryPart).entries()) : undefined;
        navigate({ to: pathPart, search });
      }
      return;
    }

    const isExternal =
      trimmed.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    if (!trimmed || isExternal) {
      return;
    }
    event.preventDefault();
    const baseId = content?.relativePath || activeId;
    const docTarget = baseId ? resolveDocTarget(href, baseId) : null;
    if (!docTarget && baseId) {
      void handlers.revealDocAsset(baseId, href);
    }
    if (!docTarget) {
      return;
    }
    if (docTarget.id !== activeId) {
      selectDoc(docTarget.id, docTarget.anchor ?? "");
      return;
    }
    if (docTarget.anchor) {
      void setAnchorParam(docTarget.anchor);
      scrollToAnchor(docTarget.anchor, markdownRef.current);
    }
  };

  if (!isWebview) {
    return (
      <section className="grid">
        <div className="card">
          <h2>Docs preview unavailable</h2>
          <p className="note">Open the extension webview inside VS Code to browse runbooks.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="docs-layout">
      <div className="card docs-sidebar">
        <div className="card-header">
          <div>
            <div className="eyebrow">Library</div>
            <h2>Docs</h2>
            <p className="card-sub">
              Browse Markdown docs from the{" "}
              <a
                href="#"
                className="inline-route-link"
                onClick={(e) => { e.preventDefault(); openDocsPathSetting(); }}
              >
                configured folder
              </a>.
            </p>
          </div>
          <span className="pill pill-muted">{sourceLabel}</span>
        </div>
        {index?.root ? (
          <div className="doc-root">
            <a
              href="#"
              className="doc-root-path"
              onClick={(e) => { e.preventDefault(); openDocsPathSetting(); }}
              title="Open docs path setting"
            >
              {index.root}
            </a>
          </div>
        ) : null}
        {indexError ? <div className="error">{indexError}</div> : null}
        {indexLoading ? <p className="note">Loading docs index...</p> : null}
        {!indexLoading && entries.length === 0 && !indexError ? (
          <p className="note">
            No Markdown files found.{" "}
            <a
              href="#"
              className="inline-route-link"
              onClick={(e) => { e.preventDefault(); openDocsPathSetting(); }}
            >
              Configure the docs folder
            </a>.
          </p>
        ) : null}
        {entries.length > 0 ? (
          <div className="doc-groups">
            {Object.entries(groupedEntries).map(([group, items]) => {
              if (items.length === 0) {
                return null;
              }
              return (
                <div key={group} className="doc-group">
                  <div className="eyebrow">{GROUP_LABELS[group as DocGroup]}</div>
                  <div className="doc-list">
                    {items.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={`doc-item ${activeId === entry.id ? "active" : ""}`}
                        onClick={() => selectDoc(entry.id)}
                      >
                        <span className="doc-title">{entry.title}</span>
                        <span className="doc-path">{entry.relativePath}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="card docs-content">
        {content?.relativePath ? (
          <nav className="docs-breadcrumb">
            {content.relativePath.split("/").map((segment, i, arr) => {
              const isLast = i === arr.length - 1;
              return (
                <span key={i} className="docs-breadcrumb-segment">
                  {i > 0 ? <span className="docs-breadcrumb-sep">/</span> : null}
                  {isLast ? (
                    <a
                      href="#"
                      className="docs-breadcrumb-file"
                      onClick={(e) => {
                        e.preventDefault();
                        void handlers.openDocInEditor(content.id);
                      }}
                      title="Reveal in explorer"
                    >
                      {segment}
                    </a>
                  ) : (
                    <span className="docs-breadcrumb-dir">{segment}</span>
                  )}
                </span>
              );
            })}
          </nav>
        ) : null}
        {contentLoading ? (
          <p className="note">Loading document...</p>
        ) : contentError ? (
          <p className="note">{contentError}</p>
        ) : content ? (
          <article
            className="markdown-body"
            onClick={handleMarkdownClick}
            ref={markdownRef}
          >
            {frontmatter.length > 0 ? (
              <table className="frontmatter-table">
                <tbody>
                  {frontmatter.map(([key, value]) => (
                    <tr key={key}>
                      <th>{key}</th>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div dangerouslySetInnerHTML={{ __html: markdownHtml }} />
          </article>
        ) : (
          <p className="note">Select a document from the list to preview it here.</p>
        )}
      </div>
    </section>
  );
}
