"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  Search,
  WifiOff,
  X,
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

type DeviceSortMode = "offline" | "online" | "monitoring" | "az" | "za";

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
  const [historyDeviceId, setHistoryDeviceId] = useState<string | null>(null);
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
  const activeMonitoredDevices = useMemo(
    () => monitoredDevices.filter((device) => device.isActive),
    [monitoredDevices],
  );
  const monitoredMap = useMemo(
    () =>
      new Map(
        activeMonitoredDevices.map((device) => [device.deviceId, device]),
      ),
    [activeMonitoredDevices],
  );
  const monitoringHistoryMap = useMemo(
    () => new Map(monitoredDevices.map((device) => [device.deviceId, device])),
    [monitoredDevices],
  );
  const historyDevice = historyDeviceId
    ? deviceMap.get(historyDeviceId)
    : undefined;
  const historyMonitoringRecord = historyDeviceId
    ? monitoringHistoryMap.get(historyDeviceId)
    : undefined;

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
    activeMonitoredDevices.forEach((device) => {
      if (device.lastStatus === "offline" && device.offlineCount > 0) {
        ids.add(device.deviceId);
      }
    });
    return ids;
  }, [activeMonitoredDevices]);

  const filteredDevices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...devices]
      .filter(
        (device) =>
          !normalized ||
          device.id.toLowerCase().includes(normalized) ||
          device.name.toLowerCase().includes(normalized),
      )
      .filter(
        (device) => deviceSort !== "monitoring" || monitoredMap.has(device.id),
      )
      .sort((a, b) => compareDevices(a, b, deviceSort));
  }, [deviceSort, devices, monitoredMap, query]);

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

  useEffect(() => {
    let cancelled = false;

    async function refreshMonitoring() {
      const response = await fetch("/api/offline-records/monitoring", {
        cache: "no-store",
      }).catch(() => null);

      if (!response?.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as {
        monitoredDevices?: MonitoredDevice[];
      };
      if (payload.monitoredDevices) {
        setMonitoredDevices(payload.monitoredDevices);
      }
    }

    void refreshMonitoring();
    const intervalId = window.setInterval(refreshMonitoring, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!historyDeviceId) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHistoryDeviceId(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [historyDeviceId]);

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
    recordAudit(
      "offline_snapshot.capture",
      "offline_snapshot",
      payload.snapshot.id,
    );
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
          <p>
            დღიური ჩამონათვალი იმ X-Station-ებისთვის, რომლებიც 09:00-ზე offline
            იყვნენ.
          </p>
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
            <span>{activeMonitoredDevices.length}</span>
            <small>მონიტორინგი</small>
          </div>
        </div>
      </section>

      <section
        className="filter-bar offline-filter-bar"
        aria-label="აღრიცხვის ფილტრები"
      >
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
            onChange={(event) =>
              setThreshold(Math.max(1, Number(event.target.value) || 1))
            }
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
              <option value="monitoring">მონიტორინგი</option>
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
              const monitoringRecord = monitoringHistoryMap.get(device.id);
              const alerting = alertingDeviceIds.has(device.id);
              return (
                <div
                  key={device.id}
                  className={`offline-device-option ${selected ? "selected" : ""} ${alerting ? "alerting" : ""}`}
                >
                  <button
                    type="button"
                    className="offline-device-main"
                    onClick={() => toggleSelectedDevice(device.id)}
                  >
                    <span className={`status-dot ${device.status}`} />
                    <span>
                      <strong>{device.name}</strong>
                    </span>
                    {selected ? <CheckCircle2 size={17} /> : null}
                  </button>
                  <span className="monitor-indicators">
                    {monitoringRecord ? (
                      <button
                        type="button"
                        className={`monitor-count-pill ${
                          monitoringRecord.isActive ? "" : "inactive"
                        }`}
                        title={`მონიტორინგის offline რაოდენობა: ${monitoringRecord.offlineCount}`}
                        aria-label={`${device.name} მონიტორინგის ისტორია`}
                        onClick={() => setHistoryDeviceId(device.id)}
                      >
                        {monitoringRecord.offlineCount}
                      </button>
                    ) : null}
                    {monitored ? (
                      <span className="monitor-pill">
                        <BellRing size={13} />
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
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
              <p className="muted">
                არჩეულ პერიოდში offline მოწყობილობა არ არის.
              </p>
            )}
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
      </section>

      {historyMonitoringRecord ? (
        <MonitoringHistoryModal
          deviceName={historyDevice?.name ?? historyMonitoringRecord.deviceName}
          record={historyMonitoringRecord}
          onClose={() => setHistoryDeviceId(null)}
        />
      ) : null}
    </div>
  );
}

function MonitoringHistoryModal({
  deviceName,
  record,
  onClose,
}: {
  deviceName: string;
  record: MonitoredDevice;
  onClose: () => void;
}) {
  return (
    <div
      className="offline-history-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="offline-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">მონიტორინგი</p>
            <h2 id="offline-history-title">{deviceName}</h2>
            <span>{record.offlineCount} offline შემთხვევა</span>
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

        {record.offlinePeriods.length ? (
          <ol className="offline-history-list">
            {record.offlinePeriods.map((period, index) => (
              <li key={period.id} className="offline-history-row">
                <span className="offline-history-index">{index + 1}</span>
                <span className="offline-history-time">
                  <Clock size={15} />
                  <strong>
                    {formatMonitoringDateTime(period.offlineAt)} -{" "}
                    {period.onlineAt
                      ? formatMonitoringDateTime(period.onlineAt)
                      : "ჯერ offline"}
                  </strong>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="offline-history-empty">
            <WifiOff size={20} />
            <p>ამ მონიტორინგისთვის დეტალური ისტორია ჯერ არ არის.</p>
          </div>
        )}
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
  if (sortMode === "monitoring") {
    return compareDeviceNames(a, b);
  }

  if (sortMode === "offline") {
    return compareStatusFirst(a, b, "offline") || compareDeviceNames(a, b);
  }

  if (sortMode === "online") {
    return compareStatusFirst(a, b, "online") || compareDeviceNames(a, b);
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
  return a.name.localeCompare(b.name, "ka") || a.id.localeCompare(b.id, "ka");
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

function formatMonitoringDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})/);

  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${day}.${month}.${year.slice(-2)} ${hour}:${minute}`;
  }

  return new Intl.DateTimeFormat("ka-GE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(",", "");
}
