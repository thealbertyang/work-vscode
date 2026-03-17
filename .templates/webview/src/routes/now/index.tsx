import { createFileRoute } from "@tanstack/react-router";
import { TriageBoard } from "../../components/TriageBoard";

export const Route = createFileRoute("/now/")({
  component: NowPage,
  staticData: {
    tabHidden: true,
  },
});

function NowPage() {
  return <TriageBoard />;
}
