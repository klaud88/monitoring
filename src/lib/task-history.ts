import type { Task, TaskPriority, TaskStatus } from "./types";

/**
 * The task / problem-report fields whose changes are written into the
 * history ("წარმოშობა") with their previous value, so an overwritten comment
 * or text can still be read there. Other edits are logged without a line.
 */
export type TaskChange =
  | { field: "status"; from: TaskStatus; to: TaskStatus }
  | { field: "priority"; from: TaskPriority; to: TaskPriority }
  | { field: "assignees"; from: string[]; to: string[] }
  | { field: "dueDate"; from: string; to: string }
  | { field: "title"; from: string; to: string }
  | { field: "issue"; from: string; to: string }
  | { field: "comment"; from: string; to: string }
  | { field: "phone"; from: string; to: string }
  | { field: "tags"; from: string[]; to: string[] };

export type TaskChangeField = TaskChange["field"];

type TrackedTask = Pick<Task, "status" | "priority" | "assigneeIds" | "dueDate"> &
  Partial<Pick<Task, "title" | "issue" | "comment" | "phone" | "tags">>;

const textFields = ["title", "issue", "comment", "phone"] as const;

const statuses: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];
const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

export function diffTrackedTaskFields(
  before: TrackedTask,
  after: TrackedTask,
): TaskChange[] {
  const changes: TaskChange[] = [];

  if (before.status !== after.status) {
    changes.push({ field: "status", from: before.status, to: after.status });
  }

  if (before.priority !== after.priority) {
    changes.push({ field: "priority", from: before.priority, to: after.priority });
  }

  if (!sameMembers(before.assigneeIds, after.assigneeIds)) {
    changes.push({
      field: "assignees",
      from: [...before.assigneeIds],
      to: [...after.assigneeIds],
    });
  }

  if (before.dueDate !== after.dueDate) {
    changes.push({ field: "dueDate", from: before.dueDate, to: after.dueDate });
  }

  // Skipped only when neither side carries the field (a problem report has
  // no comment of its own); an empty one counts as "".
  for (const field of textFields) {
    if (before[field] === undefined && after[field] === undefined) {
      continue;
    }
    const from = (before[field] ?? "").trim();
    const to = (after[field] ?? "").trim();
    if (from !== to) {
      changes.push({ field, from, to });
    }
  }

  if (before.tags && after.tags && !sameMembers(before.tags, after.tags)) {
    changes.push({ field: "tags", from: [...before.tags], to: [...after.tags] });
  }

  return changes;
}

/** Reads `metadata.changes` back from an audit row, dropping anything malformed. */
export function readTaskChanges(metadata: unknown): TaskChange[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const raw = (metadata as { changes?: unknown }).changes;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isTaskChange);
}

function isTaskChange(value: unknown): value is TaskChange {
  if (!value || typeof value !== "object") {
    return false;
  }

  const change = value as { field?: unknown; from?: unknown; to?: unknown };
  switch (change.field) {
    case "status":
      return (
        statuses.includes(change.from as TaskStatus) &&
        statuses.includes(change.to as TaskStatus)
      );
    case "priority":
      return (
        priorities.includes(change.from as TaskPriority) &&
        priorities.includes(change.to as TaskPriority)
      );
    case "assignees":
    case "tags":
      return isStringArray(change.from) && isStringArray(change.to);
    case "dueDate":
    case "title":
    case "issue":
    case "comment":
    case "phone":
      return typeof change.from === "string" && typeof change.to === "string";
    default:
      return false;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function sameMembers(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}
