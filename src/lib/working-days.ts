import type { TaskPriority } from "./types";

/**
 * Deadlines for reported problems are counted in working days: weekends are
 * skipped, public holidays are not (there is no holiday calendar in the app).
 */
export const PROBLEM_REPORT_DUE_WORKING_DAYS = 5;

/** Roles allowed to override the computed deadline. */
const dueDateRoles = new Set(["admin", "technician", "dispatcher"]);

export function canChooseDueDate(role?: string | null) {
  return Boolean(role && dueDateRoles.has(role));
}

export function addWorkingDays(from: Date, days: number) {
  const date = new Date(from.getTime());
  let remaining = Math.max(0, Math.trunc(days));

  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return date;
}

/** `YYYY-MM-DD`, five working days out by default. */
export function workingDayDueDate(
  days: number = PROBLEM_REPORT_DUE_WORKING_DAYS,
  from: Date = new Date(),
) {
  const date = addWorkingDays(from, days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Default deadline for a new task, counted in working days from today:
 * low → 10, normal → 5, high → 2, urgent → the same day.
 */
export const TASK_PRIORITY_DUE_WORKING_DAYS = {
  low: 10,
  normal: 5,
  high: 2,
  urgent: 0,
} as const satisfies Record<TaskPriority, number>;

/** `YYYY-MM-DD` deadline for a new task with the given priority. */
export function taskDueDateForPriority(
  priority: TaskPriority,
  from: Date = new Date(),
) {
  return workingDayDueDate(TASK_PRIORITY_DUE_WORKING_DAYS[priority], from);
}
