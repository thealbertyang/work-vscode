import { createFileRoute } from "@tanstack/react-router";
import { ActionStack } from "../../components/ActionStack";
import { Section } from "../../components/Section";
import { useAppContext } from "../../contexts/app-context";
import { useHandlers } from "../../hooks/use-handlers";

export const Route = createFileRoute("/agents/")({
  component: AgentsPage,
  staticData: {
    tabHidden: true,
  },
});

function AgentsPage() {
  const { isWebview, navigate, startTaskTerminal } = useAppContext();
  const handlers = useHandlers();

  return (
    <div className="hub-layout">
      <div className="hub-stack">
        <Section className="hub-card">
          <div className="hub-card-kicker">Agents</div>
          <h2 className="hub-card-title">Runtime entry point</h2>
          <p className="hub-card-body">
            This is the shell entry for agent work inside the webview. Richer live presence still exists in the Explorer
            and terminal surfaces until the shared aggregate API lands.
          </p>
        </Section>

        <Section className="hub-card">
          <div className="hub-card-kicker">Flow</div>
          <h2 className="hub-card-title">Dispatch, delegate, inspect</h2>
          <p className="hub-card-body">
            Use this section to jump into agent chat, delegation docs, and the registry views that explain runtime
            wiring.
          </p>
        </Section>
      </div>

      <ActionStack
        actions={[
          {
            label: "Open Agent Chat",
            primary: true,
            disabled: !isWebview,
            onClick: () => void handlers.execCommand("work.openAgentChat"),
          },
          {
            label: "Open Task Terminal",
            disabled: !isWebview,
            onClick: () => void startTaskTerminal(),
          },
          {
            label: "Delegation Docs",
            disabled: !isWebview,
            onClick: () => navigate("/system/docs?doc=skills/delegate-work/SKILL.md"),
          },
          {
            label: "Registry",
            disabled: !isWebview,
            onClick: () => navigate("/system/registry"),
          },
        ]}
        context={
          <div>
            <div>Short term: shell entry only.</div>
            <div>Next step: live agent and session summaries from the shared Work aggregate model.</div>
          </div>
        }
      />
    </div>
  );
}
