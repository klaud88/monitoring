import type {
  DailyOfflineEntry,
  DailyOfflineLevel,
  UncheckedDay,
} from "@/lib/repositories";

/* Pure day-grading rules shared by the monitoring calendar and a device's
 * own page; safe on the server and the client (rules: deploy/logic.md). */

/* One cell of the device × day calendar. Every working day gets a real
 * status; a day the check could not reach counts as missed (unchecked). */
export type CellState = DailyOfflineLevel | "pending" | "weekend";

export function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** A device's day: weekend → today still open → graded from its drops →
 *  no sign of a check that day (missed, with the logged reason) → clean. */
export function cellStateFor(
  date: string,
  graded: DailyOfflineEntry | undefined,
  uncheckedDays: Map<string, UncheckedDay>,
): CellState {
  if (isWeekend(date)) {
    return "weekend";
  }
  if (graded?.pending) {
    return "pending";
  }
  if (graded) {
    return graded.level;
  }
  return uncheckedDays.has(date) ? "missed" : "ok";
}
