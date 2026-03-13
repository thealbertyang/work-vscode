export type DocsSource = "settings" | "extension" | "local" | "none";

export type DocGroup = "docs" | "runbooks" | "plans" | "skills";

export type DocEntry = {
  id: string;
  title: string;
  group: DocGroup;
  relativePath: string;
};

export type DocsIndex = {
  root: string | null;
  source: DocsSource;
  entries: DocEntry[];
  error?: string;
};

export type DocContent = {
  id: string;
  title: string;
  relativePath: string;
  markdown: string;
};
