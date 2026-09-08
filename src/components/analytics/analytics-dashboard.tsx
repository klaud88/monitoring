"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Download, Tags, WifiOff } from "lucide-react";
import type { Device, OfflineSnapshot, OfflineSummary } from "@/lib/types";

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(now.getFullYear() - 1);

type AnalyticsEvent = {
  id: string;
  deviceId: string;
  deviceName: string;
  region: string;
  tags: string[];
  happenedAt: string;
  durationMinutes?: number;
};

type Bucket = {
  key: string;
  label: string;
  fullLabel: string;
  count: number;
  devices: number;
};

type Preset = "30d" | "3m" | "12m" | "custom";

const presetLabels: Record<Preset, string> = {
  "30d": "30 დღე",
  "3m": "3 თვე",
  "12m": "12 თვე",
  custom: "პერიოდი",
};

const monthNames = [
  "იან",
  "თებ",
  "მარ",
  "აპრ",
  "მაი",
  "ივნ",
  "ივლ",
  "აგვ",
  "სექ",
  "ოქტ",
  "ნოე",
  "დეკ",
];

const monthNamesLong = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
];

export function AnalyticsDashboard({
  devices,
  snapshots,
}: {
  devices: Device[];
  snapshots: OfflineSnapshot[];
}) {
  const [preset, setPreset] = useState<Preset>("12m");
  const [fromDate, setFromDate] = useState(oneYearAgo.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(now.toISOString().slice(0, 10));
  const [hoveredBucket, setHoveredBucket] = useState<string | null>(null);

  const activeDevices = useMemo(
    () => devices.filter((device) => !device.isExcluded),
    [devices],
  );
  const deviceMap = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );

  const events = useMemo(
    () => collectEvents(activeDevices, deviceMap, snapshots, fromDate, toDate),
    [activeDevices, deviceMap, snapshots, fromDate, toDate],
  );

  /** The equally long window immediately before the selected one, so the
   *  headline number can be compared against something real. */
  const previousEvents = useMemo(() => {
    const previous = shiftRangeBack(fromDate, toDate);
    if (!previous) {
      return null;
    }
    return collectEvents(
      activeDevices,
      deviceMap,
      snapshots,
      previous.from,
      previous.to,
    );
  }, [activeDevices, deviceMap, snapshots, fromDate, toDate]);

  const deviceSummary = useMemo(
    () =>
      rank(
        events.map((event) => ({
          id: event.deviceId,
          label: event.deviceName,
        })),
      ),
    [events],
  );

  const regionSummary = useMemo(
    () =>
      rank(
        events.map((event) => ({
          id: event.region,
          label: event.region,
        })),
      ),
    [events],
  );

  const tagSummary = useMemo(
    () =>
      rank(
        events.flatMap((event) =>
          event.tags.map((tag) => ({
            id: tag,
            label: tag,
          })),
        ),
      ),
    [events],
  );

  const buckets = useMemo(
    () => bucketEvents(events, fromDate, toDate),
    [events, fromDate, toDate],
  );

  const durations = events
    .map((event) => event.durationMinutes)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const averageDuration = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;
  const longestEvent = events.reduce<AnalyticsEvent | null>(
    (max, event) =>
      !max || (event.durationMinutes ?? 0) > (max.durationMinutes ?? 0)
        ? event
        : max,
    null,
  );

  const change =
    previousEvents && previousEvents.length
      ? Math.round(
          ((events.length - previousEvents.length) / previousEvents.length) * 100,
        )
      : null;

  const peak = buckets.reduce<Bucket | null>(
    (max, bucket) => (!max || bucket.count > max.count ? bucket : max),
    null,
  );
  const axisMax = niceCeiling(peak?.count ?? 0);
  const hovered = buckets.find((bucket) => bucket.key === hoveredBucket) ?? null;

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === "custom") {
      return;
    }

    const to = new Date();
    const from = new Date(to);
    if (next === "30d") {
      from.setDate(to.getDate() - 29);
    } else if (next === "3m") {
      from.setMonth(to.getMonth() - 3);
    } else {
      from.setFullYear(to.getFullYear() - 1);
    }

    setFromDate(from.toISOString().slice(0, 10));
    setToDate(to.toISOString().slice(0, 10));
  }

  function exportCsv() {
    const header = ["თარიღი", "ბაღი", "რაიონი", "ტეგები", "ხანგრძლივობა (წთ)"];
    const rows = [...events]
      .sort((a, b) => a.happenedAt.localeCompare(b.happenedAt))
      .map((event) => [
        event.happenedAt.slice(0, 10),
        event.deviceName,
        event.region,
        event.tags.join(" / "),
        event.durationMinutes ? String(event.durationMinutes) : "",
      ]);

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\r\n");
    const blob = new Blob([`﻿${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `offline-${fromDate}-${toDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="analytics-page">
      <section className="analytics-head">
        <div>
          <h1>Offline სიხშირე</h1>
          <p>
            {formatDisplayDate(fromDate)} — {formatDisplayDate(toDate)} ·{" "}
            {activeDevices.length} მოწყობილობა
          </p>
        </div>
        <div className="analytics-head-actions">
          <div className="preset-switch" role="group" aria-label="პერიოდი">
            {(Object.keys(presetLabels) as Preset[]).map((value) => (
              <button
                key={value}
                type="button"
                className={preset === value ? "active" : ""}
                onClick={() => applyPreset(value)}
                aria-pressed={preset === value}
              >
                {presetLabels[value]}
              </button>
            ))}
          </div>
          <button className="ghost-button" type="button" onClick={exportCsv}>
            <Download size={15} />
            <span>ექსპორტი</span>
          </button>
        </div>
      </section>

      {preset === "custom" ? (
        <section className="analytics-range" aria-label="თარიღების არჩევა">
          <label className="select-control">
            <CalendarDays size={16} />
            <span>დან</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="select-control">
            <CalendarDays size={16} />
            <span>მდე</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
        </section>
      ) : null}

      <section className="kpi-strip" aria-label="ძირითადი მაჩვენებლები">
        <div className="kpi-cell">
          <span>Offline შემთხვევა</span>
          <div className="kpi-value">
            <strong>{events.length}</strong>
            {change !== null ? (
              <span className={`kpi-change ${change > 0 ? "up" : "down"}`}>
                {change > 0 ? "▲" : "▼"} {Math.abs(change)}%
              </span>
            ) : null}
          </div>
        </div>
        <div className="kpi-cell">
          <span>დაზარალებული ბაღი</span>
          <div className="kpi-value">
            <strong>{deviceSummary.length}</strong>
          </div>
        </div>
        <div className="kpi-cell">
          <span>საშუალო ხანგრძლივობა</span>
          <div className="kpi-value">
            <strong>{averageDuration || "—"}</strong>
            {averageDuration ? <small>წთ</small> : null}
          </div>
        </div>
        <div className="kpi-cell">
          <span>ყველაზე გრძელი</span>
          <div className="kpi-value">
            <strong>{longestEvent?.durationMinutes ?? "—"}</strong>
            {longestEvent?.durationMinutes ? (
              <small>წთ · {longestEvent.deviceName}</small>
            ) : null}
          </div>
        </div>
      </section>

      <section className="surface chart-card" aria-label="Offline შემთხვევები დროში">
        <div className="chart-head">
          <div>
            <h2>Offline შემთხვევები</h2>
            <p>
              {peak && peak.count > 0
                ? `პიკი — ${peak.fullLabel}, ${peak.count} შემთხვევა`
                : "ამ პერიოდში offline შემთხვევა არ არის."}
            </p>
          </div>
          <span className="chart-total">სულ {events.length}</span>
        </div>

        {buckets.length ? (
          <div className="chart-body">
            <div className="chart-axis">
              {axisTicks(axisMax).map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <div className="chart-plot-wrap">
              <div className="chart-grid" aria-hidden="true">
                <i />
                <i />
                <i />
                <i className="baseline" />
              </div>
              <div className="chart-plot">
                {buckets.map((bucket) => (
                  <div
                    key={bucket.key}
                    className={`chart-col${hoveredBucket === bucket.key ? " hovered" : ""}`}
                    onMouseEnter={() => setHoveredBucket(bucket.key)}
                    onMouseLeave={() => setHoveredBucket(null)}
                  >
                    {peak && bucket.key === peak.key && bucket.count > 0 ? (
                      <span className="chart-peak-label">{bucket.count}</span>
                    ) : null}
                    <span
                      className={`chart-bar${peak && bucket.key === peak.key ? " peak" : ""}`}
                      style={{
                        height: `${axisMax ? (bucket.count / axisMax) * 100 : 0}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="chart-labels" aria-hidden="true">
                {buckets.map((bucket) => (
                  <span
                    key={bucket.key}
                    className={peak && bucket.key === peak.key ? "peak" : ""}
                  >
                    {bucket.label}
                  </span>
                ))}
              </div>
              {hovered ? (
                <div
                  className="chart-tooltip"
                  style={{
                    left: `${((buckets.indexOf(hovered) + 0.5) / buckets.length) * 100}%`,
                  }}
                  role="status"
                >
                  <strong>{hovered.fullLabel}</strong>
                  <span>
                    {hovered.count} შემთხვევა · {hovered.devices} ბაღი
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="muted">ამ პერიოდში offline შემთხვევა არ არის.</p>
        )}
      </section>

      <section className="content-grid three analytics-ranks">
        <RankPanel
          title="ყველაზე ხშირად offline"
          meta="ბაღები"
          icon={<WifiOff size={16} />}
          items={deviceSummary}
        />
        <RankPanel
          title="ყველაზე ხშირი რაიონები"
          meta={`${regionSummary.length} რაიონი`}
          icon={<CalendarDays size={16} />}
          items={regionSummary}
        />
        <RankPanel
          title="ყველაზე ხშირი ტეგები"
          meta={`${tagSummary.length} ტეგი`}
          icon={<Tags size={16} />}
          items={tagSummary}
        />
      </section>
    </div>
  );
}

function RankPanel({
  title,
  meta,
  icon,
  items,
}: {
  title: string;
  meta: string;
  icon: React.ReactNode;
  items: OfflineSummary[];
}) {
  const shown = items.slice(0, 6);
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="surface rank-card">
      <div className="rank-card-head">
        <h2>{title}</h2>
        <span>
          {icon}
          {meta}
        </span>
      </div>
      {shown.length ? (
        <div className="rank-rows">
          {shown.map((item) => (
            <div key={item.id} className="rank-row2">
              <div className="rank-row2-top">
                <span title={item.label}>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
              <div className="rank-track">
                <div
                  className="rank-fill"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">ამ პერიოდში offline შემთხვევა არ არის.</p>
      )}
      {items.length > shown.length ? (
        <span className="rank-more">კიდევ {items.length - shown.length}</span>
      ) : null}
    </div>
  );
}

function collectEvents(
  activeDevices: Device[],
  deviceMap: Map<string, Device>,
  snapshots: OfflineSnapshot[],
  fromDate: string,
  toDate: string,
): AnalyticsEvent[] {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T23:59:59`);

  const statusEvents: AnalyticsEvent[] = activeDevices.flatMap((device) =>
    device.statusEvents
      .filter((event) => event.status === "offline")
      .filter((event) => {
        const date = new Date(event.happenedAt);
        return date >= from && date <= to;
      })
      .map((event) => ({
        id: event.id,
        deviceId: device.id,
        deviceName: device.name,
        region: device.region,
        tags: device.tags,
        happenedAt: event.happenedAt,
        durationMinutes: event.durationMinutes,
      })),
  );

  const currentOfflineEvents: AnalyticsEvent[] = activeDevices
    .filter((device) => device.status === "offline")
    .filter((device) => {
      const date = new Date(device.lastSeenAt);
      return date >= from && date <= to;
    })
    .map((device) => ({
      id: `current-${device.id}`,
      deviceId: device.id,
      deviceName: device.name,
      region: device.region,
      tags: device.tags,
      happenedAt: device.lastSeenAt,
    }));

  const snapshotEvents: AnalyticsEvent[] = snapshots
    .filter((snapshot) => snapshot.date >= fromDate && snapshot.date <= toDate)
    .flatMap((snapshot) =>
      snapshot.devices
        .map((snapshotDevice) => {
          const device = deviceMap.get(snapshotDevice.deviceId);
          if (device?.isExcluded) {
            return null;
          }
          return {
            id: `${snapshot.id}-${snapshotDevice.deviceId}`,
            deviceId: snapshotDevice.deviceId,
            deviceName: device?.name ?? snapshotDevice.deviceName,
            region: device?.region ?? "დაუნაწილებელი",
            tags: device?.tags ?? [],
            happenedAt: snapshot.capturedAt,
          };
        })
        .filter((event): event is AnalyticsEvent => event !== null),
    );

  const seen = new Set<string>();
  return [...statusEvents, ...currentOfflineEvents, ...snapshotEvents].filter(
    (event) => {
      const key = `${event.deviceId}-${event.happenedAt.slice(0, 10)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    },
  );
}

/** Buckets by day for short ranges and by month for longer ones. */
function bucketEvents(
  events: AnalyticsEvent[],
  fromDate: string,
  toDate: string,
): Bucket[] {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return [];
  }

  const spanDays = Math.round(
    (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
  );
  const byDay = spanDays <= 45;

  const keys: Bucket[] = [];
  if (byDay) {
    const cursor = new Date(from);
    while (cursor <= to) {
      const key = cursor.toISOString().slice(0, 10);
      keys.push({
        key,
        label: String(cursor.getDate()),
        fullLabel: `${cursor.getDate()} ${monthNames[cursor.getMonth()]}`,
        count: 0,
        devices: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const last = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= last) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      keys.push({
        key,
        label: monthNames[cursor.getMonth()],
        fullLabel: `${monthNamesLong[cursor.getMonth()]} ${cursor.getFullYear()}`,
        count: 0,
        devices: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const index = new Map(keys.map((bucket) => [bucket.key, bucket]));
  const deviceSets = new Map<string, Set<string>>();

  for (const event of events) {
    const key = byDay
      ? event.happenedAt.slice(0, 10)
      : event.happenedAt.slice(0, 7);
    const bucket = index.get(key);
    if (!bucket) {
      continue;
    }
    bucket.count += 1;
    const set = deviceSets.get(key) ?? new Set<string>();
    set.add(event.deviceId);
    deviceSets.set(key, set);
  }

  for (const bucket of keys) {
    bucket.devices = deviceSets.get(bucket.key)?.size ?? 0;
  }

  return keys;
}

function shiftRangeBack(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return null;
  }

  const span = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const previousFrom = new Date(previousTo.getTime() - span);
  return {
    from: previousFrom.toISOString().slice(0, 10),
    to: previousTo.toISOString().slice(0, 10),
  };
}

function niceCeiling(value: number) {
  if (value <= 0) {
    return 0;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) {
      return Math.ceil(candidate);
    }
  }
  return Math.ceil(10 * magnitude);
}

function axisTicks(max: number) {
  if (max <= 0) {
    return [0];
  }
  return [max, Math.round((max / 3) * 2), Math.round(max / 3), 0];
}

function rank(items: { id: string; label: string }[]): OfflineSummary[] {
  const counts = new Map<string, OfflineSummary>();
  for (const item of items) {
    const existing = counts.get(item.id);
    counts.set(item.id, {
      id: item.id,
      label: item.label,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function escapeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatDisplayDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }
  return `${Number(match[3])} ${monthNames[Number(match[2]) - 1]} ${match[1]}`;
}
