import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import { ActionStack } from "../../components/ActionStack";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/plan/monthly")({
  component: MonthlyPage,
  staticData: ROUTE_META.planMonthly,
});

function MonthlyPage() {
  const navigate = useNavigate();
  const { isWebview } = useAppContext();

  const openDoc = (id: string) => {
    navigate({
      to: "/system/docs",
      search: { doc: id },
    });
  };

  return (
    <div className="plan-layout">
      <div className="plan-worklist">
        <div className="page-reminder">
          <div className="section-label">Monthly Check-in</div>
          <p className="note">Re-align scope, track initiative drift, and update notes.</p>
          <p className="note">Coming soon: automated drift signals and checklists.</p>
        </div>
      </div>

      <ActionStack
        actions={[
          {
            label: "PM Matrix",
            primary: true,
            disabled: !isWebview,
            onClick: () => openDoc("docs/project-management-matrix.md"),
          },
          {
            label: "Reminder UI",
            disabled: !isWebview,
            onClick: () => openDoc("docs/reminder-ui.md"),
          },
          {
            label: "Lifecycle UI",
            disabled: !isWebview,
            onClick: () => openDoc("docs/lifecycle-ui.md"),
          },
          {
            label: "Main App Usage",
            disabled: !isWebview,
            onClick: () => openDoc("docs/main-app-usage.md"),
          },
        ]}
        context={<div>Gate: approve before sending updates to external systems.</div>}
      />
    </div>
  );
}
