import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import { ActionStack } from "../../components/ActionStack";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/plan/weekly")({
  component: WeeklyPage,
  staticData: ROUTE_META.planWeekly,
});

function WeeklyPage() {
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
          <div className="section-label">Weekly Review</div>
          <p className="note">Review wins, misses, risks, and set next week’s goals.</p>
          <p className="note">Use the docs/runbooks below as the source of truth.</p>
        </div>
      </div>

      <ActionStack
        actions={[
          {
            label: "Open Reminder UI",
            primary: true,
            disabled: !isWebview,
            onClick: () => openDoc("docs/reminder-ui.md"),
          },
          {
            label: "PM Matrix",
            disabled: !isWebview,
            onClick: () => openDoc("docs/project-management-matrix.md"),
          },
          {
            label: "Engineer Matrix",
            disabled: !isWebview,
            onClick: () => openDoc("docs/engineer-work-matrix.md"),
          },
          {
            label: "Triage Runbook",
            disabled: !isWebview,
            onClick: () => openDoc("runbooks/automation-triage.md"),
          },
        ]}
        context={<div>Gate: confirm before creating/updating tasks.</div>}
      />
    </div>
  );
}
