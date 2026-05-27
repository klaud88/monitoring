"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ExternalLink,
  Filter,
  MapPin,
  Move,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { recordAudit } from "@/lib/client-audit";
import { regions, tagCatalog } from "@/lib/mock-data";
import { mergeTags, TAG_STORAGE_KEY } from "@/lib/tags";
import type { AppUser, Device, Task, TaskPriority, TaskStatus } from "@/lib/types";

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
  done: "დასრულებული"
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "დაბალი",
  normal: "ჩვეულებრივი",
  high: "მაღალი",
  urgent: "სასწრაფო"
};

const today = new Date().toISOString().slice(0, 10);
const DEVICE_POSITIONS_KEY = "biostar_device_positions";

export function Dashboard({ initialDevices, initialTasks, users }: DashboardProps) {
  const [devices, setDevices] = useState(initialDevices);
  const [tasks, setTasks] = useState(initialTasks);
  const [regionFilter, setRegionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [availableTags, setAvailableTags] = useState<string[]>(() =>
    mergeTags([...tagCatalog], initialDevices.flatMap((device) => device.tags))
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
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
    dueDate: today
  });

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const deviceMap = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices]);

  useEffect(() => {
    const storedTags = JSON.parse(window.localStorage.getItem(TAG_STORAGE_KEY) || "[]");
    if (Array.isArray(storedTags)) {
      setAvailableTags((current) => mergeTags(current, storedTags.map(String)));
    }
  }, []);

  useEffect(() => {
    const storedPositions = JSON.parse(window.localStorage.getItem(DEVICE_POSITIONS_KEY) || "{}");
    if (storedPositions && typeof storedPositions === "object") {
      setDevices((current) =>
        current.map((device) => {
          const position = storedPositions[device.id];
          return isValidPosition(position) ? { ...device, position } : device;
        })
      );
    }
  }, []);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done"),
    [tasks]
  );
  const recentTasks = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 7),
    [tasks]
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
      const matchesRegion = regionFilter === "all" || device.region === regionFilter;
      const matchesUser =
        userFilter === "all" || deviceTasks.some((task) => task.assigneeIds.includes(userFilter));
      const matchesTags =
        selectedTags.length === 0 || selectedTags.every((tagName) => device.tags.includes(tagName));
      const matchesQuery =
        !normalized ||
        device.code.toLowerCase().includes(normalized) ||
        device.name.toLowerCase().includes(normalized);

      return matchesRegion && matchesUser && matchesTags && matchesQuery;
    });
  }, [devices, query, regionFilter, selectedTags, tasksByDevice, userFilter]);

  const offlineCount = devices.filter((device) => device.status === "offline").length;
  const plannedVisitCount = activeTasks.filter((task) => task.assigneeIds.length > 0).length;

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
        : [...current.assigneeIds, userId]
    }));
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim() || !form.issue.trim() || !form.deviceId || !form.assigneeIds.length) {
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
      createdAt: new Date().toISOString()
    };

    setTasks((current) => [optimisticTask, ...current]);
    setForm({
      title: "",
      issue: "",
      deviceId: form.deviceId,
      assigneeIds: form.assigneeIds,
      priority: "normal",
      dueDate: today
    });
    setShowCreateTask(false);

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(optimisticTask)
    }).catch(() => null);

    if (response?.ok) {
      const payload = await response.json();
      setTasks((current) =>
        current.map((task) => (task.id === optimisticTask.id ? payload.task : task))
      );
    }
  }

  function showAssignment(deviceId: string, taskId: string, userId: string) {
    setActiveAssignment({ deviceId, taskId, userId });
    recordAudit("dashboard.assignment_open", "task", taskId, { deviceId, userId });
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

  function updateDevicePosition(deviceId: string, position: Device["position"]) {
    setDevices((current) => {
      const nextDevices = current.map((device) =>
        device.id === deviceId
          ? {
              ...device,
              position: {
                x: Math.round(position.x * 10) / 10,
                y: Math.round(position.y * 10) / 10
              }
            }
          : device
      );
      const storedPositions = Object.fromEntries(
        nextDevices.map((device) => [device.id, device.position])
      );
      window.localStorage.setItem(DEVICE_POSITIONS_KEY, JSON.stringify(storedPositions));
      return nextDevices;
    });
  }

  return (
    <div className="dashboard-page">
      <section className="page-header compact">
        <div>
          <p className="eyebrow">თბილისის რუკა</p>
          <h1>BioStar2 დავაისების სტატუსები</h1>
          <p>დავაისები, დაგეგმილი ვიზიტები და მიმდინარე ტასკები ერთ ხედში.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <WifiOff size={18} />
            <span>{offlineCount}</span>
            <small>offline</small>
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
          <select value={regionFilter} onChange={(event) => updateRegionFilter(event.target.value)}>
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
          <select value={userFilter} onChange={(event) => updateUserFilter(event.target.value)}>
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
          <div className="map-canvas">
            <StaticTbilisiMap />
            <div className="map-mode-badge">
              {editingDeviceId ? (
                <>
                  <Move size={15} />
                  <span>ლოკაციის ედიტი ჩართულია</span>
                </>
              ) : (
                <span>თბილისის სტატიკური რუკა</span>
              )}
            </div>
            {visibleDevices.map((device) => (
              <DeviceMarker
                key={device.id}
                device={device}
                tasks={tasksByDevice.get(device.id) ?? []}
                userMap={userMap}
                activeAssignment={activeAssignment}
                isSelected={selectedDeviceId === device.id}
                isEditing={editingDeviceId === device.id}
                onSelect={selectDevice}
                onCloseDevice={() => {
                  setSelectedDeviceId(null);
                  setEditingDeviceId(null);
                }}
                onStartEdit={startDeviceEdit}
                onStopEdit={stopDeviceEdit}
                onMove={updateDevicePosition}
                onShowAssignment={showAssignment}
                onCloseAssignment={() => setActiveAssignment(null)}
              />
            ))}
          </div>
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
                onChange={(event) => setForm((current) => ({ ...current, deviceId: event.target.value }))}
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
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="ტასკის სათაური"
                required
              />
              <textarea
                value={form.issue}
                onChange={(event) => setForm((current) => ({ ...current, issue: event.target.value }))}
                placeholder="რა საკითხის მოსაგვარებლად მიდიან"
                rows={3}
                required
              />
              <div className="form-row">
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))
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
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
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
                      <span style={{ backgroundColor: user.color }}>{user.initials}</span>
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
                    <span className={`status-pill ${task.status}`}>{statusLabels[task.status]}</span>
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

