import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import { ActionStack } from "../../components/ActionStack";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/plan/career")({
  component: CareerPage,
  staticData: ROUTE_META.planCareer,
});

function CareerPage() {
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
          <div className="section-label">Career Growth</div>
          <p className="note">Track skills in motion, pick stretch work, and log progress.</p>
          <p className="note">Coming soon: skill cadence + reminders powered by plans/skills.</p>
        </div>
      </div>

      <ActionStack
        actions={[
          {
            label: "Engineer Matrix",
            primary: true,
            disabled: !isWebview,
            onClick: () => openDoc("docs/engineer-work-matrix.md"),
          },
          {
            label: "Reminder UI",
            disabled: !isWebview,
            onClick: () => openDoc("docs/reminder-ui.md"),
          },
          {
            label: "Plans",
            disabled: !isWebview,
            onClick: () => openDoc("plans/luminous-jingling-thompson.md"),
          },
          {
            label: "Skills",
            disabled: !isWebview,
            onClick: () => openDoc("skills/README.md"),
          },
        ]}
        context={<div>Gate: confirm before committing new long-horizon goals.</div>}
      />
    </div>
  );
}
