"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Edit3,
  Filter,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
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

type ViewMode = "lanes" | "columns" | "list";

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

const statusOrder: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];
const viewStorageKey = "bagebi-tasks-view";

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
  const [viewMode, setViewMode] = useState<ViewMode>("lanes");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [userFilter, setUserFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TaskDraft | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();
  const initialEditHandledRef = useRef<string | null>(null);
  const [draft, setDraft] = useState(() => ({
    title: "",
    issue: "",
    phone: "",
    deviceId: sortedDevices[0]?.id || "",
    deviceQuery: sortedDevices[0]?.name || "",
    assigneeIds: [] as string[],
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

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      planned: [],
      in_progress: [],
      blocked: [],
      done: [],
    };
    for (const task of filteredTasks) {
      groups[task.status].push(task);
    }
    return groups;
  }, [filteredTasks]);

  const doneCount = tasks.filter((task) => task.status === "done").length;
  const activeCount = tasks.filter(
    (task) => task.status === "planned" || task.status === "in_progress",
  ).length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;

  const editorMode: "create" | "edit" | null = createOpen
    ? "create"
    : editingTaskId && editDraft
      ? "edit"
      : null;
  const editorRef = useRef<HTMLElement>(null);

  /** Collapsing never discards the draft — only a saved task clears the fields. */
  const closeEditor = useCallback(() => {
    setCreateOpen(false);
    setEditingTaskId(null);
    setEditDraft(null);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(viewStorageKey);
      if (stored === "lanes" || stored === "columns" || stored === "list") {
        setViewMode(stored);
      }
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
  }, []);

  useEffect(() => {
    if (!editorMode) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editorMode, editingTaskId]);

  function changeView(next: ViewMode) {
    setViewMode(next);
    try {
      window.localStorage.setItem(viewStorageKey, next);
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
  }

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
    setCreateOpen(false);
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
      assigneeIds: draft.assigneeIds,
      status: "planned",
      priority: draft.priority,
      tags: draft.tags,
      dueDate: draft.dueDate,
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [optimisticTask, ...current]);
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
      // Fields are cleared only once the task is actually stored.
      setDraft((current) => ({
        ...current,
        title: "",
        issue: "",
        phone: "",
        assigneeIds: [],
        tags: [],
      }));
      setCreateOpen(false);
    } else {
      setTasks((current) =>
        current.filter((task) => task.id !== optimisticTask.id),
      );
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
    setCreateOpen(false);
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

    const confirmed = await confirm();
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

  const visibleStatuses = statusOrder.filter(
    (status) => statusFilter === "all" || status === statusFilter,
  );

  const rowProps = {
    deviceMap,
    userMap,
    permissions,
    savingTaskId,
    onChangeStatus: changeStatus,
    onEdit: startEditTask,
    onDelete: removeTask,
  };

  return (
    <div className="tasks-page">
      {confirmationDialog}

      <section className="tasks-head">
        <div>
          <h1>დავალებები და ვიზიტები</h1>
          <p>
            {tasks.length} ტასკი · {activeCount} აქტიური · {blockedCount}{" "}
            შეჩერებული · {doneCount} დასრულებული
          </p>
        </div>
        <div className="tasks-head-actions">
          <div className="view-switch" role="group" aria-label="ჩვენების რეჟიმი">
            <button
              type="button"
              className={viewMode === "lanes" ? "active" : ""}
              onClick={() => changeView("lanes")}
              aria-pressed={viewMode === "lanes"}
            >
              <AlignJustify size={14} strokeWidth={1.8} />
              <span>ზოლები</span>
            </button>
            <button
              type="button"
              className={viewMode === "columns" ? "active" : ""}
              onClick={() => changeView("columns")}
              aria-pressed={viewMode === "columns"}
            >
              <LayoutGrid size={14} strokeWidth={1.8} />
              <span>სვეტები</span>
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              onClick={() => changeView("list")}
              aria-pressed={viewMode === "list"}
            >
              <List size={14} strokeWidth={1.8} />
              <span>ერთი სია</span>
            </button>
          </div>
          {permissions.create ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditingTaskId(null);
                setEditDraft(null);
                setCreateOpen(true);
              }}
            >
              <Plus size={17} />
              <span>ახალი ტასკი</span>
            </button>
          ) : null}
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      <section className="tasks-toolbar" aria-label="ფილტრები">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ძებნა"
          />
        </div>
        <label className="select-control">
          <Filter size={16} />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as TaskStatus | "all")
            }
          >
            <option value="all">ყველა სტატუსი</option>
            {statusOrder.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="select-control">
          <UserRound size={16} />
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
        {availableTags.length ? (
          <>
            <span className="tasks-toolbar-divider" />
            {availableTags.map((tagName) => (
              <button
                key={tagName}
                className={`tag-toggle compact ${selectedTags.includes(tagName) ? "active" : ""}`}
                type="button"
                onClick={() => toggleFilterTag(tagName)}
              >
                <Tag size={13} />
                <span>{tagName}</span>
              </button>
            ))}
          </>
        ) : null}
      </section>

      {editorMode ? (
        <section
          className="task-editor"
          ref={editorRef}
          aria-label={editorMode === "create" ? "ახალი ტასკი" : "ტასკის რედაქტირება"}
        >
          <header className="task-editor-head">
            <div>
              <h2>
                {editorMode === "create" ? "ახალი ტასკი" : "ტასკის რედაქტირება"}
              </h2>
              <p>
                {editorMode === "create"
                  ? "დაკეცვისას ჩაწერილი რჩება — ველები მხოლოდ შენახვის შემდეგ სუფთავდება."
                  : "ცვლილება ძალაში შედის შენახვის შემდეგ."}
              </p>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={closeEditor}
              aria-label="დაკეცვა"
              title="დაკეცვა"
            >
              <ChevronUp size={17} />
            </button>
          </header>

          {editorMode === "create" ? (
            <form
              className="task-editor-body"
              id="task-create-form"
              onSubmit={createTask}
            >
              <label className="task-field span-2">
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
              <label className="task-field span-2">
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
              <label className="task-field">
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
              <label className="task-field">
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
              <label className="task-field span-2">
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
              <label className="task-field span-full">
                <span>საკითხი</span>
                <textarea
                  value={draft.issue}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      issue: event.target.value,
                    }))
                  }
                  rows={3}
                  required
                />
              </label>
              <div className="task-field span-full">
                <span>მომხმარებლები</span>
                <div className="row-tags">
                  {assignableUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={`tag-toggle compact ${draft.assigneeIds.includes(user.id) ? "active" : ""}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          assigneeIds: current.assigneeIds.includes(user.id)
                            ? current.assigneeIds.filter((id) => id !== user.id)
                            : [...current.assigneeIds, user.id],
                        }))
                      }
                    >
                      {user.name}
                    </button>
                  ))}
                </div>
              </div>
              <TaskTagPicker
                className="task-field span-full"
                availableTags={availableTags}
                selectedTags={draft.tags}
                canCreateTags={permissions.createTags}
                canDeleteTags={permissions.deleteTags}
                onToggle={toggleDraftTag}
                onCreateTag={createAvailableTag}
                onDeleteTag={removeAvailableTag}
              />
            </form>
          ) : editDraft ? (
            <div className="task-editor-body">
              <label className="task-field span-2">
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
              <label className="task-field span-2">
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
              <label className="task-field">
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
                  {statusOrder.map((value) => (
                    <option key={value} value={value}>
                      {statusLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-field">
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
              <label className="task-field">
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
              <label className="task-field">
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
              <label className="task-field span-2">
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
              <label className="task-field span-2">
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
              <div className="task-field span-full">
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
                className="task-field span-full"
                availableTags={availableTags}
                selectedTags={editDraft.tags}
                canCreateTags={permissions.createTags}
                canDeleteTags={permissions.deleteTags}
                onToggle={toggleEditTag}
                onCreateTag={createAvailableTag}
                onDeleteTag={removeAvailableTag}
              />
            </div>
          ) : null}

          <div className="task-editor-foot">
            {editorMode === "create" ? (
              <button
                className="primary-button"
                type="submit"
                form="task-create-form"
              >
                <Plus size={17} />
                <span>დამატება</span>
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => editingTaskId && saveTask(editingTaskId)}
                disabled={savingTaskId === editingTaskId}
              >
                <Save size={17} />
                <span>შენახვა</span>
              </button>
            )}
            <button className="ghost-button" type="button" onClick={closeEditor}>
              <X size={16} />
              <span>დაკეცვა</span>
            </button>
          </div>
        </section>
      ) : null}

      {viewMode === "columns" ? (
        <div className="task-columns">
          {visibleStatuses.map((status) => (
            <div
              key={status}
              className={`task-column${status === "blocked" ? " danger" : ""}`}
            >
              <div className="task-column-head">
                <span className={`status-dot ${status}`} />
                <h2>{statusLabels[status]}</h2>
                <span className={`task-module-count ${status}`}>
                  {groupedTasks[status].length}
                </span>
              </div>
              {groupedTasks[status].length ? (
                groupedTasks[status].map((task) => (
                  <TaskCard key={task.id} task={task} {...rowProps} />
                ))
              ) : (
                <p className="task-module-empty">ტასკი არ არის.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="task-scroll">
          <div className="task-scroll-inner">
          <div className="task-grid task-grid-head" aria-hidden="true">
            <span />
            <span>ბაღი</span>
            <span>პრიორიტეტი</span>
            <span>სათაური</span>
            <span>კომენტარი</span>
            <span>ტეგები</span>
            <span>ტელ.</span>
            <span>შემსრ.</span>
            <span>სტატუსი</span>
            <span>ვადა</span>
            <span />
          </div>

          {viewMode === "lanes" ? (
            <div className="task-modules">
              {visibleStatuses.map((status) => (
                <section
                  key={status}
                  className={`task-module${status === "blocked" ? " danger" : ""}`}
                  aria-label={statusLabels[status]}
                >
                  <div className="task-module-head">
                    <span className={`status-dot ${status}`} />
                    <h2>{statusLabels[status]}</h2>
                    <span className={`task-module-count ${status}`}>
                      {groupedTasks[status].length}
                    </span>
                  </div>
                  <div className="task-module-body">
                    {groupedTasks[status].length ? (
                      groupedTasks[status].map((task) => (
                        <TaskRow key={task.id} task={task} {...rowProps} />
                      ))
                    ) : (
                      <p className="task-module-empty">ტასკი არ არის.</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <section className="task-module" aria-label="ყველა ტასკი">
              <div className="task-module-body task-list-panel-body">
                {filteredTasks.length ? (
                  filteredTasks.map((task) => (
                    <TaskRow key={task.id} task={task} {...rowProps} />
                  ))
                ) : (
                  <p className="task-module-empty">ტასკი ვერ მოიძებნა.</p>
                )}
              </div>
            </section>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

type RowProps = {
  task: Task;
  deviceMap: Map<string, Device>;
  userMap: Map<string, AppUser>;
  permissions: TaskPermissions;
  savingTaskId: string | null;
  onChangeStatus: (taskId: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
};

function TaskRow({
  task,
  deviceMap,
  userMap,
  permissions,
  savingTaskId,
  onChangeStatus,
  onEdit,
  onDelete,
}: RowProps) {
  const device = deviceMap.get(task.deviceId);
  const displayTitle = withoutDeviceCodes(task.title, [device?.code]);
  const displayIssue = withoutDeviceCodes(task.issue, [device?.code]);
  const overdue = isOverdue(task);

  return (
    <article
      id={`task-${task.id}`}
      className={`task-grid task-row${overdue ? " urgent" : ""}${task.status === "done" ? " muted" : ""}`}
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
        className="task-row-device"
        href={`/devices/${device?.id ?? task.deviceId}`}
        title={device?.name}
      >
        <MapPin size={14} />
        {device?.name || "ბაღი ვერ მოიძებნა"}
      </Link>
      <span className="task-row-priority">
        <span className={`mini-pill p-${task.priority}`}>
          {priorityLabels[task.priority]}
        </span>
      </span>
      <Link className="task-row-summary" href={`/tasks/${task.id}`}>
        <span className="task-row-title" title={displayTitle}>
          {displayTitle}
        </span>
        <span className="task-row-sub" title={displayIssue}>
          {displayIssue}
        </span>
      </Link>
      <span
        className={`task-row-comment${task.comment ? "" : " empty"}`}
        title={task.comment || undefined}
      >
        {task.comment || "—"}
      </span>
      <TagCell tags={task.tags} />
      <span className="task-row-phone">{task.phone || "—"}</span>
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
      <StatusPill
        task={task}
        canEdit={permissions.edit}
        onChangeStatus={onChangeStatus}
      />
      <span className={`task-row-due${overdue ? " overdue" : ""}`}>
        {task.dueDate}
      </span>
      <div className="task-row-actions">
        {permissions.edit ? (
          <button
            className="icon-button"
            type="button"
            onClick={() => onEdit(task)}
            aria-label="დავალების რედაქტირება"
            title="დავალების რედაქტირება"
          >
            <Edit3 size={15} />
          </button>
        ) : null}
        {permissions.delete ? (
          <button
            className="icon-button danger"
            type="button"
            onClick={() => onDelete(task.id)}
            disabled={savingTaskId === task.id}
            aria-label="დავალების წაშლა"
            title="დავალების წაშლა"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TaskCard({
  task,
  deviceMap,
  userMap,
  permissions,
  savingTaskId,
  onChangeStatus,
  onEdit,
  onDelete,
}: RowProps) {
  const device = deviceMap.get(task.deviceId);
  const displayTitle = withoutDeviceCodes(task.title, [device?.code]);
  const displayIssue = withoutDeviceCodes(task.issue, [device?.code]);
  const overdue = isOverdue(task);

  return (
    <article
      id={`task-${task.id}`}
      className={`task-card2${overdue ? " urgent" : ""}${task.status === "done" ? " muted" : ""}`}
    >
      <TaskChips task={task} />
      <Link className="task-card2-title" href={`/tasks/${task.id}`}>
        {displayTitle}
      </Link>
      <p className="task-card2-sub">
        {device?.name || "ბაღი ვერ მოიძებნა"} · {displayIssue}
      </p>
      {task.comment ? (
        <p className="task-card2-comment">{task.comment}</p>
      ) : null}
      <div className="task-card2-meta">
        <span className={overdue ? "task-row-due overdue" : undefined}>
          <CalendarDays size={13} /> {task.dueDate}
        </span>
        <span className="avatar-stack" style={{ marginLeft: "auto" }}>
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
      </div>
      <div className="task-card2-foot">
        <StatusPill
          task={task}
          canEdit={permissions.edit}
          onChangeStatus={onChangeStatus}
        />
        <div className="task-row-actions" style={{ marginLeft: "auto" }}>
          {permissions.edit ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => onEdit(task)}
              aria-label="დავალების რედაქტირება"
              title="დავალების რედაქტირება"
            >
              <Edit3 size={15} />
            </button>
          ) : null}
          {permissions.delete ? (
            <button
              className="icon-button danger"
              type="button"
              onClick={() => onDelete(task.id)}
              disabled={savingTaskId === task.id}
              aria-label="დავალების წაშლა"
              title="დავალების წაშლა"
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function StatusPill({
  task,
  canEdit,
  onChangeStatus,
}: {
  task: Task;
  canEdit: boolean;
  onChangeStatus: (taskId: string, status: TaskStatus) => void;
}) {
  return (
    <label className={`task-status-pill ${task.status}`}>
      <span className="sr-only">სტატუსი</span>
      <select
        value={task.status}
        onChange={(event) =>
          onChangeStatus(task.id, event.target.value as TaskStatus)
        }
        disabled={!canEdit}
      >
        {statusOrder.map((value) => (
          <option key={value} value={value}>
            {statusLabels[value]}
          </option>
        ))}
      </select>
      <ChevronDown size={12} strokeWidth={2.4} />
    </label>
  );
}

/** Two tags fit the column; the rest collapse into a hoverable counter. */
function TagCell({ tags }: { tags: string[] }) {
  if (!tags.length) {
    return <span className="task-row-tags empty">—</span>;
  }

  const shown = tags.slice(0, 2);
  const hidden = tags.length - shown.length;

  return (
    <span className="task-row-tags" title={tags.join(", ")}>
      {shown.map((tagName) => (
        <span key={tagName} className="mini-pill tag">
          {tagName}
        </span>
      ))}
      {hidden > 0 ? <span className="mini-pill tag more">+{hidden}</span> : null}
    </span>
  );
}

function TaskChips({ task }: { task: Task }) {
  return (
    <span className="task-row-chips">
      <span className={`mini-pill p-${task.priority}`}>
        {priorityLabels[task.priority]}
      </span>
      {task.tags.map((tagName) => (
        <span key={tagName} className="mini-pill tag">
          {tagName}
        </span>
      ))}
    </span>
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

function isOverdue(task: Pick<Task, "status" | "dueDate">) {
  return (
    task.status !== "done" &&
    task.dueDate < new Date().toISOString().slice(0, 10)
  );
}

function getIssueIndicatorState(task: Pick<Task, "status" | "dueDate">) {
  if (task.status === "done") {
    return "done";
  }

  return task.dueDate < new Date().toISOString().slice(0, 10)
    ? "overdue"
    : "active";
}
