import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import { ActionStack } from "../../components/ActionStack";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/plan/quarterly")({
  component: QuarterlyPage,
  staticData: ROUTE_META.planQuarterly,
});

function QuarterlyPage() {
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
          <div className="section-label">Quarterly Reset</div>
          <p className="note">Review KPIs, choose bets, and commit next milestones.</p>
          <p className="note">Coming soon: initiative scoring + drift detection.</p>
        </div>
      </div>

      <ActionStack
        actions={[
          {
            label: "Reminder UI",
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
            label: "Lifecycle UI",
            disabled: !isWebview,
            onClick: () => openDoc("docs/lifecycle-ui.md"),
          },
        ]}
        context={<div>Gate: confirm changes to quarterly scope before publishing.</div>}
      />
    </div>
  );
}
