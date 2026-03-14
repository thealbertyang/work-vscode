import { createFileRoute } from "@tanstack/react-router";
import { ActionStack } from "../../components/ActionStack";
import { Section } from "../../components/Section";
import { useAppContext } from "../../contexts/app-context";

export const Route = createFileRoute("/work/")({
  component: WorkPage,
  staticData: {
    tabHidden: true,
  },
});

const WORK_SECTIONS = [
  {
    label: "Plan",
    body: "Triage and sequence what matters next, including weekly and longer-horizon planning.",
    path: "/plan",
  },
  {
    label: "Execute",
    body: "Run automations, execute the active slice, and keep momentum on the current work item.",
    path: "/execute",
  },
  {
    label: "Review",
    body: "Inspect sprint items, open issue detail, and verify work before handing it forward.",
    path: "/review",
  },
  {
    label: "Ship",
    body: "Prepare release proof, promotion steps, and the final runbooks needed for delivery.",
    path: "/ship",
  },
];

function WorkPage() {
  const { navigate, isWebview } = useAppContext();

  return (
    <div className="hub-layout">
      <div className="hub-grid">
        {WORK_SECTIONS.map((section) => (
          <Section key={section.label} className="hub-card">
            <div className="hub-card-kicker">Work</div>
            <h2 className="hub-card-title">{section.label}</h2>
            <p className="hub-card-body">{section.body}</p>
            <button type="button" className="secondary hub-card-action" onClick={() => navigate(section.path)}>
              Open {section.label}
            </button>
          </Section>
        ))}
      </div>

      <ActionStack
        actions={[
          {
            label: "Open Plan",
            primary: true,
            disabled: !isWebview,
            onClick: () => navigate("/plan"),
          },
          {
            label: "Open Execute",
            disabled: !isWebview,
            onClick: () => navigate("/execute"),
          },
          {
            label: "Open Review",
            disabled: !isWebview,
            onClick: () => navigate("/review"),
          },
          {
            label: "Open Ship",
            disabled: !isWebview,
            onClick: () => navigate("/ship"),
          },
        ]}
        context={
          <div>
            <div>Lifecycle stages stay canonical.</div>
            <div>They now live inside Work instead of owning the whole shell.</div>
          </div>
        }
      />
    </div>
  );
}
