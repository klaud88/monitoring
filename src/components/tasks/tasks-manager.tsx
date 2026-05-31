"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Filter,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { recordAudit } from "@/lib/client-audit";
import type {
  AppUser,
  Device,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

type Props = {
  initialTasks: Task[];
  devices: Device[];
  users: AppUser[];
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

export function TasksManager({ initialTasks, devices, users }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [userFilter, setUserFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    issue: "",
    deviceId: devices[0]?.id || "",
    assigneeId:
      users.find((user) => user.role !== "viewer")?.id || users[0]?.id || "",
    priority: "normal" as TaskPriority,
    dueDate: new Date().toISOString().slice(0, 10),
  });

  const deviceMap = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );
  const userMap = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const device = deviceMap.get(task.deviceId);
      const matchesStatus =
        statusFilter === "all" || task.status === statusFilter;
      const matchesUser =
        userFilter === "all" || task.assigneeIds.includes(userFilter);
      const matchesQuery =
        !normalized ||
        task.title.toLowerCase().includes(normalized) ||
        task.issue.toLowerCase().includes(normalized) ||
        device?.code.toLowerCase().includes(normalized);
      return matchesStatus && matchesUser && matchesQuery;
    });
  }, [deviceMap, query, statusFilter, tasks, userFilter]);

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.issue.trim()) {
      return;
    }

    const optimisticTask: Task = {
      id: `task-local-${Date.now()}`,
      title: draft.title.trim(),
      issue: draft.issue.trim(),
      deviceId: draft.deviceId,
      assigneeIds: draft.assigneeId ? [draft.assigneeId] : [],
      status: "planned",
      priority: draft.priority,
      dueDate: draft.dueDate,
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [optimisticTask, ...current]);
    setDraft((current) => ({ ...current, title: "", issue: "" }));

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

  async function changeStatus(taskId: string, status: TaskStatus) {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    );
    recordAudit("task.status_local_change", "task", taskId, { status });

    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
  }

  return (
    <div className="tasks-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">ტასკების მართვა</p>
          <h1>დავალებები და ვიზიტები</h1>
          <p>ტასკები მიამაგრეთ კონკრეტულ მომხმარებელზე და BioStar2 დავაისზე.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <ClipboardList size={18} />
            <span>{tasks.length}</span>
            <small>სულ</small>
          </div>
          <div className="metric">
            <CheckCircle2 size={18} />
            <span>{tasks.filter((task) => task.status === "done").length}</span>
            <small>დასრულდა</small>
          </div>
        </div>
      </section>

      <section className="content-grid task-admin-grid">
        <form className="surface admin-form" onSubmit={createTask}>
          <div className="section-title">
            <h2>ახალი ტასკი</h2>
            <Plus size={20} />
          </div>
          <label>
            <span>დავაისი</span>
            <select
              value={draft.deviceId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  deviceId: event.target.value,
                }))
              }
            >
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.code} · {device.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>სათაური</span>
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            <span>საკითხი</span>
            <textarea
              value={draft.issue}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  issue: event.target.value,
                }))
              }
              rows={4}
              required
            />
          </label>
          <label>
            <span>მომხმარებელი</span>
            <select
              value={draft.assigneeId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  assigneeId: event.target.value,
                }))
              }
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              <span>პრიორიტეტი</span>
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
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
                value={draft.dueDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            <span>დამატება</span>
          </button>
        </form>

        <div className="surface task-admin-list">
          <div className="table-toolbar">
            <div className="search-field">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ძებნა"
              />
            </div>
            <label className="select-control">
              <Filter size={17} />
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as TaskStatus | "all")
                }
              >
                <option value="all">ყველა სტატუსი</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-control">
              <UserRound size={17} />
              <select
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
              >
                <option value="all">ყველა მომხმარებელი</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="task-table">
            <div className="task-table-head">
              <span>დავაისი</span>
              <span>ტასკი</span>
              <span>მომხმარებლები</span>
              <span>სტატუსი</span>
              <span>ვადა</span>
            </div>
            {filteredTasks.map((task) => {
              const device = deviceMap.get(task.deviceId);
              return (
                <article key={task.id} className="task-table-row">
                  <Link
                    className="task-device-cell clickable-cell"
                    href={`/devices/${device?.id ?? task.deviceId}`}
                  >
                    <span className="device-code-inline">
                      <MapPin size={15} />
                      {device?.code || task.deviceId}
                    </span>
                    <strong>{device?.name || "დავაისი ვერ მოიძებნა"}</strong>
                  </Link>
                  <Link
                    className="task-summary-cell clickable-cell"
                    href={`/tasks/${task.id}`}
                  >
                    <strong className="table-title-link">{task.title}</strong>
                    <p>{task.issue}</p>
                    <small className={`priority-label ${task.priority}`}>
                      {priorityLabels[task.priority]}
                    </small>
                  </Link>
                  <span className="avatar-stack">
                    {task.assigneeIds.map((userId) => {
                      const user = userMap.get(userId);
                      return user ? (
                        <span
                          key={user.id}
                          className="avatar small"
                          style={{ backgroundColor: user.color }}
                          title={user.name}
                        >
                          {user.initials}
                        </span>
                      ) : null;
                    })}
                  </span>
                  <label className="inline-select">
                    <SlidersHorizontal size={15} />
                    <select
                      value={task.status}
                      onChange={(event) =>
                        changeStatus(task.id, event.target.value as TaskStatus)
                      }
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>
                    <CalendarDays size={15} />
                    {task.dueDate}
                  </span>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
