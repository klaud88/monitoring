import type { Task, TaskPriority, TaskStatus } from "./types";

/**
 * The task fields whose changes are written into the task's history
 * ("წარმოშობა"). Other edits (title, comment, tags…) are still logged, but
 * without a per-field change line.
 */
export type TaskChange =
  | { field: "status"; from: TaskStatus; to: TaskStatus }
  | { field: "priority"; from: TaskPriority; to: TaskPriority }
  | { field: "assignees"; from: string[]; to: string[] }
  | { field: "dueDate"; from: string; to: string };

type TrackedTask = Pick<Task, "status" | "priority" | "assigneeIds" | "dueDate">;

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
      return isStringArray(change.from) && isStringArray(change.to);
    case "dueDate":
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
