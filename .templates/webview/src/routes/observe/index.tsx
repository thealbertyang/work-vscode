import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import { ActionStack } from "../../components/ActionStack";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/observe/")({
  component: ObservePage,
  staticData: ROUTE_META.observe,
});

function ObservePage() {
  const { isWebview } = useAppContext();
  const navigate = useNavigate();

  return (
    <div className="card">
      <h2>Observe</h2>
      <p className="note">
        Signal triage lives here: alerts, logs, errors, and next-step routing back into Plan/Execute.
      </p>

      <ActionStack
        actions={[
          {
            label: "Open Observe Runbook",
            primary: true,
            disabled: !isWebview,
            onClick: () =>
              navigate({ to: "/system/docs", search: { doc: "runbooks/observe-triage.md" } }),
          },
          {
            label: "Open Observe Skill",
            disabled: !isWebview,
            onClick: () =>
              navigate({ to: "/system/docs", search: { doc: "skills/observe-triage/SKILL.md" } }),
          },
          {
            label: "Engineer Work Matrix",
            disabled: !isWebview,
            onClick: () =>
              navigate({ to: "/system/docs", search: { doc: "docs/engineer-work-matrix.md" } }),
          },
          {
            label: "Registry",
            disabled: !isWebview,
            onClick: () => navigate({ to: "/system/registry" }),
          },
        ]}
      />
    </div>
  );
}
