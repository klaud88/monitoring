"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  GripVertical,
  RefreshCw,
  Search,
  Trash2,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { recordAudit } from "@/lib/client-audit";
import type { DailyOfflineEntry, DailyOfflineLevel } from "@/lib/repositories";
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
  /** Graded device-days; days before the 5-minute poll started are absent. */
  dailyLevels: DailyOfflineEntry[];
  /** The saved row order is per person, so two people can order it differently. */
  userId: string;
};

const levelLabels: Record<DailyOfflineLevel, string> = {
  outage: "გათიშული",
  flapping: "არასტაბილური",
  brief: "მოკლე გათიშვა",
};

type DeviceSortMode = "offline" | "online" | "monitoring" | "az" | "za";
type MatrixSort =
  | "custom"
  | "offline-desc"
  | "offline-asc"
  | "name-asc"
  | "name-desc";

type MatrixPreference = {
  order: string[];
  sort: MatrixSort;
};

const matrixSortLabels: Record<MatrixSort, string> = {
  custom: "ჩემი რიგი",
  "offline-desc": "offline ↓",
  "offline-asc": "offline ↑",
  "name-asc": "სახელი A-Z",
  "name-desc": "სახელი Z-A",
};

const rangePresets = [
  { days: 7, label: "7 დღე" },
  { days: 30, label: "30 დღე" },
  { days: 90, label: "90 დღე" },
];

const defaultToDate = getDateKey(new Date());
const defaultFromDate = getDateKey(addDays(new Date(), -30));

