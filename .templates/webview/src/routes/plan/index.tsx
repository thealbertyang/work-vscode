import { createFileRoute } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import { TriageBoard } from "../../components/TriageBoard";

export const Route = createFileRoute("/plan/")({
  component: PlanPage,
  staticData: ROUTE_META.plan,
});

function PlanPage() {
  return <TriageBoard />;
}
