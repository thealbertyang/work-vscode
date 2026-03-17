import { StatusDot } from "./StatusDot";

type TaskRowProps = {
  issueKey: string;
  summary: string;
  status: string;
  onClick?: () => void;
};

const statusVariant = (status: string): "ok" | "warn" | "muted" => {
  const lower = status.toLowerCase();
  if (lower === "done" || lower === "closed" || lower === "resolved") return "ok";
  if (lower === "blocked") return "warn";
  return "muted";
};

export function TaskRow({ issueKey, summary, status, onClick }: TaskRowProps) {
  return (
    <button type="button" className="task-row" onClick={onClick}>
      <span className="task-row-key">{issueKey}</span>
      <span className="task-row-summary">{summary}</span>
      <StatusDot variant={statusVariant(status)} label={status} />
    </button>
  );
}