export function OfflineRecordsDashboard({
  initialDevices,
  initialSnapshots,
  initialMonitoredDevices,
  dailyLevels,
  userId,
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [matrixSort, setMatrixSort] = useState<MatrixSort>("offline-desc");
  const [matrixOrder, setMatrixOrder] = useState<string[]>([]);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    deviceId: string;
    deviceName: string;
    date: string;
  } | null>(null);
  const { confirm, confirmationDialog } = useConfirmDialog();
  const matrixStorageKey = `bagebi-offline-matrix:${userId}`;

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

  const activePresetDays = useMemo(() => {
    if (toDate !== getDateKey(new Date())) {
      return null;
    }
    return (
      rangePresets.find(
        (preset) => fromDate === getDateKey(addDays(new Date(), -preset.days)),
      )?.days ?? null
    );
  }, [fromDate, toDate]);

  function applyRangePreset(days: number) {
    setFromDate(getDateKey(addDays(new Date(), -days)));
    setToDate(getDateKey(new Date()));
  }

  /** device id + day → how that day is graded. */
  const levelByDeviceDay = useMemo(() => {
    const map = new Map<string, DailyOfflineEntry>();
    dailyLevels.forEach((entry) => {
      map.set(`${entry.deviceId}|${entry.date}`, entry);
    });
    return map;
  }, [dailyLevels]);

  const offlineByDay = useMemo(() => {
    const map = new Map<string, Set<string>>();
    filteredSnapshots.forEach((snapshot) => {
      map.set(
        snapshot.date,
        new Set(snapshot.devices.map((device) => device.deviceId)),
      );
    });
    return map;
  }, [filteredSnapshots]);

  /** One column per calendar day in the chosen range — 30 days, 30 cells —
   *  whether or not that day happens to have a snapshot. */
  const matrixDays = useMemo(() => {
    const start = new Date(`${fromDate}T00:00:00Z`);
    const end = new Date(`${toDate}T00:00:00Z`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return [];
    }

    const days: {
      date: string;
      day: number;
      hasSnapshot: boolean;
      isMonthStart: boolean;
    }[] = [];
    const cursor = new Date(start);

    while (cursor <= end && days.length < 400) {
      const date = cursor.toISOString().slice(0, 10);
      const day = cursor.getUTCDate();
      days.push({
        date,
        day,
        hasSnapshot: offlineByDay.has(date),
        isMonthStart: day === 1,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return days;
  }, [fromDate, offlineByDay, toDate]);


  /** Rows of the matrix: gardens that were offline at least once in range. */
  const matrixDevices = useMemo(() => {
    const rows = [...offlineCounts.entries()].map(([deviceId, count]) => ({
      deviceId,
      name: deviceMap.get(deviceId)?.name ?? deviceId,
      status: deviceMap.get(deviceId)?.status ?? "offline",
      count,
    }));

    if (matrixSort === "custom" && matrixOrder.length) {
      const rank = new Map(matrixOrder.map((id, index) => [id, index]));
      return rows.sort((a, b) => {
        const left = rank.get(a.deviceId) ?? Number.MAX_SAFE_INTEGER;
        const right = rank.get(b.deviceId) ?? Number.MAX_SAFE_INTEGER;
        return left === right ? b.count - a.count : left - right;
      });
    }

    return rows.sort((a, b) => {
      switch (matrixSort) {
        case "offline-asc":
          return a.count - b.count;
        case "name-asc":
          return a.name.localeCompare(b.name, "ka");
        case "name-desc":
          return b.name.localeCompare(a.name, "ka");
        default:
          return b.count - a.count;
      }
    });
  }, [deviceMap, matrixOrder, matrixSort, offlineCounts]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(matrixStorageKey);
      if (!raw) {
        return;
      }
      const stored = JSON.parse(raw) as Partial<MatrixPreference>;
      if (Array.isArray(stored.order)) {
        setMatrixOrder(stored.order.map(String));
      }
      if (stored.sort && stored.sort in matrixSortLabels) {
        setMatrixSort(stored.sort);
      }
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
  }, [matrixStorageKey]);

  const persistMatrix = useCallback(
    (preference: MatrixPreference) => {
      try {
        window.localStorage.setItem(
          matrixStorageKey,
          JSON.stringify(preference),
        );
      } catch {
        // localStorage may be unavailable in restricted contexts.
      }
    },
    [matrixStorageKey],
  );

  function changeMatrixSort(next: MatrixSort) {
    setMatrixSort(next);
    persistMatrix({ order: matrixOrder, sort: next });
  }

  /** Dropping a row rewrites the personal order and switches to it. */
  function dropRow(targetIndex: number) {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);

    if (fromIndex === null || fromIndex === targetIndex) {
      return;
    }

    const ids = matrixDevices.map((row) => row.deviceId);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(targetIndex, 0, moved);

    setMatrixOrder(ids);
    setMatrixSort("custom");
    persistMatrix({ order: ids, sort: "custom" });
  }

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
        notifications?: unknown[];
      };
      if (payload.monitoredDevices) {
        setMonitoredDevices(payload.monitoredDevices);
        // Share fresh data with the navbar bell so it skips its own HTTP request.
        window.dispatchEvent(
          new CustomEvent("monitoring-data", {
            detail: { notifications: payload.notifications ?? [] },
          }),
        );
      }
    }

    void refreshMonitoring();
    const intervalId = window.setInterval(refreshMonitoring, 60000);

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

  async function updateMonitoring(
    enabled: boolean,
    deviceIds: string[] = selectedDeviceIds,
    actionKey = enabled ? "monitor" : "stop",
  ) {
    if (!deviceIds.length) {
      return;
    }

    setBusyAction(actionKey);
    const response = await fetch("/api/offline-records/monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceIds, enabled }),
    }).catch(() => null);
    setBusyAction(null);

    if (!response?.ok) {
      return;
    }

    const payload = (await response.json()) as {
      monitoredDevices: MonitoredDevice[];
    };
    setMonitoredDevices(payload.monitoredDevices);
    recordAudit("offline_monitoring.update", "device", deviceIds[0], {
      deviceIds,
      enabled,
    });
  }

  /** Wipes one device's offline history — the only thing that removes it. */
  async function clearHistory(deviceId: string) {
    const name = deviceMap.get(deviceId)?.name ?? deviceId;
    const confirmed = await confirm({
      message: `ნამდვილად გსურთ "${name}"-ის offline ისტორიის სრულად წაშლა?`,
    });
    if (!confirmed) {
      return;
    }

    setBusyAction(`clear-${deviceId}`);
    const response = await fetch("/api/offline-records/monitoring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    }).catch(() => null);
    setBusyAction(null);

    if (!response?.ok) {
      return;
    }

    const payload = (await response.json()) as {
      monitoredDevices: MonitoredDevice[];
    };
    setMonitoredDevices(payload.monitoredDevices);
    recordAudit("offline_monitoring.history_clear", "device", deviceId);
  }

  /** The switch flips one device, and asks first either way. */
  async function toggleMonitoring(deviceId: string) {
    const name = deviceMap.get(deviceId)?.name ?? deviceId;
    const enable = !monitoredMap.has(deviceId);

    const confirmed = await confirm({
      message: enable
        ? `ნამდვილად გსურთ "${name}"-ზე მონიტორინგის ჩართვა?`
        : `ნამდვილად გსურთ "${name}"-ზე მონიტორინგის გამორთვა?`,
    });
    if (!confirmed) {
      return;
    }

    await updateMonitoring(enable, [deviceId], `monitor-${deviceId}`);
  }

  async function removeFrequencyDevice(deviceId: string) {
    const device = deviceMap.get(deviceId);
    const confirmed = await confirm({
      message: `ნამდვილად გსურთ "${device?.name ?? deviceId}" X-Station-ის სიხშირიდან წაშლა?`,
    });
    if (!confirmed) {
      return;
    }

    const actionKey = `frequency-remove-${deviceId}`;
    setBusyAction(actionKey);
    const response = await fetch("/api/offline-records/frequency", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, action: "remove" }),
    }).catch(() => null);
    setBusyAction(null);

    if (!response?.ok) {
      return;
    }

    const payload = (await response.json()) as {
      snapshots?: OfflineSnapshot[];
    };
    if (payload.snapshots) {
      setSnapshots(payload.snapshots);
    }
    recordAudit("offline_frequency.remove", "device", deviceId);
  }

  return (
    <div className="offline-records-page">
      <section className="offline-head">
        <div>
          <h1>Offline აღრიცხვა</h1>
          <p>
            ყოველდღე 09:00-ზე გადაღებული სურათი · {formatDate(fromDate)} —{" "}
            {formatDate(toDate)}
          </p>
        </div>
        <div className="offline-head-actions">
          <div className="preset-switch" role="group" aria-label="პერიოდი">
            {rangePresets.map((preset) => (
              <button
                key={preset.days}
                type="button"
                className={activePresetDays === preset.days ? "active" : ""}
                onClick={() => applyRangePreset(preset.days)}
                aria-pressed={activePresetDays === preset.days}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="select-control offline-date">
            <CalendarDays size={15} />
            <span>დან</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="select-control offline-date">
            <CalendarDays size={15} />
            <span>მდე</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <button
            className="ghost-button"
            type="button"
            disabled={busyAction === "capture"}
            onClick={captureSnapshot}
          >
            <RefreshCw size={15} />
            <span>Snapshot</span>
          </button>
        </div>
      </section>

      <section className="kpi-strip" aria-label="ძირითადი მაჩვენებლები">
        <div className="kpi-cell">
          <span>დღე აღრიცხვაში</span>
          <div className="kpi-value">
            <strong>{filteredSnapshots.length}</strong>
          </div>
        </div>
        <div className="kpi-cell">
          <span>ერთხელ მაინც offline</span>
          <div className="kpi-value">
            <strong>{rankedDevices.length}</strong>
          </div>
        </div>
        <div className="kpi-cell">
          <span>
            <i className="status-dot offline" />
            ზღვარს ზემოთ
          </span>
          <div className="kpi-value">
            <strong className="over">{thresholdDeviceIds.size}</strong>
          </div>
        </div>
        <div className="kpi-cell">
          <span>მონიტორინგზე</span>
          <div className="kpi-value">
            <strong>{activeMonitoredDevices.length}</strong>
          </div>
        </div>
      </section>

      {/* MATRIX — rows are gardens, columns are captured mornings */}
      <section
        className="matrix-panel"
        data-open={matrixOpen ? "true" : "false"}
        aria-label="მოწყობილობა × დღე"
      >
        <header className="matrix-head">
          <div className="matrix-title">
            <h2>მოწყობილობა × დღე</h2>
            <span className="matrix-count">{matrixDevices.length}</span>
            <button
              className="matrix-toggle"
              type="button"
              onClick={() => setMatrixOpen((open) => !open)}
              aria-expanded={matrixOpen}
              aria-controls="offline-matrix-body"
              aria-label={matrixOpen ? "დაკეცვა" : "გაშლა"}
              title={matrixOpen ? "დაკეცვა" : "გაშლა"}
            >
              {matrixOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>

          <div className="matrix-tools">
            <label className="select-control">
              <Filter size={15} />
              <select
                value={matrixSort}
                onChange={(event) =>
                  changeMatrixSort(event.target.value as MatrixSort)
                }
              >
                {(Object.keys(matrixSortLabels) as MatrixSort[]).map((value) => (
                  <option key={value} value={value}>
                    {matrixSortLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-control matrix-threshold">
              <span>ზღვარი</span>
              <input
                type="number"
                min={1}
                value={threshold}
                onChange={(event) =>
                  setThreshold(Math.max(1, Number(event.target.value) || 1))
                }
              />
              <span>დღე</span>
            </label>
            <span className="matrix-legend">
              <i className="matrix-cell outage" />
              გათიშული
              <i className="matrix-cell flapping" />
              არასტაბილური
              <i className="matrix-cell brief" />
              მოკლე
              <i className="matrix-cell snapshot" />
              მხოლოდ 09:00
            </span>
          </div>
        </header>

        {matrixDays.length && matrixDevices.length ? (
          <div className="matrix-scroll" id="offline-matrix-body">
            <div className="matrix-inner">
              {/* header sticks to the top; its left block also sticks to the left */}
              <div className="matrix-row matrix-row-head">
                <div className="matrix-left">
                  <span className="matrix-grip" />
                  <span className="matrix-name">მოწყობილობა</span>
                  <span className="matrix-col-total">დღე</span>
                </div>
                {/* one static label — every cell already carries its own date */}
                <div
                  className="matrix-cells matrix-cells-head"
                  style={{ width: `${matrixDays.length * 32}px` }}
                >
                  <span className="matrix-datelabel">თარიღი</span>
                </div>
                <div className="matrix-right">მონიტ.</div>
              </div>

              <div className="matrix-body">
                {matrixDevices.map((row, index) => {
                  const over = thresholdDeviceIds.has(row.deviceId);
                  const monitored = monitoredMap.has(row.deviceId);
                  return (
                    <div
                      key={row.deviceId}
                      className={`matrix-row${dragOverIndex === index ? " drag-over" : ""}`}
                      draggable
                      onDragStart={() => {
                        dragIndexRef.current = index;
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverIndex(index);
                      }}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={(event) => {
                        event.preventDefault();
                        dropRow(index);
                      }}
                      onDragEnd={() => {
                        dragIndexRef.current = null;
                        setDragOverIndex(null);
                      }}
                    >
                      <div className="matrix-left">
                        <span className="matrix-grip" aria-hidden="true">
                          <GripVertical size={14} />
                        </span>
                        <span className="matrix-name" title={row.name}>
                          <i className={`status-dot ${row.status}`} />
                          {row.name}
                        </span>
                        <span
                          className={`matrix-total${over ? " over" : ""}`}
                          title={`${row.count} დღე offline`}
                        >
                          {row.count}
                        </span>
                      </div>

                      <div
                        className="matrix-cells"
                        style={{ width: `${matrixDays.length * 32}px` }}
                      >
                        {matrixDays.map((column) => {
                          const graded = levelByDeviceDay.get(
                            `${row.deviceId}|${column.date}`,
                          );
                          const seenAtNine = offlineByDay
                            .get(column.date)
                            ?.has(row.deviceId);
                          const state = graded
                            ? graded.level
                            : seenAtNine
                              ? "snapshot"
                              : column.hasSnapshot
                                ? "clear"
                                : "no-data";
                          const picked =
                            selectedCell?.deviceId === row.deviceId &&
                            selectedCell?.date === column.date;
                          return (
                            <button
                              key={column.date}
                              type="button"
                              className={`matrix-cell ${state}${column.isMonthStart ? " month-start" : ""}${picked ? " picked" : ""}`}
                              title={describeDay(
                                column.date,
                                graded,
                                Boolean(seenAtNine),
                                column.hasSnapshot,
                              )}
                              onClick={() =>
                                setSelectedCell(
                                  picked
                                    ? null
                                    : {
                                        deviceId: row.deviceId,
                                        deviceName: row.name,
                                        date: column.date,
                                      },
                                )
                              }
                            >
                              {formatCellDate(column.date)}
                            </button>
                          );
                        })}
                      </div>

                      <div className="matrix-right">
                        <button
                          type="button"
                          className={`matrix-switch${monitored ? " on" : ""}`}
                          disabled={busyAction === `monitor-${row.deviceId}`}
                          onClick={() => void toggleMonitoring(row.deviceId)}
                          role="switch"
                          aria-checked={monitored}
                          aria-label={`${row.name} — მონიტორინგის ${monitored ? "გამორთვა" : "ჩართვა"}`}
                          title={
                            monitored
                              ? "მონიტორინგი ჩართულია — გამორთვა"
                              : "მონიტორინგის ჩართვა"
                          }
                        >
                          <span className="matrix-switch-knob" />
                        </button>
                        <button
                          type="button"
                          className={`matrix-bell${monitored ? " active" : ""}`}
                          disabled={!monitoringHistoryMap.has(row.deviceId)}
                          onClick={() => setHistoryDeviceId(row.deviceId)}
                          aria-label={`${row.name} — offline ისტორია`}
                          title={
                            monitoringHistoryMap.has(row.deviceId)
                              ? "ისტორიის ნახვა"
                              : "ისტორია ჯერ არ არის"
                          }
                        >
                          <BellRing size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <p className="matrix-empty">
            არჩეულ პერიოდში offline მოწყობილობა არ არის.
          </p>
        )}

        <footer className="matrix-foot">
          {selectedCell ? (
            <span className="matrix-picked">
              <strong>{selectedCell.deviceName}</strong>
              {describeDay(
                selectedCell.date,
                levelByDeviceDay.get(
                  `${selectedCell.deviceId}|${selectedCell.date}`,
                ),
                Boolean(
                  offlineByDay
                    .get(selectedCell.date)
                    ?.has(selectedCell.deviceId),
                ),
                offlineByDay.has(selectedCell.date),
              )}
            </span>
          ) : matrixOpen ? (
            "სტრიქონის გადათრევით საკუთარ რიგს აწყობთ — შენახვა ავტომატურია. უჯრაზე დაწკაპუნება თარიღს აჩვენებს."
          ) : (
            `დაკეცილია — ${Math.min(3, matrixDevices.length)} მოწყობილობა ჩანს ${matrixDevices.length}-დან.`
          )}
        </footer>
      </section>

      <section className="content-grid offline-record-grid">
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
                  <div className="rank-row-head">
                    <div>
                      <strong>{device.label}</strong>
                      <span>{device.count} დღე offline</span>
                    </div>
                    <div className="rank-row-actions">
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => removeFrequencyDevice(device.deviceId)}
                        disabled={
                          busyAction ===
                          `frequency-remove-${device.deviceId}`
                        }
                        aria-label={`${device.label} სიხშირიდან წაშლა`}
                        title="სიხშირიდან წაშლა"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
      </section>

      {historyMonitoringRecord ? (
        <MonitoringHistoryModal
          deviceName={historyDevice?.name ?? historyMonitoringRecord.deviceName}
          record={historyMonitoringRecord}
          clearing={busyAction === `clear-${historyMonitoringRecord.deviceId}`}
          onClear={() => void clearHistory(historyMonitoringRecord.deviceId)}
          onClose={() => setHistoryDeviceId(null)}
        />
      ) : null}
      {confirmationDialog}
    </div>
  );
}

function MonitoringHistoryModal({
  deviceName,
  record,
  clearing,
  onClear,
  onClose,
}: {
  deviceName: string;
  record: MonitoredDevice;
  clearing: boolean;
  onClear: () => void;
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
          <div className="offline-history-actions">
            <button
              className="ghost-button danger"
              type="button"
              onClick={onClear}
              disabled={clearing || !record.offlinePeriods.length}
              title="ისტორიის სრულად წაშლა"
            >
              <Trash2 size={15} />
              <span>{clearing ? "იშლება..." : "გასუფთავება"}</span>
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="დახურვა"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
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
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function describeDay(
  date: string,
  graded: DailyOfflineEntry | undefined,
  seenAtNine: boolean,
  hasSnapshot: boolean,
) {
  const day = formatDate(date);

  if (graded) {
    return `${day} — ${levelLabels[graded.level]} · ${graded.minutes} წთ · ${graded.events} გათიშვა (08:00–18:00)`;
  }

  if (seenAtNine) {
    return `${day} — 09:00-ზე offline იყო (ხანგრძლივობა არ იზომებოდა)`;
  }

  if (!hasSnapshot) {
    return `${day} — ჩანაწერი არ არის`;
  }

  return `${day} — online`;
}

function formatCellDate(value: string) {
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}.${match[1]}` : value;
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
