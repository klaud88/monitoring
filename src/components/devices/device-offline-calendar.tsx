"use client";

import { useMemo, useState } from "react";
import {
  DayDetailModal,
  describeDay,
  formatCellDate,
  legendItems,
  stateLabels,
  StatusCounts,
  tallyStates,
} from "@/components/offline-records/offline-day";
import { cellStateFor } from "@/lib/offline-day";
import type { DailyOfflineEntry, UncheckedDay } from "@/lib/repositories";

const rangePresets = [
  { days: 7, label: "7 დღე" },
  { days: 30, label: "30 დღე" },
  { days: 90, label: "90 დღე" },
];

type Props = {
  deviceName: string;
  /** This device's graded days only. */
  levels: DailyOfflineEntry[];
  /** Days no sync succeeded (shared by every device), with the reason. */
  uncheckedDays: UncheckedDay[];
};

/** One device's row of the monitoring calendar: same cells, same colours,
 *  same day modal as /offline-records. */
export function DeviceOfflineCalendar({
  deviceName,
  levels,
  uncheckedDays,
}: Props) {
  const [rangeDays, setRangeDays] = useState(30);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const levelByDay = useMemo(
    () => new Map(levels.map((entry) => [entry.date, entry])),
    [levels],
  );
  const uncheckedMap = useMemo(
    () => new Map(uncheckedDays.map((day) => [day.date, day])),
    [uncheckedDays],
  );

  /* Same range and order as the calendar: today first, N days back. */
  const days = useMemo(() => {
    const result: { date: string; isMonthStart: boolean }[] = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - rangeDays);
    const end = new Date().toISOString().slice(0, 10);
    while (result.length <= rangeDays) {
      const date = cursor.toISOString().slice(0, 10);
      result.push({ date, isMonthStart: cursor.getUTCDate() === 1 });
      if (date >= end) {
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result.reverse().map((day) => {
      const graded = levelByDay.get(day.date);
      return {
        ...day,
        graded,
        state: cellStateFor(day.date, graded, uncheckedMap),
        // Only an ungraded day is "unchecked": drops prove a check ran.
        unchecked: graded ? undefined : uncheckedMap.get(day.date),
      };
    });
  }, [levelByDay, rangeDays, uncheckedMap]);

  const tally = tallyStates(days.map((day) => day.state));
  const selected = selectedDate
    ? days.find((day) => day.date === selectedDate)
    : undefined;

  return (
    <div className="device-offline-calendar">
      <div className="device-offline-tools">
        <div className="preset-switch" role="group" aria-label="პერიოდი">
          {rangePresets.map((preset) => (
            <button
              key={preset.days}
              type="button"
              className={rangeDays === preset.days ? "active" : ""}
              onClick={() => setRangeDays(preset.days)}
              aria-pressed={rangeDays === preset.days}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <StatusCounts tally={tally} />
      </div>

      <span className="matrix-legend">
        {legendItems.map((item) => (
          <span key={item.state} className="matrix-legend-item" title={item.hint}>
            <i className={`matrix-cell ${item.state}`} />
            {stateLabels[item.state]}
          </span>
        ))}
      </span>

      <div className="device-offline-days">
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            className={`matrix-cell ${day.state}${day.unchecked ? " unchecked" : ""}${day.isMonthStart ? " month-start" : ""}${selectedDate === day.date ? " picked" : ""}`}
            title={describeDay(day.date, day.state, day.graded, day.unchecked)}
            onClick={() =>
              setSelectedDate(selectedDate === day.date ? null : day.date)
            }
          >
            {formatCellDate(day.date)}
          </button>
        ))}
      </div>
      <p className="muted device-offline-hint">
        უჯრაზე დაწკაპუნება დღის გათიშვებს აჩვენებს.
      </p>

      {selected ? (
        <DayDetailModal
          deviceName={deviceName}
          date={selected.date}
          state={selected.state}
          graded={selected.graded}
          unchecked={selected.unchecked}
          onClose={() => setSelectedDate(null)}
        />
      ) : null}
    </div>
  );
}
