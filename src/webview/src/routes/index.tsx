import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
  staticData: {
    tabHidden: true,
  },
});

function IndexRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/now", replace: true });
  }, [navigate]);
  return null;
}
