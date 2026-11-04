"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, WifiOff, X } from "lucide-react";
import type {
  DailyOfflineEntry,
  DailyOfflineLevel,
  UncheckedDay,
} from "@/lib/repositories";
import type { CellState } from "@/lib/offline-day";

export type { CellState } from "@/lib/offline-day";

/* Shared by the monitoring calendar (/offline-records) and a device's own
 * page: day states, their colours/labels and the day-detail modal. */

/* Mirrors OFFLINE_WINDOW_* in repositories.ts (a client file can't import it). */
export const OFFLINE_WINDOW_START_HOUR = 9;
export const OFFLINE_WINDOW_END_HOUR = 17;

export const levelLabels: Record<DailyOfflineLevel, string> = {
  missed: "გათიშული",
  late: "განახლებული",
  unstable: "არასტაბილური",
  ok: "სტაბილური",
};

export const stateLabels: Record<CellState, string> = {
  ...levelLabels,
  pending: "მიმდინარე",
  weekend: "შაბათ-კვირა",
};

/** The four real day statuses, in legend order: the ones the threshold
 *  chips can pick. */
export const levelOrder: DailyOfflineLevel[] = ["ok", "unstable", "late", "missed"];

export type StatusTally = Record<DailyOfflineLevel, number>;

const levelShortLabels: Record<DailyOfflineLevel, string> = {
  ok: "სტაბ.",
  unstable: "არასტ.",
  late: "განახლ.",
  missed: "გათიშ.",
};

/** Days per status in a range: weekends and today's open day don't count. */
export function tallyStates(states: CellState[]): StatusTally {
  const tally: StatusTally = { ok: 0, unstable: 0, late: 0, missed: 0 };
  states.forEach((state) => {
    if (state in tally) {
      tally[state as DailyOfflineLevel] += 1;
    }
  });
  return tally;
}

/** Missed + renewed + unstable days. */
export function problemTotal(tally: StatusTally) {
  return tally.missed + tally.late + tally.unstable;
}

export function describeTally(tally: StatusTally) {
  const total = levelOrder.reduce((sum, level) => sum + tally[level], 0);
  return `${total} დღიდან: ${levelOrder
    .map((level) => `${levelLabels[level]} ${tally[level]}`)
    .join(" · ")}`;
}

/** One pill per status, in the calendar's own colours. */
export function StatusCounts({ tally }: { tally: StatusTally }) {
  return (
    <span className="status-counts" title={describeTally(tally)}>
      {levelOrder.map((level) => (
        <span
          key={level}
          className={`status-count ${level}${tally[level] ? "" : " zero"}`}
          aria-label={`${levelLabels[level]}: ${tally[level]}`}
        >
          {tally[level]}
        </span>
      ))}
    </span>
  );
}

/** Column heading above the pills. */
export function StatusCountsHead() {
  return (
    <span className="status-counts status-counts-head" aria-hidden="true">
      {levelOrder.map((level) => (
        <span key={level} className="status-count-label" title={levelLabels[level]}>
          {levelShortLabels[level]}
        </span>
      ))}
    </span>
  );
}


/** Above the calendar: every colour and what it means (deploy/logic.md). */
export const legendItems: { state: CellState; hint: string }[] = [
  { state: "ok", hint: "მხოლოდ მოკლე (30 წთ-მდე) გათიშვები" },
  { state: "unstable", hint: "09–17 შორის 3+ ცალკე გათიშვა" },
  { state: "late", hint: "ერთხელ მაინც 30+ წთ გათიშული, დანარჩენ დროს ონლაინ" },
  {
    state: "missed",
    hint: "09–17 შორის 20 წთ უწყვეტად ონლაინ არ ყოფილა. ყვითელი კუთხე — იმ დღეს შემოწმება ვერ შესრულდა; მიზეზი უჯრაზეა",
  },
  { state: "pending", hint: "დღეს: ინფორმაცია გროვდება, სტატუსი 17:00-ზე მიენიჭება" },
  { state: "weekend", hint: "არ ფასდება" },
];

export const WINDOW_MINUTES =
  (OFFLINE_WINDOW_END_HOUR - OFFLINE_WINDOW_START_HOUR) * 60;

export function clockToWindowMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours - OFFLINE_WINDOW_START_HOUR) * 60 + minutes;
}

/** Click on a calendar cell: that day's drops, each with its length, on a
 *  09:00–17:00 strip. Anything not listed was online. */
