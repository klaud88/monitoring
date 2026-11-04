import type {
  DailyOfflineEntry,
  DailyOfflineLevel,
} from "@/lib/repositories";

/* Pure day-grading rules shared by the monitoring calendar and a device's
 * own page; safe on the server and the client (rules: deploy/logic.md). */

/* One cell of the device × day calendar. */
export type CellState = DailyOfflineLevel | "pending" | "weekend" | "no-data";

export type BlackoutStat = { online: number; total: number };

/** A day on which fewer devices than this share got online is the link's
 *  fault (BioStar unreachable), not the gardens': no data for anyone. */
export const BLACKOUT_ONLINE_SHARE = 0.2;

export function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Per day: how many of ALL added devices (every garden, excluded ones
 *  aside) got online. Under 20% means the check could not reach them, so
 *  nobody is graded that day. */
export function computeBlackoutStats(
  levels: DailyOfflineEntry[],
  activeDeviceIds: Set<string>,
) {
  const missedByDay = new Map<string, number>();
  levels.forEach((entry) => {
    if (
      entry.level === "missed" &&
      !entry.pending &&
      activeDeviceIds.has(entry.deviceId)
    ) {
      missedByDay.set(entry.date, (missedByDay.get(entry.date) ?? 0) + 1);
    }
  });
  const stats = new Map<string, BlackoutStat>();
  const total = activeDeviceIds.size;
  missedByDay.forEach((missed, date) => {
    if (total && (total - missed) / total < BLACKOUT_ONLINE_SHARE) {
      stats.set(date, { online: total - missed, total });
    }
  });
  return stats;
}

/** Why a day has no data, with the numbers behind the 20% rule. */
export function noDataNoteFor(stats: BlackoutStat | undefined) {
  if (!stats) {
    return "ამ დღეს შემოწმება არ მუშაობდა";
  }
  const share = Math.round((stats.online / stats.total) * 100);
  return `კავშირი ვერ დამყარდა — ყველა მოწყობილობიდან (${stats.total}) ონლაინ იყო მხოლოდ ${stats.online} (${share}%)`;
}

/** A device's day: weekend → today still open → link down for nearly
 *  everyone → graded → checked and clean → no data. Days before the
 *  5-minute check (only the 09:00 snapshot) are no data too. */
export function cellStateFor(
  date: string,
  graded: DailyOfflineEntry | undefined,
  blackoutDays: Set<string>,
  coveredDays: Set<string>,
): CellState {
  if (isWeekend(date)) {
    return "weekend";
  }
  if (graded?.pending) {
    return "pending";
  }
  if (blackoutDays.has(date)) {
    return "no-data";
  }
  if (graded) {
    return graded.level;
  }
  return coveredDays.has(date) ? "ok" : "no-data";
}
