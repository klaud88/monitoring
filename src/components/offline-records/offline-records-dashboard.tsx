"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Filter,
  RefreshCw,
  Search,
  WifiOff,
  XCircle,
} from "lucide-react";
import { recordAudit } from "@/lib/client-audit";
import type {
  Device,
  MonitoredDevice,
  OfflineSnapshot,
  OfflineSnapshotDevice,
} from "@/lib/types";

type Props = {
  initialDevices: Device[];
  initialSnapshots: OfflineSnapshot[];
  initialMonitoredDevices: MonitoredDevice[];
};

type DeviceSortMode = "offline" | "online" | "az" | "za";

const defaultToDate = getDateKey(new Date());
const defaultFromDate = getDateKey(addDays(new Date(), -30));

export function OfflineRecordsDashboard({
  initialDevices,
  initialSnapshots,
  initialMonitoredDevices,
}: Props) {
  const [devices] = useState(initialDevices);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [monitoredDevices, setMonitoredDevices] = useState(
    initialMonitoredDevices,
  );
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [threshold, setThreshold] = useState(10);
  const [query, setQuery] = useState("");
  const [deviceSort, setDeviceSort] = useState<DeviceSortMode>("offline");
  const [busyAction, setBusyAction] = useState<
    "capture" | "monitor" | "stop" | null
  >(null);

  const deviceMap = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );
  const activeDeviceIds = useMemo(
    () => new Set(devices.map((device) => device.id)),
    [devices],
  );
  const monitoredMap = useMemo(
    () => new Map(monitoredDevices.map((device) => [device.deviceId, device])),
    [monitoredDevices],
  );

  const filteredSnapshots = useMemo(
    () =>
      snapshots
        .filter(
          (snapshot) => snapshot.date >= fromDate && snapshot.date <= toDate,
        )
        .map((snapshot) => ({
          ...snapshot,
          devices: snapshot.devices.filter((device) =>
            activeDeviceIds.has(device.deviceId),
          ),
        })),
    [activeDeviceIds, fromDate, snapshots, toDate],
  );

  const offlineCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredSnapshots.forEach((snapshot) => {
      snapshot.devices.forEach((device) => {
        counts.set(device.deviceId, (counts.get(device.deviceId) ?? 0) + 1);
      });
    });
    return counts;
  }, [filteredSnapshots]);

  const thresholdDeviceIds = useMemo(() => {
    const ids = new Set<string>();
    offlineCounts.forEach((count, deviceId) => {
      if (count >= threshold) {
        ids.add(deviceId);
      }
    });
    return ids;
  }, [offlineCounts, threshold]);

  const alertingDeviceIds = useMemo(() => {
    const ids = new Set<string>();
    filteredSnapshots.forEach((snapshot) => {
      snapshot.devices.forEach((device) => {
        const monitored = monitoredMap.get(device.deviceId);
        if (monitored && snapshot.date > monitored.enabledDate) {
          ids.add(device.deviceId);
        }
      });
    });
    return ids;
  }, [filteredSnapshots, monitoredMap]);

  const filteredDevices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...devices]
      .filter(
        (device) =>
          !normalized ||
          device.id.toLowerCase().includes(normalized) ||
          device.name.toLowerCase().includes(normalized),
      )
      .sort((a, b) => compareDevices(a, b, deviceSort));
  }, [deviceSort, devices, query]);

  const rankedDevices = useMemo(() => {
    const rows = [...offlineCounts.entries()].map(([deviceId, count]) => {
      const device = deviceMap.get(deviceId);
      return {
        deviceId,
        label: device ? device.name : "დავაისი ვერ მოიძებნა",
        count,
      };
    });

    return rows.sort((a, b) => b.count - a.count);
  }, [deviceMap, offlineCounts]);

  function toggleSelectedDevice(deviceId: string) {
    setSelectedDeviceIds((current) =>
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId],
    );
  }

  async function captureSnapshot() {
    setBusyAction("capture");
    const response = await fetch("/api/offline-records/capture", {
      method: "POST",
    }).catch(() => null);
    setBusyAction(null);

    if (!response?.ok) {
      return;
    }

    const payload = (await response.json()) as {
      snapshot?: OfflineSnapshot | null;
    };
    if (!payload.snapshot) {
      return;
    }

    setSnapshots((current) => {
      const withoutCurrentDate = current.filter(
        (snapshot) => snapshot.date !== payload.snapshot?.date,
      );
      return [payload.snapshot!, ...withoutCurrentDate].sort((a, b) =>
        b.date.localeCompare(a.date),
      );
    });
    recordAudit("offline_snapshot.capture", "offline_snapshot", payload.snapshot.id);
  }

  async function updateMonitoring(enabled: boolean) {
    if (!selectedDeviceIds.length) {
      return;
    }

    setBusyAction(enabled ? "monitor" : "stop");
    const response = await fetch("/api/offline-records/monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceIds: selectedDeviceIds, enabled }),
    }).catch(() => null);
    setBusyAction(null);

    if (!response?.ok) {
      return;
    }

    const payload = (await response.json()) as {
      monitoredDevices: MonitoredDevice[];
    };
    setMonitoredDevices(payload.monitoredDevices);
    recordAudit("offline_monitoring.update", "device", selectedDeviceIds[0], {
      deviceIds: selectedDeviceIds,
      enabled,
    });
  }

  return (
    <div className="offline-records-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Offline აღრიცხვა</p>
          <h1>09:00 X-Station snapshot-ები</h1>
          <p>დღიური ჩამონათვალი იმ X-Station-ებისთვის, რომლებიც 09:00-ზე offline იყვნენ.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <CalendarDays size={18} />
            <span>{filteredSnapshots.length}</span>
            <small>დღე</small>
          </div>
          <div className="metric">
            <WifiOff size={18} />
            <span>{rankedDevices.length}</span>
            <small>offline device</small>
          </div>
          <div className="metric">
            <BellRing size={18} />
            <span>{monitoredDevices.length}</span>
            <small>მონიტორინგი</small>
          </div>
        </div>
      </section>

      <section className="filter-bar offline-filter-bar" aria-label="აღრიცხვის ფილტრები">
        <label className="date-control">
          <CalendarDays size={16} />
          <span>დან</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label className="date-control">
          <CalendarDays size={16} />
          <span>მდე</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
        <label className="threshold-control">
          <Filter size={16} />
          <span>რაოდენობა</span>
          <input
            type="number"
            min={1}
            value={threshold}
            onChange={(event) => setThreshold(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <button
          className="ghost-button"
          type="button"
          disabled={busyAction === "capture"}
          onClick={captureSnapshot}
        >
          <RefreshCw size={16} />
          <span>Snapshot</span>
        </button>
      </section>

      <section className="content-grid offline-record-grid">
        <aside className="surface offline-device-panel">
          <div className="section-title">
            <h2>მოწყობილობები</h2>
            <span className="count-pill">{selectedDeviceIds.length}</span>
          </div>
          <div className="search-field">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ძებნა სახელით ან ID-ით"
            />
          </div>
          <label className="select-control offline-sort-control">
            <Filter size={17} />
            <select
              value={deviceSort}
              onChange={(event) =>
                setDeviceSort(event.target.value as DeviceSortMode)
              }
            >
              <option value="offline">Offline</option>
              <option value="online">Online</option>
              <option value="az">A-Z</option>
              <option value="za">Z-A</option>
            </select>
          </label>
          <div className="offline-monitor-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!selectedDeviceIds.length || busyAction === "monitor"}
              onClick={() => updateMonitoring(true)}
            >
              <BellRing size={17} />
              <span>მონიტორინგი</span>
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={!selectedDeviceIds.length || busyAction === "stop"}
              onClick={() => updateMonitoring(false)}
            >
              <XCircle size={17} />
              <span>გაჩერება</span>
            </button>
          </div>

          <div className="offline-device-list">
            {filteredDevices.map((device) => {
              const selected = selectedDeviceIds.includes(device.id);
              const monitored = monitoredMap.has(device.id);
              const alerting = alertingDeviceIds.has(device.id);
              return (
                <button
                  key={device.id}
                  type="button"
                  className={`offline-device-option ${selected ? "selected" : ""} ${alerting ? "alerting" : ""}`}
                  onClick={() => toggleSelectedDevice(device.id)}
                >
                  <span className={`status-dot ${device.status}`} />
                  <span>
                    <strong>{device.name}</strong>
                  </span>
                  {selected ? <CheckCircle2 size={17} /> : null}
                  {monitored ? (
                    <span className="monitor-pill">
                      <BellRing size={13} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="surface offline-snapshot-panel">
          <div className="section-title">
            <h2>დღიური აღრიცხვა</h2>
            <span className="count-pill">{thresholdDeviceIds.size} წითელი</span>
          </div>

          <div className="offline-snapshot-list">
            {filteredSnapshots.length ? (
              filteredSnapshots.map((snapshot) => (
                <article key={snapshot.id} className="offline-snapshot-day">
                  <header>
                    <div>
                      <strong>{formatDate(snapshot.date)}</strong>
                      <span>09:00 · {snapshot.devices.length} offline</span>
                    </div>
                    <WifiOff size={18} />
                  </header>
                  <div className="snapshot-device-cloud">
                    {snapshot.devices.length ? (
                      snapshot.devices.map((device) => (
                        <SnapshotDeviceChip
                          key={device.deviceId}
                          device={device}
                          isCritical={thresholdDeviceIds.has(device.deviceId)}
                          isAlerting={alertingDeviceIds.has(device.deviceId)}
                          count={offlineCounts.get(device.deviceId) ?? 0}
                        />
                      ))
                    ) : (
                      <p className="muted">ამ დღეს offline არ დაფიქსირდა.</p>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <CheckCircle2 size={22} />
                <span>ამ დიაპაზონში ჩანაწერი არ არის.</span>
              </div>
            )}
          </div>
        </section>

        <aside className="surface offline-rank-panel">
          <div className="section-title">
            <h2>სიხშირე</h2>
            <AlertTriangle size={20} />
          </div>
          <div className="rank-list">
            {rankedDevices.length ? (
              rankedDevices.map((device) => (
                <div
                  key={device.deviceId}
                  className={`rank-row ${thresholdDeviceIds.has(device.deviceId) ? "critical" : ""}`}
                >
                  <div>
                    <strong>{device.label}</strong>
                    <span>{device.count} დღე offline</span>
                  </div>
                  <div
                    className="rank-bar"
                    style={{
                      ["--bar-width" as string]: `${Math.min(100, (device.count / threshold) * 100)}%`,
                    }}
                  />
                </div>
              ))
            ) : (
              <p className="muted">არჩეულ პერიოდში offline მოწყობილობა არ არის.</p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function SnapshotDeviceChip({
  device,
  isCritical,
  isAlerting,
  count,
}: {
  device: OfflineSnapshotDevice;
  isCritical: boolean;
  isAlerting: boolean;
  count: number;
}) {
  return (
    <span
      className={`snapshot-device-chip ${isCritical ? "critical" : ""} ${isAlerting ? "alerting" : ""}`}
      title={`${count} დღე offline`}
    >
      {isAlerting ? <BellRing size={13} /> : null}
      <strong>{device.deviceName}</strong>
    </span>
  );
}

function compareDevices(a: Device, b: Device, sortMode: DeviceSortMode) {
  if (sortMode === "offline") {
    return (
      compareStatusFirst(a, b, "offline") ||
      compareDeviceNames(a, b)
    );
  }

  if (sortMode === "online") {
    return (
      compareStatusFirst(a, b, "online") ||
      compareDeviceNames(a, b)
    );
  }

  const nameCompare = compareDeviceNames(a, b);
  return sortMode === "za" ? -nameCompare : nameCompare;
}

function compareStatusFirst(
  a: Device,
  b: Device,
  preferredStatus: "offline" | "online",
) {
  const aRank = a.status === preferredStatus ? 0 : 1;
  const bRank = b.status === preferredStatus ? 0 : 1;
  return aRank - bRank;
}

function compareDeviceNames(a: Device, b: Device) {
  return (
    a.name.localeCompare(b.name, "ka") ||
    a.id.localeCompare(b.id, "ka")
  );
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ka-GE", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00+04:00`));
}
