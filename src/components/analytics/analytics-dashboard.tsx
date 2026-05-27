"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, MapPinned, Tags, WifiOff } from "lucide-react";
import type { Device, OfflineSummary, StatusEvent } from "@/lib/types";

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(now.getFullYear() - 1);

export function AnalyticsDashboard({ devices }: { devices: Device[] }) {
  const [fromDate, setFromDate] = useState(oneYearAgo.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(now.toISOString().slice(0, 10));

  const events = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    return devices.flatMap((device) =>
      device.statusEvents
        .filter((event) => event.status === "offline")
        .filter((event) => {
          const date = new Date(event.happenedAt);
          return date >= from && date <= to;
        })
        .map((event) => ({ ...event, device }))
    );
  }, [devices, fromDate, toDate]);

  const deviceSummary = useMemo(
    () =>
      rank(
        events.map((event) => ({
          id: event.device.id,
          label: `${event.device.code} · ${event.device.name}`
        }))
      ),
    [events]
  );

  const regionSummary = useMemo(
    () =>
      rank(
        events.map((event) => ({
          id: event.device.region,
          label: event.device.region
        }))
      ),
    [events]
  );

  const tagSummary = useMemo(
    () =>
      rank(
        events.flatMap((event) =>
          event.device.tags.map((tag) => ({
            id: tag,
            label: tag
          }))
        )
      ),
    [events]
  );

  const longestEvent = events.reduce<({ device: Device } & StatusEvent) | null>(
    (max, event) =>
      !max || (event.durationMinutes ?? 0) > (max.durationMinutes ?? 0) ? event : max,
    null
  );

  return (
    <div className="analytics-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">ანალიტიკა</p>
          <h1>Offline სიხშირე</h1>
          <p>დალაგება მოწყობილობებით, რეგიონებით და ტეგებით არჩეულ პერიოდზე.</p>
        </div>
        <div className="date-range">
          <label>
            <CalendarDays size={16} />
            <span>დან</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            <CalendarDays size={16} />
            <span>მდე</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="content-grid four">
        <div className="surface stat-surface">
          <WifiOff size={20} />
          <span>Offline შემთხვევა</span>
          <strong>{events.length}</strong>
        </div>
        <div className="surface stat-surface">
          <MapPinned size={20} />
          <span>რეგიონი</span>
          <strong>{regionSummary.length}</strong>
        </div>
        <div className="surface stat-surface">
          <Tags size={20} />
          <span>ტეგი</span>
          <strong>{tagSummary.length}</strong>
        </div>
        <div className="surface stat-surface">
          <BarChart3 size={20} />
          <span>ყველაზე გრძელი</span>
          <strong>{longestEvent?.durationMinutes ?? 0} წთ</strong>
        </div>
      </section>

      <section className="content-grid three">
        <RankPanel title="ყველაზე ხშირად offline დავაისები" icon={<WifiOff size={20} />} items={deviceSummary} />
        <RankPanel title="ყველაზე ხშირი რეგიონები" icon={<MapPinned size={20} />} items={regionSummary} />
        <RankPanel title="ყველაზე ხშირი ტეგები" icon={<Tags size={20} />} items={tagSummary} />
      </section>
    </div>
  );
}

function rank(items: { id: string; label: string }[]): OfflineSummary[] {
  const counts = new Map<string, OfflineSummary>();
  for (const item of items) {
    const existing = counts.get(item.id);
    counts.set(item.id, {
      id: item.id,
      label: item.label,
      count: (existing?.count ?? 0) + 1
    });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function RankPanel({
  title,
  icon,
  items
}: {
  title: string;
  icon: React.ReactNode;
  items: OfflineSummary[];
}) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="surface rank-panel">
      <div className="section-title">
        <h2>{title}</h2>
        {icon}
      </div>
      <div className="rank-list">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="rank-row">
              <div>
                <strong>{item.label}</strong>
                <span>{item.count} შემთხვევა</span>
              </div>
              <div className="rank-bar" style={{ ["--bar-width" as string]: `${(item.count / max) * 100}%` }} />
            </div>
          ))
        ) : (
          <p className="muted">ამ პერიოდში offline შემთხვევა არ არის.</p>
        )}
      </div>
    </div>
  );
}
