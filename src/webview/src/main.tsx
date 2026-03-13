import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { createRouter } from "./router";
import "./index.css";

// Sync color-scheme with VS Code theme before first paint.
// VS Code sets body.vscode-dark / body.vscode-light but doesn't set
// color-scheme, so light-dark() would otherwise follow OS preference.
(() => {
  const cl = document.body.classList;
  if (cl.contains("vscode-dark") || cl.contains("vscode-high-contrast")) {
    document.documentElement.style.colorScheme = "dark";
  } else if (cl.contains("vscode-light") || cl.contains("vscode-high-contrast-light")) {
    document.documentElement.style.colorScheme = "light";
  }
  // Re-sync if VS Code changes the theme at runtime.
  new MutationObserver(() => {
    const dark = cl.contains("vscode-dark") || cl.contains("vscode-high-contrast");
    const light = cl.contains("vscode-light") || cl.contains("vscode-high-contrast-light");
    if (dark) document.documentElement.style.colorScheme = "dark";
    else if (light) document.documentElement.style.colorScheme = "light";
  }).observe(document.body, { attributeFilter: ["class"] });
})();

const router = createRouter();

const rootEl = document.getElementById("root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<RouterProvider router={router} />);
}
