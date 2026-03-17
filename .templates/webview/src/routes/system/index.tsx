import { createFileRoute } from "@tanstack/react-router";
import { ActionStack } from "../../components/ActionStack";
import { Section } from "../../components/Section";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/system/")({
  component: SystemPage,
  staticData: {
    tabHidden: true,
  },
});

function SystemPage() {
  const { navigate, isWebview } = useAppContext();

  return (
    <div className="hub-layout">
      <div className="hub-grid">
        <Section className="hub-card">
          <div className="hub-card-kicker">System</div>
          <h2 className="hub-card-title">Settings</h2>
          <p className="hub-card-body">Connect Jira, inspect credentials, and operate the local extension environment.</p>
          <button type="button" className="secondary hub-card-action" onClick={() => navigate("/system/settings")}>
            Open Settings
          </button>
        </Section>

        <Section className="hub-card">
          <div className="hub-card-kicker">System</div>
          <h2 className="hub-card-title">Docs</h2>
          <p className="hub-card-body">Browse docs, runbooks, plans, and skill references without leaving the shell.</p>
          <button type="button" className="secondary hub-card-action" onClick={() => navigate("/system/docs")}>
            Open Docs
          </button>
        </Section>

        <Section className="hub-card">
          <div className="hub-card-kicker">System</div>
          <h2 className="hub-card-title">Registry</h2>
          <p className="hub-card-body">Inspect routes, actions, storage, topology, and the generated universal contract surface.</p>
          <button type="button" className="secondary hub-card-action" onClick={() => navigate("/system/registry")}>
            Open Registry
          </button>
        </Section>
      </div>

      <ActionStack
        actions={[
          {
            label: "Open Settings",
            primary: true,
            disabled: !isWebview,
            onClick: () => navigate("/system/settings"),
          },
          {
            label: "Open Docs",
            disabled: !isWebview,
            onClick: () => navigate("/system/docs"),
          },
          {
            label: "Open Registry",
            disabled: !isWebview,
            onClick: () => navigate("/system/registry"),
          },
        ]}
        context={
          <div>
            <div>System is utility space.</div>
            <div>It stays reachable without competing with active work in the primary shell.</div>
          </div>
        }
      />
    </div>
  );
}
