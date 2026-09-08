"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Filter,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { GoogleTbilisiMap } from "@/components/dashboard/google-tbilisi-map";
import { TaskTagPicker } from "@/components/tasks/task-tag-picker";
import { regions } from "@/lib/catalog";
import { recordAudit } from "@/lib/client-audit";
import { findDeviceByName, sortDevicesByName } from "@/lib/device-options";
import { withoutDeviceCodes } from "@/lib/display";
import { clampLatLng, type LatLng } from "@/lib/geo";
import { mergeTags } from "@/lib/tags";
import { getAssignableTaskUsers } from "@/lib/task-assignees";
import type {
  AppUser,
  Device,
  DeviceStatus,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

type DashboardProps = {
  initialDevices: Device[];
  initialTasks: Task[];
  initialTags: string[];
  users: AppUser[];
  canEditDeviceLocations: boolean;
  canCreateTaskTags: boolean;
  canDeleteTaskTags: boolean;
};

type NewTaskForm = {
  title: string;
  issue: string;
  phone: string;
  deviceId: string;
  deviceQuery: string;
  assigneeIds: string[];
  priority: TaskPriority;
  tags: string[];
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
const railStorageKey = "bagebi-map-rail";

export function Dashboard({
  initialDevices,
  initialTasks,
  initialTags,
  users,
  canEditDeviceLocations,
  canCreateTaskTags,
  canDeleteTaskTags,
}: DashboardProps) {
  const initialActiveDeviceId =
    initialDevices.find((device) => !device.isExcluded)?.id ||
    initialDevices[0]?.id ||
    "";
  const initialActiveDevice = initialDevices.find(
    (device) => device.id === initialActiveDeviceId,
  );
  const initialAssignableUsers = getAssignableTaskUsers(users);
  const [devices, setDevices] = useState(initialDevices);
  const [tasks, setTasks] = useState(initialTasks);
  const [availableTags, setAvailableTags] = useState(() =>
    mergeTags(
      initialTags,
      initialTasks.flatMap((task) => task.tags),
    ),
  );
  const [deviceLocations, setDeviceLocations] = useState<
    Record<string, LatLng>
  >(() => createDefaultDeviceLocations(initialDevices));
  const [regionFilter, setRegionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | "all">("all");
  const [userFilter, setUserFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDeviceTags, setSelectedDeviceTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [showOfflineDevices, setShowOfflineDevices] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [locationSaveError, setLocationSaveError] = useState("");
  const [refreshingDevices, setRefreshingDevices] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [taskSaveError, setTaskSaveError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<{
    deviceId: string;
    taskId: string;
    userId: string;
  } | null>(null);
  const [form, setForm] = useState<NewTaskForm>({
    title: "",
    issue: "",
    phone: "",
    deviceId: initialActiveDeviceId,
    deviceQuery: initialActiveDevice?.name ?? "",
    assigneeIds: initialAssignableUsers[0] ? [initialAssignableUsers[0].id] : [],
    priority: "normal",
    tags: [],
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
  const activeDevices = useMemo(
    () => devices.filter((device) => !device.isExcluded),
    [devices],
  );
  const sortedActiveDevices = useMemo(
    () => sortDevicesByName(activeDevices),
    [activeDevices],
  );
  const assignableUsers = useMemo(
    () => getAssignableTaskUsers(users),
    [users],
  );
  const activeDeviceIds = useMemo(
    () => new Set(activeDevices.map((device) => device.id)),
    [activeDevices],
  );
  const deviceTagOptions = useMemo(
    () => mergeTags(activeDevices.flatMap((device) => device.tags)),
    [activeDevices],
  );

  const refreshDevices = useCallback(
    async (source: "manual" | "interval" = "manual") => {
      const manual = source === "manual";
      if (manual) {
        setRefreshingDevices(true);
      }
      setRefreshError("");

      try {
        /* The 5-minute cron already keeps BioStar2 in sync, so the timed
           refresh only re-reads what it stored. Pressing the button still
           forces a fresh pull. */
        if (manual) {
          const syncResponse = await fetch("/api/biostar/sync", {
            method: "POST",
          });

          if (!syncResponse.ok) {
            throw new Error("BioStar sync failed.");
          }
        }

        const devicesResponse = await fetch("/api/devices", {
          cache: "no-store",
        });

        if (!devicesResponse.ok) {
          throw new Error("Devices refresh failed.");
        }

        const payload = (await devicesResponse.json()) as {
          devices?: Device[];
        };
        if (!Array.isArray(payload.devices)) {
          throw new Error("Devices response is invalid.");
        }

        setDevices(payload.devices);
        setLastRefreshedAt(new Date().toISOString());

        if (manual) {
          recordAudit("dashboard.devices_refresh", "dashboard");
        }
      } catch {
        setRefreshError("განახლება ვერ მოხერხდა.");
      } finally {
        if (manual) {
          setRefreshingDevices(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    setDeviceLocations((current) => {
      let changed = false;
      const next: Record<string, LatLng> = {};

      devices.forEach((device) => {
        if (editingDeviceId === device.id && current[device.id]) {
          next[device.id] = current[device.id];
          return;
        }

        const location = clampLatLng(device.position);
        const currentLocation = current[device.id];
        next[device.id] = location;

        if (
          !currentLocation ||
          currentLocation.lat !== location.lat ||
          currentLocation.lng !== location.lng
        ) {
          changed = true;
        }
      });

      Object.keys(current).forEach((deviceId) => {
        if (!next[deviceId]) {
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [devices, editingDeviceId]);

  useEffect(() => {
    // Matches the cron cadence, so the map is never more than one poll behind.
    const intervalId = window.setInterval(
      () => {
        void refreshDevices("interval");
      },
      5 * 60 * 1000,
    );

    return () => window.clearInterval(intervalId);
  }, [refreshDevices]);

  useEffect(() => {
    if (!showCreateTask) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowCreateTask(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showCreateTask]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(railStorageKey) === "collapsed") {
        setRailOpen(false);
      }
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
  }, []);

  /** Only an explicit toggle is remembered, so an empty day does not leave the
   *  rail collapsed once planned work exists again. */
  const toggleRail = useCallback(() => {
    const next = !railOpen;
    setRailOpen(next);
    try {
      window.localStorage.setItem(
        railStorageKey,
        next ? "expanded" : "collapsed",
      );
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
  }, [railOpen]);

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (task) => task.status !== "done" && activeDeviceIds.has(task.deviceId),
      ),
    [activeDeviceIds, tasks],
  );
  const visibleActiveTasks = useMemo(
    () => activeTasks.filter((task) => taskMatchesTags(task, selectedTags)),
    [activeTasks, selectedTags],
  );
  /** The rail lists planned work, newest first. */
  const plannedTasks = useMemo(
    () =>
      [...tasks]
        .filter(
          (task) =>
            task.status === "planned" && taskMatchesTags(task, selectedTags),
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [selectedTags, tasks],
  );

  const tasksByDevice = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of visibleActiveTasks) {
      const next = grouped.get(task.deviceId) ?? [];
      next.push(task);
      grouped.set(task.deviceId, next);
    }
    return grouped;
  }, [visibleActiveTasks]);

  const visibleDevices = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return activeDevices.filter((device) => {
      const deviceTasks = tasksByDevice.get(device.id) ?? [];
      const matchesRegion =
        regionFilter === "all" || device.region === regionFilter;
      const matchesStatus =
        statusFilter === "all" || device.status === statusFilter;
      const matchesUser =
        userFilter === "all" ||
        deviceTasks.some((task) => task.assigneeIds.includes(userFilter));
      const matchesTags = selectedTags.length === 0 || deviceTasks.length > 0;
      const matchesDeviceTags =
        selectedDeviceTags.length === 0 ||
        selectedDeviceTags.every((tagName) => device.tags.includes(tagName));
      const matchesQuery =
        !normalized || device.name.toLowerCase().includes(normalized);

      return (
        matchesRegion &&
        matchesStatus &&
        matchesUser &&
        matchesTags &&
        matchesDeviceTags &&
        matchesQuery
      );
    });
  }, [
    activeDevices,
    query,
    regionFilter,
    selectedDeviceTags,
    selectedTags,
    statusFilter,
    tasksByDevice,
    userFilter,
  ]);

  const offlineDevices = useMemo(
    () =>
      activeDevices
        .filter((device) => device.status === "offline")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [activeDevices],
  );
  const offlineCount = offlineDevices.length;
  const errorCount = activeDevices.filter(
    (device) => device.status === "error",
  ).length;
  const plannedVisitCount = activeTasks.filter(
    (task) => task.assigneeIds.length > 0,
  ).length;
  const hasPlannedTasks = plannedTasks.length > 0;
  const railExpanded = railOpen;

  /** Nothing planned collapses the rail once; it can still be opened by hand. */
  useEffect(() => {
    if (!hasPlannedTasks) {
      setRailOpen(false);
    }
  }, [hasPlannedTasks]);
  /** Shown on the toggle so a collapsed panel never hides an active filter. */
  const activeFilterCount =
    (regionFilter === "all" ? 0 : 1) +
    (statusFilter === "all" ? 0 : 1) +
    (userFilter === "all" ? 0 : 1) +
    selectedTags.length +
    selectedDeviceTags.length;

  function toggleTag(tagName: string) {
    setSelectedTags((current) => {
      const next = current.includes(tagName)
        ? current.filter((tag) => tag !== tagName)
        : [...current, tagName];
      recordAudit("dashboard.filter", "tag", tagName, { selectedTags: next });
      return next;
    });
  }

  function toggleDeviceTag(tagName: string) {
    setSelectedDeviceTags((current) => {
      const next = current.includes(tagName)
        ? current.filter((tag) => tag !== tagName)
        : [...current, tagName];
      recordAudit("dashboard.filter", "device_tag", tagName, {
        selectedDeviceTags: next,
      });
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
    setStatusFilter("all");
    setUserFilter("all");
    setSelectedTags([]);
    setSelectedDeviceTags([]);
    setQuery("");
    recordAudit("dashboard.filter_reset", "dashboard");
  }

  function toggleOfflineDevices() {
    const next = !showOfflineDevices;
    setShowOfflineDevices(next);
    void recordAudit(
      "dashboard.offline_devices_toggle",
      "dashboard",
      undefined,
      {
        open: next,
        count: offlineDevices.length,
      },
    );
  }

  function toggleAssignee(userId: string) {
    setForm((current) => ({
      ...current,
      assigneeIds: current.assigneeIds.includes(userId)
        ? current.assigneeIds.filter((id) => id !== userId)
        : [...current.assigneeIds, userId],
    }));
  }

  function toggleFormTag(tagName: string) {
    setForm((current) => ({
      ...current,
      tags: toggleListValue(current.tags, tagName),
    }));
  }

  async function createAvailableTag(tagName: string) {
    if (!canCreateTaskTags) {
      return false;
    }

    setTaskSaveError("");
    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    }).catch(() => null);

    if (!response?.ok) {
      setTaskSaveError("ტეგის დამატება ვერ მოხერხდა.");
      return false;
    }

    const data = (await response.json()) as {
      tag?: string;
      tags?: string[];
    };
    setAvailableTags((current) =>
      mergeTags(data.tags ?? current, data.tag ? [data.tag] : [tagName]),
    );
    return true;
  }

  async function removeAvailableTag(tagName: string) {
    if (!canDeleteTaskTags) {
      return false;
    }

    setTaskSaveError("");
    const response = await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    }).catch(() => null);

    if (!response?.ok) {
      setTaskSaveError("ტეგის წაშლა ვერ მოხერხდა.");
      return false;
    }

    const data = (await response.json()) as { tags?: string[] };
    setAvailableTags(
      (current) => data.tags ?? current.filter((tag) => tag !== tagName),
    );
    setSelectedTags((current) => current.filter((tag) => tag !== tagName));
    setForm((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag !== tagName),
    }));
    setTasks((current) =>
      current.map((task) => ({
        ...task,
        tags: task.tags.filter((tag) => tag !== tagName),
      })),
    );
    return true;
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.deviceId) {
      setTaskSaveError("დავაისი აირჩიეთ ჩამონათვალიდან.");
      return;
    }

    if (!form.title.trim() || !form.issue.trim() || !form.assigneeIds.length) {
      return;
    }

    const optimisticTask: Task = {
      id: `task-local-${Date.now()}`,
      title: form.title.trim(),
      issue: form.issue.trim(),
      phone: form.phone.trim(),
      deviceId: form.deviceId,
      assigneeIds: form.assigneeIds,
      status: "planned",
      priority: form.priority,
      tags: form.tags,
      dueDate: form.dueDate,
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [optimisticTask, ...current]);
    setTaskSaveError("");
    setForm({
      title: "",
      issue: "",
      phone: "",
      deviceId: form.deviceId,
      deviceQuery: form.deviceQuery,
      assigneeIds: form.assigneeIds,
      priority: "normal",
      tags: [],
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
    if (!canEditDeviceLocations) {
      return;
    }

    setSelectedDeviceId(deviceId);
    setEditingDeviceId(deviceId);
    setLocationSaveError("");
    recordAudit("dashboard.device_location_edit_start", "device", deviceId);
  }

  function stopDeviceEdit(deviceId: string) {
    setEditingDeviceId(null);
    recordAudit("dashboard.device_location_edit_save", "device", deviceId);
    void saveDeviceLocation(deviceId, deviceLocations[deviceId]);
  }

  function updateDeviceLocation(deviceId: string, location: LatLng) {
    setDeviceLocations((current) => {
      return {
        ...current,
        [deviceId]: location,
      };
    });
  }

  async function saveDeviceLocation(deviceId: string, location?: LatLng) {
    if (!location) {
      return;
    }

    setLocationSaveError("");
    const response = await fetch(`/api/devices/${deviceId}/position`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: clampLatLng(location) }),
    }).catch(() => null);

    if (!response?.ok) {
      const device = deviceMap.get(deviceId);
      if (device) {
        setDeviceLocations((current) => ({
          ...current,
          [deviceId]: clampLatLng(device.position),
        }));
      }
      setLocationSaveError("ლოკაციის შენახვა ვერ მოხერხდა.");
      return;
    }

    const payload = (await response.json()) as { device?: Device };
    const savedDevice = payload.device;
    if (savedDevice) {
      setDevices((current) =>
        current.map((device) =>
          device.id === savedDevice.id ? savedDevice : device,
        ),
      );
      setDeviceLocations((current) => ({
        ...current,
        [savedDevice.id]: clampLatLng(savedDevice.position),
      }));
      recordAudit("dashboard.device_location_update", "device", deviceId, {
        position: savedDevice.position,
      });
    }
  }

  return (
    <div className="dashboard-page map-console">
      <GoogleTbilisiMap
        devices={visibleDevices}
        deviceLocations={deviceLocations}
        tasksByDevice={tasksByDevice}
        userMap={userMap}
        canEditLocations={canEditDeviceLocations}
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
        onMoveEnd={(deviceId, location) => {
          updateDeviceLocation(deviceId, location);
          void saveDeviceLocation(deviceId, location);
        }}
        onShowAssignment={showAssignment}
        onCloseAssignment={() => setActiveAssignment(null)}
      />

      <div className="map-console-top">
      <div className="map-panels-left">
        <section className="map-panel map-head-panel" aria-label="მიმოხილვა">
          <div className="map-head-top">
            <h1>X-Station სტატუსები</h1>
            {refreshError ? (
              <span className="map-sync error">{refreshError}</span>
            ) : locationSaveError ? (
              <span className="map-sync error">{locationSaveError}</span>
            ) : lastRefreshedAt ? (
              <span className="map-sync">
                <i className="status-dot online" />
                {formatSyncTime(lastRefreshedAt)}
              </span>
            ) : null}
          </div>

          <div className="map-stats">
            <button
              className={`map-stat map-stat-button${showOfflineDevices ? " active" : ""}`}
              type="button"
              onClick={toggleOfflineDevices}
              aria-expanded={showOfflineDevices}
              aria-controls="dashboard-offline-devices"
            >
              <span>
                <i className="status-dot offline" />
                offline
              </span>
              <strong className="offline">{offlineCount}</strong>
            </button>
            <div className="map-stat">
              <span>
                <i className="status-dot error" />
                error
              </span>
              <strong className="error">{errorCount}</strong>
            </div>
            <div className="map-stat">
              <span>ვიზიტი</span>
              <strong>{plannedVisitCount}</strong>
            </div>
            <div className="map-stat">
              <span>ნაჩვენები</span>
              <strong>{visibleDevices.length}</strong>
            </div>
          </div>
        </section>

        {showOfflineDevices ? (
          <section
            id="dashboard-offline-devices"
            className="map-panel map-offline-panel"
            aria-label="Offline მოწყობილობების ჩამონათვალი"
          >
            <header>
              <h2>Offline მოწყობილობები</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowOfflineDevices(false)}
                aria-label="ჩამონათვალის დახურვა"
              >
                <X size={16} />
              </button>
            </header>
            {offlineDevices.length ? (
              <div className="map-offline-list">
                {offlineDevices.map((device) => (
                  <Link
                    key={device.id}
                    className="map-offline-item"
                    href={`/devices/${device.id}`}
                  >
                    <strong>{device.name}</strong>
                    <small>{device.region}</small>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted">ამ დროისთვის offline მოწყობილობა არ არის.</p>
            )}
          </section>
        ) : null}

      </div>

      <div className="map-panels-filter">
        <div className="map-panel map-search-panel">
          <div className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ძებნა სახელით"
            />
          </div>
          <button
            className={`map-filter-toggle${filtersOpen ? " active" : ""}`}
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="dashboard-filters"
            aria-label={filtersOpen ? "ფილტრების დაკეცვა" : "ფილტრების გაშლა"}
            title={filtersOpen ? "ფილტრების დაკეცვა" : "ფილტრების გაშლა"}
          >
            <SlidersHorizontal size={15} />
            {activeFilterCount > 0 ? (
              <span className="map-filter-count">{activeFilterCount}</span>
            ) : null}
            {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {filtersOpen ? (
        <section
          id="dashboard-filters"
          className="map-panel map-filter-panel"
          aria-label="რუკის ფილტრები"
        >
          <div className="map-filter-row">
            <label className="select-control">
              <Filter size={15} />
              <select
                value={regionFilter}
                onChange={(event) => updateRegionFilter(event.target.value)}
              >
                <option value="all">ყველა რაიონი</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>

            <label className="select-control">
              <Wifi size={15} />
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as DeviceStatus | "all")
                }
              >
                <option value="all">ყველა სტატუსი</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="error">Error</option>
              </select>
            </label>
          </div>

          <label className="select-control">
            <Users size={15} />
            <select
              value={userFilter}
              onChange={(event) => updateUserFilter(event.target.value)}
            >
              <option value="all">ყველა მომხმარებელი</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>

          <div className="map-filter-actions">
            <button className="ghost-button" type="button" onClick={resetFilters}>
              <RotateCcw size={15} />
              <span>გასუფთავება</span>
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={refreshingDevices}
              onClick={() => void refreshDevices()}
            >
              <RefreshCw size={15} />
              <span>{refreshingDevices ? "ახლდება" : "განახლება"}</span>
            </button>
          </div>

          {availableTags.length ? (
            <div className="map-tag-group" aria-label="ტასკების ტეგები">
              <span className="map-tag-label">ტასკები</span>
              <div className="map-tag-chips">
                {availableTags.map((tagName) => (
                  <button
                    key={tagName}
                    className={`tag-toggle compact ${selectedTags.includes(tagName) ? "active" : ""}`}
                    type="button"
                    onClick={() => toggleTag(tagName)}
                  >
                    <Tag size={12} />
                    <span>{tagName}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {deviceTagOptions.length ? (
            <div className="map-tag-group" aria-label="X-Station ტეგები">
              <span className="map-tag-label">X-Station</span>
              <div className="map-tag-chips">
                {deviceTagOptions.map((tagName) => (
                  <button
                    key={tagName}
                    className={`tag-toggle compact ${selectedDeviceTags.includes(tagName) ? "active" : ""}`}
                    type="button"
                    onClick={() => toggleDeviceTag(tagName)}
                  >
                    <Tag size={12} />
                    <span>{tagName}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        ) : null}
      </div>
      </div>

      <aside
        className="map-panel map-rail"
        data-open={railExpanded ? "true" : "false"}
        aria-label="მიმდინარე დავალებები"
      >
        <header className="map-rail-head">
          <div className="map-rail-title">
            <h2>მიმდინარე დავალებები</h2>
            <span className="map-rail-count">{plannedTasks.length}</span>
            <button
              className="map-rail-toggle"
              type="button"
              onClick={toggleRail}
              aria-expanded={railExpanded}
              aria-controls="dashboard-rail-list"
              aria-label={railExpanded ? "დაკეცვა" : "გაშლა"}
              title={railExpanded ? "დაკეცვა" : "გაშლა"}
            >
              {railExpanded ? (
                <ChevronUp size={15} />
              ) : (
                <ChevronDown size={15} />
              )}
            </button>
          </div>
          <button
            className="map-rail-add"
            type="button"
            onClick={() => {
              setTaskSaveError("");
              setShowCreateTask(true);
            }}
            aria-label="ახალი ტასკი"
            title="ახალი ტასკი"
          >
            <Plus size={16} strokeWidth={2.4} />
          </button>
        </header>

        {railExpanded ? (
        <>
        <div className="map-rail-scroll" id="dashboard-rail-list">
          {hasPlannedTasks ? null : (
            <p className="muted">დაგეგმილი დავალება არ არის.</p>
          )}
          <div className="task-list">
            {plannedTasks.map((task) => {
              const device = deviceMap.get(task.deviceId);
              const firstUser = userMap.get(task.assigneeIds[0]);
              const displayTitle = withoutDeviceCodes(task.title, [
                device?.code,
              ]);
              const displayIssue = withoutDeviceCodes(task.issue, [
                device?.code,
              ]);
              return (
                <Link
                  key={task.id}
                  className={`task-card task-card-link priority-${task.priority}`}
                  href={`/tasks/${task.id}`}
                  style={{ borderInlineStartColor: firstUser?.color }}
                >
                  <div className="task-card-top">
                    {task.problemReportId ? (
                      <span
                        className={`issue-indicator ${getIssueIndicatorState(task)}`}
                        aria-label="პრობლემის ინდიკატორი"
                      />
                    ) : null}
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
                  <h3>{displayTitle}</h3>
                  <p>{displayIssue}</p>
                  {task.phone ? (
                    <small className="phone-inline">{task.phone}</small>
                  ) : null}
                  <TaskTagList tags={task.tags} />
                  <footer>
                    <span>
                      <MapPin size={14} />
                      {device?.name || "ბაღი ვერ მოიძებნა"}
                    </span>
                    <span>
                      <CalendarDays size={14} />
                      {task.dueDate}
                    </span>
                    <span className="task-card-detail">დეტალურად</span>
                  </footer>
                </Link>
              );
            })}
          </div>
        </div>

        <Link className="map-rail-link" href="/tasks">
          ყველა ტასკის ნახვა
        </Link>
        </>
        ) : null}
      </aside>

      {showCreateTask ? (
        <div
          className="quick-task-modal-backdrop"
          role="presentation"
          onClick={() => setShowCreateTask(false)}
        >
          <section
            className="quick-task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-task-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">ტასკი</p>
                <h2 id="quick-task-modal-title">ახალი ტასკი</h2>
              </div>
              <button
                className="primary-button"
                type="submit"
                form="quick-task-form"
              >
                <Plus size={18} />
                <span>დამახსოვრება</span>
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowCreateTask(false)}
                aria-label="დახურვა"
              >
                <X size={18} />
              </button>
            </header>

            <form
              id="quick-task-form"
              className="quick-task-form"
              onSubmit={createTask}
            >
              {taskSaveError ? (
                <p className="form-error">{taskSaveError}</p>
              ) : null}
              <label>
                <span>X-Station</span>
                <input
                  list="quick-task-device-options"
                  value={form.deviceQuery}
                  onChange={(event) => {
                    const deviceQuery = event.target.value;
                    const selectedDevice = findDeviceByName(
                      sortedActiveDevices,
                      deviceQuery,
                    );
                    setForm((current) => ({
                      ...current,
                      deviceQuery,
                      deviceId: selectedDevice?.id ?? "",
                    }));
                  }}
                  required
                />
                <datalist id="quick-task-device-options">
                  {sortedActiveDevices.map((device) => (
                    <option key={device.id} value={device.name} />
                  ))}
                </datalist>
              </label>
              <label>
                <span>სათაური</span>
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
              </label>
              <label>
                <span>საკითხი</span>
                <textarea
                  value={form.issue}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      issue: event.target.value,
                    }))
                  }
                  placeholder="რა საკითხის მოსაგვარებლად მიდიან"
                  rows={4}
                  required
                />
              </label>
              <label>
                <span>ტელეფონი</span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="ტელეფონი"
                  inputMode="tel"
                />
              </label>
              <div className="form-row">
                <label>
                  <span>პრიორიტეტი</span>
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
                </label>
                <label>
                  <span>ვადა</span>
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
                </label>
              </div>
              <TaskTagPicker
                availableTags={availableTags}
                selectedTags={form.tags}
                canCreateTags={canCreateTaskTags}
                canDeleteTags={canDeleteTaskTags}
                onToggle={toggleFormTag}
                onCreateTag={createAvailableTag}
                onDeleteTag={removeAvailableTag}
              />
              <div className="assignee-picker">
                {assignableUsers.map((user) => (
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
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function createDefaultDeviceLocations(devices: Device[]) {
  return Object.fromEntries(
    devices.map((device) => [device.id, clampLatLng(device.position)]),
  );
}

function TaskTagList({ tags }: { tags: string[] }) {
  if (!tags.length) {
    return null;
  }

  return (
    <div className="task-tags">
      {tags.map((tagName) => (
        <span key={tagName} className="tag-toggle compact active">
          {tagName}
        </span>
      ))}
    </div>
  );
}

function taskMatchesTags(task: Task, selectedTags: string[]) {
  return (
    selectedTags.length === 0 ||
    selectedTags.every((tagName) => task.tags.includes(tagName))
  );
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function getIssueIndicatorState(task: Pick<Task, "status" | "dueDate">) {
  if (task.status === "done") {
    return "done";
  }

  return task.dueDate < today ? "overdue" : "active";
}

function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat("ka-GE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
