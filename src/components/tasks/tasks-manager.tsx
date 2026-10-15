"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
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
  Pencil,
} from "lucide-react";
import { AssigneeToggle } from "@/components/common/assignee-toggle";
import { TagChipControl } from "@/components/common/tag-chip-control";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { FiltersToggle } from "@/components/common/filters-toggle";
import { TaskTagPicker } from "@/components/tasks/task-tag-picker";
import {
  buildGardenOptions,
  findGardenOptionByLabel,
  getGardenCode,
  getGardenDisplayName,
  sortDevicesByName,
} from "@/lib/device-options";
import { formatShortDate, withoutDeviceCodes } from "@/lib/display";
import { mergeTags, renameTagInList } from "@/lib/tags";
import { getAssignableTaskUsers } from "@/lib/task-assignees";
import { taskDueDateForPriority } from "@/lib/working-days";
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
  renameTags: boolean;
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
  info: boolean;
  /** "" = no automatic completion. */
  infoAutoDoneDays: string;
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
/** Phones always show the columns view; the view switch is hidden there. */
const phoneMediaQuery = "(max-width: 760px)";

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
  /** One entry per garden, regardless of how many physical devices it has —
   *  this is what the device pickers below show, so "34-1"/"34-2" don't
   *  appear as two separate "34" options. */
  const gardenOptions = useMemo(
    () => buildGardenOptions(sortedDevices),
    [sortedDevices],
  );
  const assignableUsers = useMemo(
    () => getAssignableTaskUsers(users),
    [users],
  );
  const [viewMode, setViewMode] = useState<ViewMode>("lanes");
  const [isPhone, setIsPhone] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [userFilter, setUserFilter] = useState("all");
  const [managingTags, setManagingTags] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TaskDraft | null>(null);
  /** The task being edited may be on a device that isn't its garden's
   *  representative in gardenOptions (e.g. it's "34-2" but "34-1" got
   *  picked to stand for garden 34) — swap that garden's option to point at
   *  the task's actual device so the <select> below always has a matching
   *  value instead of silently falling back to nothing selected. */
  const editGardenOptions = useMemo(() => {
    if (!editDraft) {
      return gardenOptions;
    }
    const currentDevice = devices.find((item) => item.id === editDraft.deviceId);
    if (!currentDevice) {
      return gardenOptions;
    }
    const currentCode = getGardenCode(currentDevice);
    return gardenOptions.map((option) =>
      option.code === currentCode
        ? { ...option, deviceId: currentDevice.id }
        : option,
    );
  }, [gardenOptions, devices, editDraft]);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();
  const initialEditHandledRef = useRef<string | null>(null);
  const [draft, setDraft] = useState(() => ({
    title: "",
    issue: "",
    phone: "",
    deviceId: gardenOptions[0]?.deviceId || "",
    deviceQuery: gardenOptions[0]?.label || "",
    assigneeIds: [] as string[],
    priority: "normal" as TaskPriority,
    tags: [] as string[],
    dueDate: taskDueDateForPriority("normal"),
    info: false,
    infoAutoDoneDays: "",
  }));

  const deviceMap = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );
  const userMap = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  /** Everything except the status filter, so the status chips can show counts. */
  const scopedTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const device = deviceMap.get(task.deviceId);
      const displayTitle = withoutDeviceCodes(task.title, [device?.code]);
      const displayIssue = withoutDeviceCodes(task.issue, [device?.code]);
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
      return matchesUser && matchesTags && matchesQuery;
    });
  }, [deviceMap, query, selectedTags, tasks, userFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      planned: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
    };
    for (const task of scopedTasks) {
      counts[task.status] += 1;
    }
    return counts;
  }, [scopedTasks]);

  const filteredTasks = useMemo(
    () =>
      scopedTasks.filter(
        (task) => statusFilter === "all" || task.status === statusFilter,
      ),
    [scopedTasks, statusFilter],
  );

  /** Shown on the phone-width filter button so a collapsed filter stays visible. */
  const activeFilterCount =
    (statusFilter === "all" ? 0 : 1) +
    (userFilter === "all" ? 0 : 1) +
    selectedTags.length;

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
    const media = window.matchMedia(phoneMediaQuery);
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
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
      info: draft.info,
      infoAutoDoneDays: parseAutoDoneDays(draft.info, draft.infoAutoDoneDays),
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
        dueDate: taskDueDateForPriority(current.priority),
        info: false,
        infoAutoDoneDays: "",
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

    const previousStatus = tasks.find((task) => task.id === taskId)?.status;
    setError("");
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    );

    /* The server records who changed the status, when, and from/to what. */
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);

    if (!response?.ok && previousStatus) {
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, status: previousStatus } : task,
        ),
      );
      setError("სტატუსის შეცვლა ვერ მოხერხდა.");
    }
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

  async function renameAvailableTag(tagName: string, newName: string) {
    if (!permissions.renameTags) {
      return false;
    }

    setError("");
    const response = await fetch("/api/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName, newName }),
    }).catch(() => null);

    if (!response?.ok) {
      setError("ტეგის სახელის შეცვლა ვერ მოხერხდა.");
      return false;
    }

    const data = (await response.json()) as { tag?: string; tags?: string[] };
    const renamed = data.tag ?? newName;
    setAvailableTags(
      (current) => data.tags ?? renameTagInList(current, tagName, renamed),
    );
    setSelectedTags((current) => renameTagInList(current, tagName, renamed));
    setDraft((current) => ({
      ...current,
      tags: renameTagInList(current.tags, tagName, renamed),
    }));
    setEditDraft((current) =>
      current
        ? { ...current, tags: renameTagInList(current.tags, tagName, renamed) }
        : current,
    );
    setTasks((current) =>
      current.map((task) => ({
        ...task,
        tags: renameTagInList(task.tags, tagName, renamed),
      })),
    );
    return true;
  }

  /* Tag bar "მართვა" mode: the pickers confirm inside themselves, the bar
     confirms here. */
  async function confirmRemoveTag(tagName: string) {
    const confirmed = await confirm({
      message: `ნამდვილად გსურთ "${tagName}" ტეგის წაშლა? ტეგი ყველა დავალებიდან და პრობლემიდან მოიხსნება.`,
    });
    if (confirmed) {
      await removeAvailableTag(tagName);
    }
  }

  async function confirmRenameTag(tagName: string, newName: string) {
    if (availableTags.includes(newName)) {
      const merge = await confirm({
        title: "ტეგების გაერთიანება",
        message: `ტეგი "${newName}" უკვე არსებობს. გაერთიანდეს "${tagName}" მასთან? "${tagName}" ყველგან "${newName}"-ით შეიცვლება.`,
        confirmLabel: "გაერთიანება",
      });
      if (!merge) {
        return false;
      }
    }
    return renameAvailableTag(tagName, newName);
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

    const { infoAutoDoneDays: daysInput, ...draftFields } = editDraft;
    const infoAutoDoneDays = parseAutoDoneDays(editDraft.info, daysInput);
    const payload = {
      ...draftFields,
      title: editDraft.title.trim(),
      issue: editDraft.issue.trim(),
      comment: editDraft.comment.trim(),
      phone: editDraft.phone.trim(),
      infoAutoDoneDays,
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
      // null (not undefined) so clearing the day count reaches the server.
      body: JSON.stringify({ ...payload, infoAutoDoneDays: infoAutoDoneDays ?? null }),
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

  const effectiveViewMode: ViewMode = isPhone ? "columns" : viewMode;

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
          <p className="tasks-stat-line">
            <strong>{tasks.length}</strong> დავალება
            <span className="tasks-stat active">{activeCount} აქტიური</span>
            <span className="tasks-stat blocked">{blockedCount} შეჩერებული</span>
            <span className="tasks-stat done">{doneCount} დასრულებული</span>
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
              className="primary-button create-fab"
              type="button"
              onClick={() => {
                setEditingTaskId(null);
                setEditDraft(null);
                setCreateOpen(true);
              }}
            >
              <Plus size={17} />
              <span>დამატება</span>
            </button>
          ) : null}
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      <section
        className="tasks-toolbar"
        aria-label="ფილტრები"
        data-filters-open={filtersOpen ? "true" : "false"}
      >
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ძებნა"
          />
        </div>
        <FiltersToggle
          open={filtersOpen}
          count={activeFilterCount}
          onToggle={() => setFiltersOpen((current) => !current)}
        />
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
            {availableTags.map((tagName) =>
              managingTags ? (
                <TagChipControl
                  key={tagName}
                  name={tagName}
                  showIcon
                  selected={selectedTags.includes(tagName)}
                  onToggle={() => toggleFilterTag(tagName)}
                  onRename={
                    permissions.renameTags
                      ? (newName) => confirmRenameTag(tagName, newName)
                      : undefined
                  }
                  onDelete={
                    permissions.deleteTags
                      ? () => void confirmRemoveTag(tagName)
                      : undefined
                  }
                />
              ) : (
                <button
                  key={tagName}
                  className={`tag-toggle compact ${selectedTags.includes(tagName) ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleFilterTag(tagName)}
                >
                  <Tag size={13} />
                  <span>{tagName}</span>
                </button>
              ),
            )}
            {permissions.renameTags || permissions.deleteTags ? (
              <button
                type="button"
                className={`tag-manage-toggle${managingTags ? " active" : ""}`}
                aria-pressed={managingTags}
                onClick={() => setManagingTags((current) => !current)}
              >
                <Pencil size={13} />
                <span>{managingTags ? "მზადაა" : "ტეგების მართვა"}</span>
              </button>
            ) : null}
          </>
        ) : null}
      </section>

      {/* Phone-width status switch — the same filter the toolbar select drives. */}
      <div className="status-chips" role="group" aria-label="სტატუსის ფილტრი">
        <button
          className={`status-chip${statusFilter === "all" ? " active" : ""}`}
          type="button"
          aria-pressed={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          ყველა
          <span className="status-chip-count">{scopedTasks.length}</span>
        </button>
        {statusOrder.map((status) => (
          <button
            key={status}
            className={`status-chip ${status}${statusFilter === status ? " active" : ""}`}
            type="button"
            aria-pressed={statusFilter === status}
            onClick={() => setStatusFilter(status)}
          >
            <span className={`status-dot ${status}`} />
            {statusLabels[status]}
            <span className="status-chip-count">{statusCounts[status]}</span>
          </button>
        ))}
      </div>

      {editorMode ? (
        <section
          className="task-editor"
          ref={editorRef}
          aria-label={editorMode === "create" ? "ახალი დავალება" : "დავალების რედაქტირება"}
        >
          <header className="task-editor-head">
            <div>
              <h2>
                {editorMode === "create" ? "ახალი დავალება" : "დავალების რედაქტირება"}
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
                    const selectedOption = findGardenOptionByLabel(
                      gardenOptions,
                      deviceQuery,
                    );
                    setDraft((current) => ({
                      ...current,
                      deviceQuery,
                      deviceId: selectedOption?.deviceId ?? "",
                    }));
                  }}
                  required
                />
                <datalist id="new-task-device-options">
                  {gardenOptions.map((option) => (
                    <option key={option.code} value={option.label} />
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
                  onChange={(event) => {
                    /* Priority sets the deadline: 10 / 5 / 2 working days,
                       or today for urgent. The date can still be edited. */
                    const priority = event.target.value as TaskPriority;
                    setDraft((current) => ({
                      ...current,
                      priority,
                      dueDate: taskDueDateForPriority(priority),
                    }));
                  }}
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
                <span>დავალების შემსრულებლები</span>
                <div className="row-tags">
                  {assignableUsers.map((user) => (
                    <AssigneeToggle
                      key={user.id}
                      user={user}
                      selected={draft.assigneeIds.includes(user.id)}
                      onToggle={() =>
                        setDraft((current) => ({
                          ...current,
                          assigneeIds: current.assigneeIds.includes(user.id)
                            ? current.assigneeIds.filter((id) => id !== user.id)
                            : [...current.assigneeIds, user.id],
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
              <InfoSwitch
                checked={draft.info}
                onToggle={() =>
                  setDraft((current) => ({ ...current, info: !current.info }))
                }
                days={draft.infoAutoDoneDays}
                onDaysChange={(infoAutoDoneDays) =>
                  setDraft((current) => ({ ...current, infoAutoDoneDays }))
                }
              />
              <TaskTagPicker
                className="task-field span-full"
                availableTags={availableTags}
                selectedTags={draft.tags}
                canCreateTags={permissions.createTags}
                canDeleteTags={permissions.deleteTags}
                canRenameTags={permissions.renameTags}
                onToggle={toggleDraftTag}
                onCreateTag={createAvailableTag}
                onDeleteTag={removeAvailableTag}
                onRenameTag={renameAvailableTag}
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
                  {editGardenOptions.map((option) => (
                    <option key={option.code} value={option.deviceId}>
                      {option.label}
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
                <span>დავალების შემსრულებლები</span>
                <div className="row-tags">
                  {assignableUsers.map((user) => (
                    <AssigneeToggle
                      key={user.id}
                      user={user}
                      selected={editDraft.assigneeIds.includes(user.id)}
                      onToggle={() => toggleEditAssignee(user.id)}
                    />
                  ))}
                </div>
              </div>
              <InfoSwitch
                checked={editDraft.info}
                onToggle={() =>
                  setEditDraft((current) =>
                    current ? { ...current, info: !current.info } : current,
                  )
                }
                days={editDraft.infoAutoDoneDays}
                onDaysChange={(infoAutoDoneDays) =>
                  setEditDraft((current) =>
                    current ? { ...current, infoAutoDoneDays } : current,
                  )
                }
                autoDoneAt={
                  tasks.find((task) => task.id === editingTaskId)?.infoAutoDoneAt
                }
              />
              <TaskTagPicker
                className="task-field span-full"
                availableTags={availableTags}
                selectedTags={editDraft.tags}
                canCreateTags={permissions.createTags}
                canDeleteTags={permissions.deleteTags}
                canRenameTags={permissions.renameTags}
                onToggle={toggleEditTag}
                onCreateTag={createAvailableTag}
                onDeleteTag={removeAvailableTag}
                onRenameTag={renameAvailableTag}
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

      {effectiveViewMode === "columns" ? (
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
                <p className="task-module-empty">დავალება არ არის.</p>
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

          {effectiveViewMode === "lanes" ? (
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
                      <p className="task-module-empty">დავალება არ არის.</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <section className="task-module" aria-label="ყველა დავალება">
              <div className="task-module-body task-list-panel-body">
                {filteredTasks.length ? (
                  filteredTasks.map((task) => (
                    <TaskRow key={task.id} task={task} {...rowProps} />
                  ))
                ) : (
                  <p className="task-module-empty">დავალება ვერ მოიძებნა.</p>
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
        {device ? getGardenDisplayName(device) : "ბაღი ვერ მოიძებნა"}
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
        {task.info ? (
          <span className="avatar small info-badge" title={infoBadgeTitle(task)}>
            INFO
          </span>
        ) : null}
      </span>
      <StatusPill
        task={task}
        canEdit={permissions.edit}
        onChangeStatus={onChangeStatus}
      />
      <span className={`task-row-due${overdue ? " overdue" : ""}`}>
        <Clock className="task-row-due-icon" size={13} strokeWidth={2} />
        <span className="task-row-due-full">{task.dueDate}</span>
        <span className="task-row-due-short">
          {formatShortDate(task.dueDate)}
        </span>
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
        {device ? getGardenDisplayName(device) : "ბაღი ვერ მოიძებნა"} · {displayIssue}
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
          {task.info ? (
            <span className="avatar small info-badge" title={infoBadgeTitle(task)}>
              INFO
            </span>
          ) : null}
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
  /* An urgent task's status blinks red until it is done. */
  const urgentActive = task.priority === "urgent" && task.status !== "done";

  return (
    <label
      className={`task-status-pill ${task.status}${canEdit ? " editable" : ""}${urgentActive ? " urgent-alert" : ""}`}
      title={canEdit ? "დააჭირეთ სტატუსის შესაცვლელად" : undefined}
    >
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
      {canEdit ? <ChevronDown size={12} strokeWidth={2.4} /> : null}
    </label>
  );
}

/** Two tags fit the column; the rest collapse into a hoverable counter. */
function InfoSwitch({
  checked,
  onToggle,
  days,
  onDaysChange,
  autoDoneAt,
}: {
  checked: boolean;
  onToggle: () => void;
  /** Optional day count after which an INFO task closes itself. */
  days: string;
  onDaysChange: (value: string) => void;
  /** Saved completion time, shown while editing. */
  autoDoneAt?: string;
}) {
  return (
    <div className="task-field span-full">
      <span>საინფორმაციოს აქტივაცია</span>
      <div className="info-switch-row">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          className={`info-switch${checked ? " on" : ""}`}
          onClick={onToggle}
        >
          <span className="info-switch-track" aria-hidden="true">
            <span className="info-switch-thumb" />
          </span>
          <span className="info-switch-label">INFO</span>
        </button>
        <label className={`info-switch-days${checked ? "" : " disabled"}`}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            step={1}
            value={checked ? days : ""}
            onChange={(event) => onDaysChange(event.target.value.replace(/\D/g, ""))}
            placeholder="—"
            disabled={!checked}
            aria-label="დღეების რაოდენობა ავტომატურ დასრულებამდე"
          />
          <span>დღეში დასრულდება</span>
        </label>
      </div>
      {checked && autoDoneAt && days ? (
        <small className="task-field-hint">
          ავტომატურად დასრულდება: {formatAutoDoneAt(autoDoneAt)}
        </small>
      ) : checked && !days ? (
        <small className="task-field-hint">
          დღეები თუ არ მიუთითე, სტატუსს ხელით შეცვლი.
        </small>
      ) : null}
    </div>
  );
}

function infoBadgeTitle(task: Task) {
  return task.infoAutoDoneAt && task.status !== "done"
    ? `საინფორმაციო · ავტომატურად დასრულდება: ${formatAutoDoneAt(task.infoAutoDoneAt)}`
    : "საინფორმაციო";
}

function formatAutoDoneAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ka-GE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

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
    info: Boolean(task.info),
    infoAutoDoneDays: task.infoAutoDoneDays ? String(task.infoAutoDoneDays) : "",
  };
}

/** The form's day count as the API takes it: 1–365, only for INFO tasks. */
function parseAutoDoneDays(info: boolean, value: string) {
  const days = Number(value);
  return info && Number.isInteger(days) && days >= 1 && days <= 365
    ? days
    : undefined;
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
