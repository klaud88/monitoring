"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Filter,
  MapPin,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { TaskTagPicker } from "@/components/tasks/task-tag-picker";
import { recordAudit } from "@/lib/client-audit";
import { findDeviceByName, sortDevicesByName } from "@/lib/device-options";
import { withoutDeviceCodes } from "@/lib/display";
import { mergeTags } from "@/lib/tags";
import { getAssignableTaskUsers } from "@/lib/task-assignees";
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
  initialTags: string[];
  initialEditTaskId?: string;
  permissions: TaskPermissions;
};

type TaskPermissions = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  createTags: boolean;
  deleteTags: boolean;
};

type TaskDraft = {
  title: string;
  issue: string;
  comment: string;
  phone: string;
  deviceId: string;
  assigneeIds: string[];
  status: TaskStatus;
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

export function TasksManager({
  initialTasks,
  devices,
  users,
  initialTags,
  initialEditTaskId,
  permissions,
}: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [availableTags, setAvailableTags] = useState(() =>
    mergeTags(
      initialTags,
      initialTasks.flatMap((task) => task.tags),
    ),
  );
  const sortedDevices = useMemo(() => sortDevicesByName(devices), [devices]);
  const assignableUsers = useMemo(
    () => getAssignableTaskUsers(users),
    [users],
  );
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [userFilter, setUserFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TaskDraft | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const initialEditHandledRef = useRef<string | null>(null);
  const [draft, setDraft] = useState(() => ({
    title: "",
    issue: "",
    phone: "",
    deviceId: sortedDevices[0]?.id || "",
    deviceQuery: sortedDevices[0]?.name || "",
    assigneeId: assignableUsers[0]?.id || "",
    priority: "normal" as TaskPriority,
    tags: [] as string[],
    dueDate: new Date().toISOString().slice(0, 10),
  }));

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
      const displayTitle = withoutDeviceCodes(task.title, [device?.code]);
      const displayIssue = withoutDeviceCodes(task.issue, [device?.code]);
      const matchesStatus =
        statusFilter === "all" || task.status === statusFilter;
      const matchesUser =
        userFilter === "all" || task.assigneeIds.includes(userFilter);
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((tagName) => task.tags.includes(tagName));
      const matchesQuery =
        !normalized ||
        displayTitle.toLowerCase().includes(normalized) ||
        displayIssue.toLowerCase().includes(normalized) ||
        device?.name.toLowerCase().includes(normalized);
      return matchesStatus && matchesUser && matchesTags && matchesQuery;
    });
  }, [deviceMap, query, selectedTags, statusFilter, tasks, userFilter]);

  useEffect(() => {
    if (
      !initialEditTaskId ||
      !permissions.edit ||
      initialEditHandledRef.current === initialEditTaskId
    ) {
      return;
    }

    const task = tasks.find((item) => item.id === initialEditTaskId);
    if (!task) {
      return;
    }

    const device = deviceMap.get(task.deviceId);
    setEditingTaskId(task.id);
    setEditDraft(createEditDraft(task, device?.code));
    setStatusFilter("all");
    setUserFilter("all");
    setSelectedTags([]);
    setQuery("");
    setError("");
    initialEditHandledRef.current = initialEditTaskId;

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(`task-${task.id}`)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [deviceMap, initialEditTaskId, permissions.edit, tasks]);

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.create) {
      return;
    }

    if (!draft.deviceId) {
      setError("დავაისი აირჩიეთ ჩამონათვალიდან.");
      return;
    }

    if (!draft.title.trim() || !draft.issue.trim()) {
      return;
    }

    const optimisticTask: Task = {
      id: `task-local-${Date.now()}`,
      title: draft.title.trim(),
      issue: draft.issue.trim(),
      phone: draft.phone.trim(),
      deviceId: draft.deviceId,
      assigneeIds: draft.assigneeId ? [draft.assigneeId] : [],
      status: "planned",
      priority: draft.priority,
      tags: draft.tags,
      dueDate: draft.dueDate,
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [optimisticTask, ...current]);
    setDraft((current) => ({
      ...current,
      title: "",
      issue: "",
      phone: "",
      tags: [],
    }));

    setError("");
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
    } else {
      setError("დავალების დამატება ვერ მოხერხდა.");
    }
  }

  async function changeStatus(taskId: string, status: TaskStatus) {
    if (!permissions.edit) {
      return;
    }

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

  function startEditTask(task: Task) {
    const device = deviceMap.get(task.deviceId);
    setEditingTaskId(task.id);
    setEditDraft(createEditDraft(task, device?.code));
    setError("");
  }

  function toggleDraftTag(tagName: string) {
    setDraft((current) => ({
      ...current,
      tags: toggleListValue(current.tags, tagName),
    }));
  }

  function toggleEditTag(tagName: string) {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            tags: toggleListValue(current.tags, tagName),
          }
        : current,
    );
  }

  function toggleFilterTag(tagName: string) {
    setSelectedTags((current) => toggleListValue(current, tagName));
  }

  async function createAvailableTag(tagName: string) {
    if (!permissions.createTags) {
      return false;
    }

    setError("");
    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    }).catch(() => null);

    if (!response?.ok) {
      setError("ტეგის დამატება ვერ მოხერხდა.");
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
    if (!permissions.deleteTags) {
      return false;
    }

    setError("");
    const response = await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    }).catch(() => null);

    if (!response?.ok) {
      setError("ტეგის წაშლა ვერ მოხერხდა.");
      return false;
    }

    const data = (await response.json()) as { tags?: string[] };
    setAvailableTags((current) =>
      data.tags ?? current.filter((tag) => tag !== tagName),
    );
    setSelectedTags((current) => current.filter((tag) => tag !== tagName));
    setDraft((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag !== tagName),
    }));
    setEditDraft((current) =>
      current
        ? { ...current, tags: current.tags.filter((tag) => tag !== tagName) }
        : current,
    );
    setTasks((current) =>
      current.map((task) => ({
        ...task,
        tags: task.tags.filter((tag) => tag !== tagName),
      })),
    );
    return true;
  }

  function toggleEditAssignee(userId: string) {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            assigneeIds: current.assigneeIds.includes(userId)
              ? current.assigneeIds.filter((id) => id !== userId)
              : [...current.assigneeIds, userId],
          }
        : current,
    );
  }

  async function saveTask(taskId: string) {
    if (!permissions.edit || !editDraft) {
      return;
    }

    const payload = {
      ...editDraft,
      title: editDraft.title.trim(),
      issue: editDraft.issue.trim(),
      comment: editDraft.comment.trim(),
      phone: editDraft.phone.trim(),
    };

    if (!payload.title || !payload.issue || !payload.deviceId || !payload.dueDate) {
      setError("სათაური, საკითხი, X-Station და ვადა აუცილებელია.");
      return;
    }

    const previousTasks = tasks;
    setSavingTaskId(taskId);
    setError("");
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...payload,
            }
          : task,
      ),
    );

    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSavingTaskId(null);

    if (!response?.ok) {
      setTasks(previousTasks);
      setError("დავალების რედაქტირება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { task: Task };
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? data.task : task)),
    );
    setEditingTaskId(null);
    setEditDraft(null);
  }

  async function removeTask(taskId: string) {
    if (!permissions.delete) {
      return;
    }

    const confirmed = window.confirm("წავშალო ეს დავალება?");
    if (!confirmed) {
      return;
    }

    setSavingTaskId(taskId);
    setError("");
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE",
    }).catch(() => null);
    setSavingTaskId(null);

    if (!response?.ok) {
      setError("დავალების წაშლა ვერ მოხერხდა.");
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
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

      {error ? <p className="form-error page-error">{error}</p> : null}

      <section className="content-grid task-admin-grid">
        {permissions.create ? (
          <form className="surface admin-form" onSubmit={createTask}>
            <div className="section-title">
              <h2>ახალი ტასკი</h2>
              <Plus size={20} />
            </div>
            <label>
              <span>დავაისი</span>
              <input
                list="new-task-device-options"
                value={draft.deviceQuery}
                onChange={(event) => {
                  const deviceQuery = event.target.value;
                  const selectedDevice = findDeviceByName(
                    sortedDevices,
                    deviceQuery,
                  );
                  setDraft((current) => ({
                    ...current,
                    deviceQuery,
                    deviceId: selectedDevice?.id ?? "",
                  }));
                }}
                required
              />
              <datalist id="new-task-device-options">
                {sortedDevices.map((device) => (
                  <option key={device.id} value={device.name} />
                ))}
              </datalist>
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
              <span>ტელეფონი</span>
              <input
                value={draft.phone}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                inputMode="tel"
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
                {assignableUsers.map((user) => (
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
            <TaskTagPicker
              availableTags={availableTags}
              selectedTags={draft.tags}
              canCreateTags={permissions.createTags}
              canDeleteTags={permissions.deleteTags}
              onToggle={toggleDraftTag}
              onCreateTag={createAvailableTag}
              onDeleteTag={removeAvailableTag}
            />
            <button className="primary-button" type="submit">
              <Plus size={18} />
              <span>დამატება</span>
            </button>
          </form>
        ) : (
          <section className="surface empty-state">დამატების უფლება არ გაქვთ.</section>
        )}

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
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <section className="tag-filter task-tag-filter" aria-label="დავალების ტეგები">
            {availableTags.map((tagName) => (
              <button
                key={tagName}
                className={`tag-toggle ${selectedTags.includes(tagName) ? "active" : ""}`}
                type="button"
                onClick={() => toggleFilterTag(tagName)}
              >
                <Tag size={14} />
                <span>{tagName}</span>
              </button>
            ))}
          </section>

          <div className="task-table">
            <div className="task-table-head">
              <span />
              <span>დავაისი</span>
              <span>ტასკი</span>
              <span>ტელეფონი</span>
              <span>მომხმარებლები</span>
              <span>სტატუსი</span>
              <span>ვადა</span>
              <span>მოქმედება</span>
            </div>
            {filteredTasks.map((task) => {
              const device = deviceMap.get(task.deviceId);
              const displayTitle = withoutDeviceCodes(task.title, [device?.code]);
              const displayIssue = withoutDeviceCodes(task.issue, [device?.code]);
              return editingTaskId === task.id && editDraft ? (
                <article
                  key={task.id}
                  id={`task-${task.id}`}
                  className="task-table-row editing"
                >
                  <div className="task-edit-grid">
                    <label>
                      <span>X-Station</span>
                      <select
                        value={editDraft.deviceId}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current
                              ? { ...current, deviceId: event.target.value }
                              : current,
                          )
                        }
                      >
                        {sortedDevices.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>სათაური</span>
                      <input
                        value={editDraft.title}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current
                              ? { ...current, title: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>სტატუსი</span>
                      <select
                        value={editDraft.status}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  status: event.target.value as TaskStatus,
                                }
                              : current,
                          )
                        }
                      >
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>პრიორიტეტი</span>
                      <select
                        value={editDraft.priority}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  priority: event.target.value as TaskPriority,
                                }
                              : current,
                          )
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
                        value={editDraft.dueDate}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current
                              ? { ...current, dueDate: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>ტელეფონი</span>
                      <input
                        value={editDraft.phone}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current
                              ? { ...current, phone: event.target.value }
                              : current,
                          )
                        }
                        inputMode="tel"
                      />
                    </label>
                    <label className="task-edit-issue">
                      <span>საკითხი</span>
                      <textarea
                        value={editDraft.issue}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current
                              ? { ...current, issue: event.target.value }
                              : current,
                          )
                        }
                        rows={3}
                      />
                    </label>
                    <label className="task-edit-comment">
                      <span>კომენტარი</span>
                      <textarea
                        className="task-comment-textarea"
                        value={editDraft.comment}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current
                              ? { ...current, comment: event.target.value }
                              : current,
                          )
                        }
                        rows={3}
                      />
                    </label>
                    <div className="task-assignee-edit">
                      <span>მომხმარებლები</span>
                      <div className="row-tags">
                        {assignableUsers.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            className={`tag-toggle compact ${editDraft.assigneeIds.includes(user.id) ? "active" : ""}`}
                            onClick={() => toggleEditAssignee(user.id)}
                          >
                            {user.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <TaskTagPicker
                      className="task-assignee-edit"
                      availableTags={availableTags}
                      selectedTags={editDraft.tags}
                      canCreateTags={permissions.createTags}
                      canDeleteTags={permissions.deleteTags}
                      onToggle={toggleEditTag}
                      onCreateTag={createAvailableTag}
                      onDeleteTag={removeAvailableTag}
                    />
                  </div>
                  <div className="row-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => saveTask(task.id)}
                      disabled={savingTaskId === task.id}
                    >
                      <Save size={16} />
                      <span>შენახვა</span>
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setEditingTaskId(null);
                        setEditDraft(null);
                      }}
                    >
                      <X size={16} />
                      <span>გაუქმება</span>
                    </button>
                  </div>
                </article>
              ) : (
                <article
                  key={task.id}
                  id={`task-${task.id}`}
                  className="task-table-row"
                >
                  <span
                    className={
                      task.problemReportId
                        ? `issue-indicator ${getIssueIndicatorState(task)}`
                        : "issue-indicator empty"
                    }
                    aria-label="პრობლემის ინდიკატორი"
                  />
                  <Link
                    className="task-device-cell clickable-cell"
                    href={`/devices/${device?.id ?? task.deviceId}`}
                  >
                    <span className="device-name-inline">
                      <MapPin size={15} />
                      {device?.name || "დავაისი ვერ მოიძებნა"}
                    </span>
                  </Link>
                  <Link
                    className="task-summary-cell clickable-cell"
                    href={`/tasks/${task.id}`}
                  >
                    <strong className="table-title-link">{displayTitle}</strong>
                    <p>{displayIssue}</p>
                    {task.comment ? (
                      <p className="task-comment-text">{task.comment}</p>
                    ) : null}
                    <TaskTagList tags={task.tags} />
                    <small className={`priority-label ${task.priority}`}>
                      {priorityLabels[task.priority]}
                    </small>
                  </Link>
                  <span className="phone-inline task-phone-cell">
                    {task.phone || "—"}
                  </span>
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
                      disabled={!permissions.edit}
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
                  <div className="row-actions task-row-actions">
                    {permissions.edit ? (
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => startEditTask(task)}
                        aria-label="დავალების რედაქტირება"
                        title="დავალების რედაქტირება"
                      >
                        <Edit3 size={16} />
                      </button>
                    ) : null}
                    {permissions.delete ? (
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => removeTask(task.id)}
                        disabled={savingTaskId === task.id}
                        aria-label="დავალების წაშლა"
                        title="დავალების წაშლა"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
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

function createEditDraft(task: Task, deviceCode?: string): TaskDraft {
  return {
    title: withoutDeviceCodes(task.title, [deviceCode]),
    issue: withoutDeviceCodes(task.issue, [deviceCode]),
    comment: task.comment ?? "",
    phone: task.phone ?? "",
    deviceId: task.deviceId,
    assigneeIds: task.assigneeIds,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    dueDate: task.dueDate,
  };
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

  return task.dueDate < new Date().toISOString().slice(0, 10)
    ? "overdue"
    : "active";
}