function DeviceMarker({
  device,
  tasks,
  userMap,
  activeAssignment,
  isSelected,
  isEditing,
  onSelect,
  onCloseDevice,
  onStartEdit,
  onStopEdit,
  onMove,
  onShowAssignment,
  onCloseAssignment
}: {
  device: Device;
  tasks: Task[];
  userMap: Map<string, AppUser>;
  activeAssignment: { deviceId: string; taskId: string; userId: string } | null;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: (deviceId: string) => void;
  onCloseDevice: () => void;
  onStartEdit: (deviceId: string) => void;
  onStopEdit: (deviceId: string) => void;
  onMove: (deviceId: string, position: Device["position"]) => void;
  onShowAssignment: (deviceId: string, taskId: string, userId: string) => void;
  onCloseAssignment: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const assignments = tasks.flatMap((task) =>
    task.assigneeIds.map((userId) => ({
      task,
      user: userMap.get(userId)
    }))
  );
  const activeTask = activeAssignment
    ? assignments.find(
        (assignment) =>
          assignment.task.id === activeAssignment.taskId &&
          assignment.user?.id === activeAssignment.userId
      )
    : null;

  function moveDevice(event: React.PointerEvent<HTMLDivElement>) {
    const map = event.currentTarget.parentElement;
    if (!map) {
      return;
    }

    const rect = map.getBoundingClientRect();
    onMove(device.id, {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100)
    });
  }

  return (
    <div
      className={`device-marker ${device.status} ${isSelected ? "selected" : ""} ${isEditing ? "editing" : ""}`}
      style={{ left: `${device.position.x}%`, top: `${device.position.y}%` }}
      onPointerDown={(event) => {
        if (!isEditing) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        moveDevice(event);
      }}
      onPointerMove={(event) => {
        if (isEditing && dragging) {
          event.preventDefault();
          moveDevice(event);
        }
      }}
      onPointerUp={(event) => {
        if (!isEditing) {
          return;
        }

        setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      {assignments.length ? (
        <div className="assignment-ring" aria-label="დაგეგმილი მომხმარებლები">
          {assignments.map(({ task, user }) =>
            user ? (
              <button
                key={`${task.id}-${user.id}`}
                type="button"
                className="avatar"
                style={{ backgroundColor: user.color }}
                onClick={(event) => {
                  event.preventDefault();
                  onShowAssignment(device.id, task.id, user.id);
                }}
                title={`${user.name} · ${task.title}`}
              >
                {user.initials}
              </button>
            ) : null
          )}
        </div>
      ) : null}

      <button
        className="pin-shell"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(device.id);
        }}
      >
        {device.status === "online" ? <Wifi size={16} /> : <WifiOff size={16} />}
        <span className="device-code">{device.code}</span>
      </button>
      <span className="device-name">{device.name}</span>

      {isSelected ? (
        <div className="device-popover">
          <button type="button" onClick={onCloseDevice} aria-label="დახურვა">
            ×
          </button>
          <strong>{device.code}</strong>
          <span>{device.name}</span>
          <span className="device-region">რეგიონი: {device.region}</span>
          <small>
            X {device.position.x.toFixed(1)}% · Y {device.position.y.toFixed(1)}%
          </small>
          <div className="popover-actions">
            <Link href={`/devices/${device.id}`}>
              <ExternalLink size={15} />
              <span>დეტალურად</span>
            </Link>
            {isEditing ? (
              <button type="button" onClick={() => onStopEdit(device.id)}>
                <Check size={15} />
                <span>დასრულება</span>
              </button>
            ) : (
              <button type="button" onClick={() => onStartEdit(device.id)}>
                <Pencil size={15} />
                <span>ედიტი</span>
              </button>
            )}
          </div>
          {isEditing ? <p>გადაათრიეთ პინი ახალ ადგილზე.</p> : null}
        </div>
      ) : null}

      {activeTask ? (
        <div className="assignment-popover">
          <button type="button" onClick={onCloseAssignment} aria-label="დახურვა">
            ×
          </button>
          <strong>{activeTask.user?.name}</strong>
          <span>{activeTask.task.title}</span>
          <p>{activeTask.task.issue}</p>
        </div>
      ) : null}
    </div>
  );
}

function isValidPosition(value: unknown): value is Device["position"] {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Device["position"]).x === "number" &&
    typeof (value as Device["position"]).y === "number"
  );
}

function clamp(value: number) {
  return Math.max(3, Math.min(97, value));
}

function StaticTbilisiMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapImageUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
        "Tbilisi, Georgia"
      )}&zoom=11&size=640x460&scale=2&maptype=roadmap&format=png&key=${apiKey}`
    : "";

  if (!mapImageUrl) {
    return (
      <div className="static-map-fallback" aria-hidden="true">
        <span>TBILISI</span>
      </div>
    );
  }

  return (
    <div
      className="static-map-image"
      role="img"
      aria-label="თბილისის სტატიკური რუკა"
      style={{ backgroundImage: `url("${mapImageUrl}")` }}
    />
  );
}
