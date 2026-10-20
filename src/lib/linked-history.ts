import { getEntityAuditTrail, type EntityAuditEntry } from "./repositories";

/*
 * A problem report and the task made from it are one record, so both detail
 * pages show one history: the report's edits plus the task's. A report edit
 * also writes a mirror row on the task (metadata.source = "problem_report");
 * with the report included that row is the same change twice, so it's left out.
 */

const reportEditActions = new Set(["problem_report.update"]);
const taskEditActions = new Set([
  "task.update",
  "task.status_local_change",
  "task.assign",
]);

export type LinkedHistory = {
  /** Who started the record: the report's creator, else the task's. */
  created?: EntityAuditEntry;
  /** Every edit, newest first. */
  edits: EntityAuditEntry[];
};

export async function getLinkedHistory({
  reportId,
  taskId,
}: {
  reportId?: string;
  taskId?: string;
}): Promise<LinkedHistory> {
  const [reportTrail, taskTrail] = await Promise.all([
    reportId ? getEntityAuditTrail("problem_report", reportId) : [],
    taskId ? getEntityAuditTrail("task", taskId) : [],
  ]);

  const edits = [
    ...reportTrail.filter((entry) => reportEditActions.has(entry.action)),
    ...taskTrail.filter(
      (entry) =>
        taskEditActions.has(entry.action) &&
        !(reportId && isFromReport(entry.metadata)),
    ),
  ]
    // Trails come oldest first; reversing before a stable sort keeps
    // same-second rows newest first too.
    .reverse()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    created:
      reportTrail.find((entry) => entry.action === "problem_report.create") ??
      taskTrail.find((entry) => entry.action === "task.create"),
    edits,
  };
}

function isFromReport(metadata: unknown) {
  return (
    Boolean(metadata) &&
    typeof metadata === "object" &&
    (metadata as { source?: unknown }).source === "problem_report"
  );
}