export function DayDetailModal({
  deviceName,
  date,
  state,
  graded,
  unchecked,
  onClose,
}: {
  deviceName: string;
  date: string;
  state: CellState;
  graded: DailyOfflineEntry | undefined;
  /** Set when no sync succeeded that day: why, from the failure log. */
  unchecked?: UncheckedDay;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const drops = graded?.drops ?? [];
  const judged = graded?.windowMinutes ?? WINDOW_MINUTES;
  const offline = graded?.minutes ?? 0;
  const hours = Array.from(
    { length: OFFLINE_WINDOW_END_HOUR - OFFLINE_WINDOW_START_HOUR + 1 },
    (_, index) => OFFLINE_WINDOW_START_HOUR + index,
  ).filter((hour) => hour % 2 === 1);

  return (
    <div className="day-detail-backdrop" role="presentation" onClick={onClose}>
      <section
        className="day-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">{formatDate(date)}</p>
            <h2 id="day-detail-title">{deviceName}</h2>
            <span className="day-detail-state">
              <i className={`matrix-cell ${state}${unchecked ? " unchecked" : ""}`} />
              {stateLabels[state]}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="დახურვა"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        {unchecked ? (
          <div className="day-detail-unchecked">
            <p>
              <AlertTriangle size={18} />
              <span>
                <strong>სტატუსი ვერ წამოვიდა</strong>
                {unchecked.reason}
              </span>
            </p>
            {unchecked.failures.length ? (
              <ol>
                {unchecked.failures.map((failure, index) => (
                  <li key={`${failure.at}-${index}`}>
                    <time>{failure.at}</time>
                    <code>{failure.message}</code>
                  </li>
                ))}
              </ol>
            ) : null}
            {unchecked.attempts > unchecked.failures.length ? (
              <small>
                ნაჩვენებია ბოლო {unchecked.failures.length} /{" "}
                {unchecked.attempts} ცდიდან (ლოგი: biostar_sync_failures).
              </small>
            ) : null}
            <small>
              ჩანაწერის გარეშე დღე პრობლემად (გათიშულად) ითვლება.
            </small>
          </div>
        ) : null}

        {unchecked && !drops.length ? null : (
          <>
            <div className="day-detail-summary">
              <div>
                <span>გათიშული</span>
                <strong className="off">{formatMinutes(offline)}</strong>
              </div>
              <div>
                <span>ონლაინ</span>
                <strong className="on">{formatMinutes(Math.max(0, judged - offline))}</strong>
              </div>
              <div>
                <span>გათიშვა</span>
                <strong>{drops.length}</strong>
              </div>
            </div>

            <div className="day-detail-strip" aria-hidden="true">
              <div className="day-detail-bar">
                {judged < WINDOW_MINUTES ? (
                  <span
                    className="day-detail-future"
                    style={{ left: `${(judged / WINDOW_MINUTES) * 100}%` }}
                  />
                ) : null}
                {drops.map((drop) => {
                  const start = clockToWindowMinutes(drop.start);
                  return (
                    <span
                      key={drop.start}
                      className="day-detail-drop"
                      style={{
                        left: `${(start / WINDOW_MINUTES) * 100}%`,
                        width: `${Math.max(0.6, (drop.minutes / WINDOW_MINUTES) * 100)}%`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="day-detail-hours">
                {hours.map((hour) => (
                  <span
                    key={hour}
                    style={{
                      left: `${(((hour - OFFLINE_WINDOW_START_HOUR) * 60) / WINDOW_MINUTES) * 100}%`,
                    }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
            </div>

            {drops.length ? (
              <ol className="day-detail-list">
                {drops.map((drop, index) => (
                  <li key={drop.start}>
                    <span className="day-detail-index">{index + 1}</span>
                    <span className="day-detail-time">
                      <WifiOff size={15} />
                      <strong>
                        {drop.start} – {drop.end}
                      </strong>
                      {drop.fromBefore || drop.ongoing ? (
                        <em>
                          {[
                            drop.fromBefore ? "09:00-მდე დაიწყო" : "",
                            drop.ongoing
                              ? judged < WINDOW_MINUTES
                                ? "ჯერ გათიშულია"
                                : "17:00-ის მერეც გრძელდებოდა"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </em>
                      ) : null}
                    </span>
                    <span className="day-detail-length">{formatMinutes(drop.minutes)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="day-detail-empty">
                <CheckCircle2 size={18} />
                09:00–17:00 შორის გათიშვა არ ყოფილა.
              </p>
            )}
            <p className="day-detail-note">
              {state === "weekend"
                ? "შაბათ-კვირა არ ფასდება. "
                : state === "pending"
                  ? "დღე ჯერ არ დასრულებულა: სტატუსი 17:00-ზე მიენიჭება. "
                  : ""}
              დანარჩენ დროს 09:00–17:00 შორის მოწყობილობა ონლაინ იყო.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export function describeDay(
  date: string,
  state: CellState,
  graded: DailyOfflineEntry | undefined,
  unchecked?: UncheckedDay,
) {
  const day = formatDate(date);
  // One line per drop: "10:16–17:00 (6სთ 44წთ)".
  const drops = graded?.drops.length
    ? "\nგათიშული:\n" +
      graded.drops
        .map((drop) => `${drop.start}–${drop.end} (${formatMinutes(drop.minutes)})`)
        .join("\n")
    : "";

  if (unchecked && state === "missed") {
    const log = unchecked.failures.length
      ? "\nლოგი:\n" +
        unchecked.failures
          .map((failure) => `${failure.at} — ${failure.message}`)
          .join("\n")
      : "";
    return `${day} — ${levelLabels.missed}: სტატუსი ვერ წამოვიდა\n${unchecked.reason}${log}${drops}`;
  }

  switch (state) {
    case "weekend":
      return `${day} — შაბათ-კვირა, არ ფასდება${drops}`;
    case "pending":
      return `${day} — მიმდინარე: ინფორმაცია გროვდება, სტატუსი 17:00-ზე${drops}`;
    case "missed":
      return `${day} — გათიშული: 20 წთ უწყვეტად ონლაინ არ ყოფილა${drops}`;
    case "late":
      return `${day} — განახლებული: გაითიშა და ისევ ჩაირთო${drops}`;
    case "unstable":
      return `${day} — არასტაბილური: ${graded?.events ?? 0} გათიშვა${drops}`;
    default:
      return `${day} — ${levelLabels.ok}${drops}`;
  }
}

export function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  if (!hours) {
    return `${minutes} წთ`;
  }
  return minutes ? `${hours}სთ ${minutes}წთ` : `${hours}სთ`;
}

export function formatCellDate(value: string) {
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}.${match[1]}` : value;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ka-GE", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00+04:00`));
}
