import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import { ActionStack } from "../../components/ActionStack";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/ship/")({
  component: ShipPage,
  staticData: ROUTE_META.ship,
});

function ShipPage() {
  const { isWebview } = useAppContext();
  const navigate = useNavigate();

  return (
    <div className="card">
      <h2>Ship</h2>
      <p className="note">
        Release preparation lives here: checklists, change summaries, and promotion runbooks.
      </p>

      <ActionStack
        actions={[
          {
            label: "Open Ship Runbook",
            primary: true,
            disabled: !isWebview,
            onClick: () =>
              navigate({ to: "/system/docs", search: { doc: "runbooks/release-promotion.md" } }),
          },
          {
            label: "Open Ship Skill",
            disabled: !isWebview,
            onClick: () =>
              navigate({ to: "/system/docs", search: { doc: "skills/release-promotion/SKILL.md" } }),
          },
          {
            label: "Lifecycle UI",
            disabled: !isWebview,
            onClick: () =>
              navigate({ to: "/system/docs", search: { doc: "docs/lifecycle-ui.md" } }),
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
