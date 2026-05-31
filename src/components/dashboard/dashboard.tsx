"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Filter,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import {
  GoogleTbilisiMap,
  isLatLng,
  positionToLatLng,
  type LatLng,
} from "@/components/dashboard/google-tbilisi-map";
import { recordAudit } from "@/lib/client-audit";
import { regions, tagCatalog } from "@/lib/mock-data";
import { mergeTags, TAG_STORAGE_KEY } from "@/lib/tags";
import type {
  AppUser,
  Device,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

type DashboardProps = {
  initialDevices: Device[];
  initialTasks: Task[];
  users: AppUser[];
};

type NewTaskForm = {
  title: string;
  issue: string;
  deviceId: string;
  assigneeIds: string[];
  priority: TaskPriority;
  dueDate: string;
};

const statusLabels: Record<TaskStatus, string> = {
  planned: "დაგეგმილი",
  in_progress: "მიმდინარეობს",
  blocked: "შეჩერებული",
  done: "დასრულებული",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "დაბალი",
  normal: "ჩვეულებრივი",
  high: "მაღალი",
  urgent: "სასწრაფო",
};

const today = new Date().toISOString().slice(0, 10);
const DEVICE_LOCATIONS_KEY = "biostar_device_locations";
const LEGACY_DEVICE_POSITIONS_KEY = "biostar_device_positions";

export function Dashboard({
  initialDevices,
  initialTasks,
  users,
}: DashboardProps) {
  const [devices, setDevices] = useState(initialDevices);
  const [tasks, setTasks] = useState(initialTasks);
  const [deviceLocations, setDeviceLocations] = useState<
    Record<string, LatLng>
  >(() => createDefaultDeviceLocations(initialDevices));
  const [regionFilter, setRegionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [availableTags, setAvailableTags] = useState<string[]>(() =>
    mergeTags(
      [...tagCatalog],
      initialDevices.flatMap((device) => device.tags),
    ),
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [refreshingDevices, setRefreshingDevices] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<{
    deviceId: string;
    taskId: string;
    userId: string;
  } | null>(null);
  const [form, setForm] = useState<NewTaskForm>({
    title: "",
    issue: "",
    deviceId: initialDevices[0]?.id || "",
    assigneeIds: users[1] ? [users[1].id] : [],
    priority: "normal",
    dueDate: today,
  });

  const userMap = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );
  const deviceMap = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );

  const refreshDevices = useCallback(
    async (source: "manual" | "interval" = "manual") => {
      setRefreshingDevices(true);
      setRefreshError("");

      try {
        const syncResponse = await fetch("/api/biostar/sync", {
          method: "POST",
        });

        if (!syncResponse.ok) {
          throw new Error("BioStar sync failed.");
        }

        const devicesResponse = await fetch("/api/devices", {
          cache: "no-store",
        });

        if (!devicesResponse.ok) {
          throw new Error("Devices refresh failed.");
        }

        const payload = (await devicesResponse.json()) as { devices?: Device[] };
        if (!Array.isArray(payload.devices)) {
          throw new Error("Devices response is invalid.");
        }

        setDevices(payload.devices);
        setLastRefreshedAt(new Date().toISOString());

        if (source === "manual") {
          recordAudit("dashboard.devices_refresh", "dashboard");
        }
      } catch {
        setRefreshError("განახლება ვერ მოხერხდა.");
      } finally {
        setRefreshingDevices(false);
      }
    },
    [],
  );

  useEffect(() => {
    const storedTags = JSON.parse(
      window.localStorage.getItem(TAG_STORAGE_KEY) || "[]",
    );
    if (Array.isArray(storedTags)) {
      setAvailableTags((current) => mergeTags(current, storedTags.map(String)));
    }
  }, []);

  useEffect(() => {
    const storedLocations = readDeviceLocations(
      window.localStorage.getItem(DEVICE_LOCATIONS_KEY),
    );
    const legacyLocations = readLegacyDeviceLocations(
      window.localStorage.getItem(LEGACY_DEVICE_POSITIONS_KEY),
    );

    setDeviceLocations((current) => ({
      ...current,
      ...legacyLocations,
      ...storedLocations,
    }));
  }, []);

  useEffect(() => {
    setDeviceLocations((current) => {
      let changed = false;
      const next = { ...current };

      devices.forEach((device) => {
        if (!next[device.id]) {
          next[device.id] = positionToLatLng(device.position);
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [devices]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshDevices("interval");
    }, 60 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [refreshDevices]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done"),
    [tasks],
  );
  const recentTasks = useMemo(
    () =>
      [...tasks]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 7),
    [tasks],
  );

  const tasksByDevice = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of activeTasks) {
      const next = grouped.get(task.deviceId) ?? [];
      next.push(task);
      grouped.set(task.deviceId, next);
    }
    return grouped;
  }, [activeTasks]);

  const visibleDevices = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return devices.filter((device) => {
      const deviceTasks = tasksByDevice.get(device.id) ?? [];
      const matchesRegion =
        regionFilter === "all" || device.region === regionFilter;
      const matchesUser =
        userFilter === "all" ||
        deviceTasks.some((task) => task.assigneeIds.includes(userFilter));
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((tagName) => device.tags.includes(tagName));
      const matchesQuery =
        !normalized ||
        device.code.toLowerCase().includes(normalized) ||
        device.name.toLowerCase().includes(normalized);

      return matchesRegion && matchesUser && matchesTags && matchesQuery;
    });
  }, [devices, query, regionFilter, selectedTags, tasksByDevice, userFilter]);

  const offlineCount = devices.filter(
    (device) => device.status === "offline",
  ).length;
  const errorCount = devices.filter((device) => device.status === "error").length;
  const plannedVisitCount = activeTasks.filter(
    (task) => task.assigneeIds.length > 0,
  ).length;

  function toggleTag(tagName: string) {
    setSelectedTags((current) => {
      const next = current.includes(tagName)
        ? current.filter((tag) => tag !== tagName)
        : [...current, tagName];
      recordAudit("dashboard.filter", "tag", tagName, { selectedTags: next });
      return next;
    });
  }

  function updateRegionFilter(value: string) {
    setRegionFilter(value);
    recordAudit("dashboard.filter", "region", value);
  }

  function updateUserFilter(value: string) {
    setUserFilter(value);
    recordAudit("dashboard.filter", "user", value);
  }

  function resetFilters() {
    setRegionFilter("all");
    setUserFilter("all");
    setSelectedTags([]);
    setQuery("");
    recordAudit("dashboard.filter_reset", "dashboard");
  }

  function toggleAssignee(userId: string) {
    setForm((current) => ({
      ...current,
      assigneeIds: current.assigneeIds.includes(userId)
        ? current.assigneeIds.filter((id) => id !== userId)
        : [...current.assigneeIds, userId],
    }));
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !form.title.trim() ||
      !form.issue.trim() ||
      !form.deviceId ||
      !form.assigneeIds.length
    ) {
      return;
    }

    const optimisticTask: Task = {
      id: `task-local-${Date.now()}`,
      title: form.title.trim(),
      issue: form.issue.trim(),
      deviceId: form.deviceId,
      assigneeIds: form.assigneeIds,
      status: "planned",
      priority: form.priority,
      dueDate: form.dueDate,
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [optimisticTask, ...current]);
    setForm({
      title: "",
      issue: "",
      deviceId: form.deviceId,
      assigneeIds: form.assigneeIds,
      priority: "normal",
      dueDate: today,
    });
    setShowCreateTask(false);

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(optimisticTask),
    }).catch(() => null);

    if (response?.ok) {
      const payload = await response.json();
      setTasks((current) =>
        current.map((task) =>
          task.id === optimisticTask.id ? payload.task : task,
        ),
      );
    }
  }

  function showAssignment(deviceId: string, taskId: string, userId: string) {
    setActiveAssignment({ deviceId, taskId, userId });
    recordAudit("dashboard.assignment_open", "task", taskId, {
      deviceId,
      userId,
    });
  }

  function selectDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    setActiveAssignment(null);
    recordAudit("dashboard.device_open", "device", deviceId);
  }

  function startDeviceEdit(deviceId: string) {
    setSelectedDeviceId(deviceId);
    setEditingDeviceId(deviceId);
    recordAudit("dashboard.device_location_edit_start", "device", deviceId);
  }

  function stopDeviceEdit(deviceId: string) {
    setEditingDeviceId(null);
    recordAudit("dashboard.device_location_edit_save", "device", deviceId);
  }

  function updateDeviceLocation(deviceId: string, location: LatLng) {
    setDeviceLocations((current) => {
      const next = {
        ...current,
        [deviceId]: location,
      };
      window.localStorage.setItem(DEVICE_LOCATIONS_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="dashboard-page">
      <section className="page-header compact">
        <div>
          <p className="eyebrow">თბილისის რუკა</p>
          <h1>X-Station სტატუსები</h1>
          <p>დაგეგმილი ვიზიტები და მიმდინარე ტასკები ერთ ხედში.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <WifiOff size={18} />
            <span>{offlineCount}</span>
            <small>offline</small>
          </div>
          <div className="metric">
            <AlertTriangle size={18} />
            <span>{errorCount}</span>
            <small>error</small>
          </div>
          <div className="metric">
            <Users size={18} />
            <span>{plannedVisitCount}</span>
            <small>ვიზიტი</small>
          </div>
          <div className="metric">
            <MapPin size={18} />
            <span>{visibleDevices.length}</span>
            <small>ნაჩვენები</small>
          </div>
        </div>
      </section>

      <section className="filter-bar" aria-label="რუკის ფილტრები">
        <div className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ძებნა ნომრით ან სახელით"
          />
        </div>

        <label className="select-control">
          <Filter size={17} />
          <select
            value={regionFilter}
            onChange={(event) => updateRegionFilter(event.target.value)}
          >
            <option value="all">ყველა რეგიონი</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>

        <label className="select-control">
          <Users size={17} />
          <select
            value={userFilter}
            onChange={(event) => updateUserFilter(event.target.value)}
          >
            <option value="all">ყველა მომხმარებელი</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>

        <button className="ghost-button" type="button" onClick={resetFilters}>
          <RotateCcw size={16} />
          <span>გასუფთავება</span>
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={refreshingDevices}
          onClick={() => void refreshDevices()}
        >
          <RefreshCw size={16} />
          <span>{refreshingDevices ? "ახლდება" : "განახლება"}</span>
        </button>
        {refreshError ? (
          <span className="sync-message error">{refreshError}</span>
        ) : lastRefreshedAt ? (
          <span className="sync-message">
            ბოლო: {formatSyncTime(lastRefreshedAt)}
          </span>
        ) : null}
      </section>

      <section className="tag-filter" aria-label="ტეგები">
        {availableTags.map((tagName) => (
          <button
            key={tagName}
            className={`tag-toggle ${selectedTags.includes(tagName) ? "active" : ""}`}
            type="button"
            onClick={() => toggleTag(tagName)}
          >
            <Tag size={14} />
            <span>{tagName}</span>
          </button>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="map-surface" aria-label="თბილისის რუკა">
          <GoogleTbilisiMap
            devices={visibleDevices}
            deviceLocations={deviceLocations}
            tasksByDevice={tasksByDevice}
            userMap={userMap}
            activeAssignment={activeAssignment}
            selectedDeviceId={selectedDeviceId}
            editingDeviceId={editingDeviceId}
            onSelect={selectDevice}
            onCloseDevice={() => {
              setSelectedDeviceId(null);
              setEditingDeviceId(null);
            }}
            onStartEdit={startDeviceEdit}
            onStopEdit={stopDeviceEdit}
            onMove={updateDeviceLocation}
            onShowAssignment={showAssignment}
            onCloseAssignment={() => setActiveAssignment(null)}
          />
        </section>

        <aside className="task-rail" aria-label="ტასკები">
          <div className="rail-header">
            <div>
              <p className="eyebrow">ტასკები</p>
              <h2>{showCreateTask ? "ახალი ტასკი" : "ბოლო დამატებული"}</h2>
            </div>
            <button
              className={showCreateTask ? "ghost-button" : "primary-button"}
              type="button"
              onClick={() => setShowCreateTask((current) => !current)}
            >
              {showCreateTask ? <X size={17} /> : <Plus size={17} />}
              <span>{showCreateTask ? "დახურვა" : "დამატება"}</span>
            </button>
          </div>

          {showCreateTask ? (
            <form className="quick-task-form" onSubmit={createTask}>
              <select
                value={form.deviceId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    deviceId: event.target.value,
                  }))
                }
                required
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.code} · {device.name}
                  </option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="ტასკის სათაური"
                required
              />
              <textarea
                value={form.issue}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    issue: event.target.value,
                  }))
                }
                placeholder="რა საკითხის მოსაგვარებლად მიდიან"
                rows={3}
                required
              />
              <div className="form-row">
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value as TaskPriority,
                    }))
                  }
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
              <div className="assignee-picker">
                {users
                  .filter((user) => user.role !== "viewer")
                  .map((user) => (
                    <button
                      key={user.id}
                      className={`avatar-choice ${form.assigneeIds.includes(user.id) ? "active" : ""}`}
                      type="button"
                      onClick={() => toggleAssignee(user.id)}
                      title={user.name}
                    >
                      <span style={{ backgroundColor: user.color }}>
                        {user.initials}
                      </span>
                      <small>{user.name.split(" ")[0]}</small>
                    </button>
                  ))}
              </div>
              <button className="primary-button" type="submit">
                <Plus size={18} />
                <span>დამახსოვრება</span>
              </button>
            </form>
          ) : null}

          <div className="task-list">
            {(showCreateTask ? activeTasks : recentTasks).map((task) => {
              const device = deviceMap.get(task.deviceId);
              const firstUser = userMap.get(task.assigneeIds[0]);
              return (
                <article
                  key={task.id}
                  className={`task-card priority-${task.priority}`}
                  style={{ borderInlineStartColor: firstUser?.color }}
                >
                  <div className="task-card-top">
                    <div className="avatar-stack">
                      {task.assigneeIds.map((userId) => {
                        const user = userMap.get(userId);
                        return user ? (
                          <span
                            key={user.id}
                            className="avatar small"
                            style={{ backgroundColor: user.color }}
                          >
                            {user.initials}
                          </span>
                        ) : null;
                      })}
                    </div>
                    <span className={`status-pill ${task.status}`}>
                      {statusLabels[task.status]}
                    </span>
                  </div>
                  <h3>{task.title}</h3>
                  <p>{task.issue}</p>
                  <footer>
                    <span>
                      <MapPin size={14} />
                      {device?.code || task.deviceId}
                    </span>
                    <span>
                      <CalendarDays size={14} />
                      {task.dueDate}
                    </span>
                    <Link href={`/tasks/${task.id}`}>დეტალურად</Link>
                  </footer>
                </article>
              );
            })}
          </div>
          {!showCreateTask ? (
            <Link className="rail-link" href="/tasks">
              ყველა ტასკის ნახვა
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function createDefaultDeviceLocations(devices: Device[]) {
  return Object.fromEntries(
    devices.map((device) => [device.id, positionToLatLng(device.position)]),
  );
}

function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat("ka-GE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readDeviceLocations(rawValue: string | null) {
  const parsed = parseStoredObject(rawValue);
  const locations: Record<string, LatLng> = {};

  Object.entries(parsed).forEach(([deviceId, value]) => {
    if (isLatLng(value)) {
      locations[deviceId] = value;
    }
  });

  return locations;
}

function readLegacyDeviceLocations(rawValue: string | null) {
  const parsed = parseStoredObject(rawValue);
  const locations: Record<string, LatLng> = {};

  Object.entries(parsed).forEach(([deviceId, value]) => {
    if (isValidLegacyPosition(value)) {
      locations[deviceId] = positionToLatLng(value);
    }
  });

  return locations;
}

function parseStoredObject(rawValue: string | null): Record<string, unknown> {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isValidLegacyPosition(value: unknown): value is Device["position"] {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Device["position"]).x === "number" &&
    typeof (value as Device["position"]).y === "number" &&
    Number.isFinite((value as Device["position"]).x) &&
    Number.isFinite((value as Device["position"]).y)
  );
}
