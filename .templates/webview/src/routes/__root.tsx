import { createRootRoute, Outlet } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import App from "../App";

export const Route = createRootRoute({
  component: () => (
    <NuqsAdapter>
      <App>
        <Outlet />
      </App>
    </NuqsAdapter>
  ),
  notFoundComponent: () => (
    <div className="card">
      <h2>Route not found.</h2>
      <p className="note">The requested page could not be found.</p>
    </div>
  ),
});
