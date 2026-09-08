"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronUp,
  Edit3,
  Filter,
  MapPin,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { TaskTagPicker } from "@/components/tasks/task-tag-picker";
import { mergeTags } from "@/lib/tags";
import { workingDayDueDate } from "@/lib/working-days";
import { getAssignableTaskUsers } from "@/lib/task-assignees";
import type {
  AppUser,
  Device,
  ProblemReport,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

type ProblemReportPermissions = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  assignUsers: boolean;
  manageTags: boolean;
  createTags: boolean;
  deleteTags: boolean;
  manageStatus: boolean;
};

type Props = {
  initialReports: ProblemReport[];
  devices: Device[];
  users: AppUser[];
  initialTags: string[];
  canChooseDueDate: boolean;
  permissions: ProblemReportPermissions;
};

type ReportDraft = {
  deviceId: string;
  title: string;
  issue: string;
  phone: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  assigneeIds: string[];
  dueDate: string;
};

type GardenOption = {
  code: string;
  label: string;
  deviceId: string;
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

const statusOrder: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];
const today = new Date().toISOString().slice(0, 10);

function emptyDraft(deviceId: string): ReportDraft {
  return {
    deviceId,
    title: "",
    issue: "",
    phone: "",
    status: "planned",
    priority: "normal",
    tags: [],
    assigneeIds: [],
    dueDate: workingDayDueDate(),
  };
}

export function ProblemReportsManager({
  initialReports,
  devices,
  users,
  initialTags,
  canChooseDueDate,
  permissions,
}: Props) {
  const [reports, setReports] = useState(initialReports);
  const [availableTags, setAvailableTags] = useState(() =>
    mergeTags(
      initialTags,
      initialReports.flatMap((report) => report.tags),
    ),
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ReportDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();
  const editorRef = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<ReportDraft>(() =>
    emptyDraft(devices[0]?.id || ""),
  );

  const canUpdate =
    permissions.edit ||
    permissions.assignUsers ||
    permissions.manageTags ||
    permissions.manageStatus;
  const deviceMap = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );
  const gardenOptions = useMemo(() => buildGardenOptions(devices), [devices]);
  const assignableUsers = useMemo(
    () => getAssignableTaskUsers(users),
    [users],
  );
  const userMap = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );
  const visibleReports = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return reports.filter((report) => {
      const device = deviceMap.get(report.deviceId);
      const matchesStatus =
        statusFilter === "all" || report.status === statusFilter;
      const matchesDevice =
        deviceFilter === "all" ||
        report.deviceGroupCode === deviceFilter ||
        (device ? getGardenCode(device) === deviceFilter : false);
      const gardenName = device
        ? getGardenDisplayName(device)
        : report.deviceGroupCode;
      const matchesQuery =
        !normalized ||
        report.title.toLowerCase().includes(normalized) ||
        report.issue.toLowerCase().includes(normalized) ||
        report.phone?.toLowerCase().includes(normalized) ||
        gardenName.toLowerCase().includes(normalized) ||
        device?.name.toLowerCase().includes(normalized);

      return matchesStatus && matchesDevice && matchesQuery;
    });
  }, [deviceFilter, deviceMap, query, reports, statusFilter]);

  const doneCount = reports.filter((report) => report.status === "done").length;
  const overdueCount = reports.filter(isOverdueReport).length;

  const editorMode: "create" | "edit" | null = createOpen
    ? "create"
    : editingReportId && editDraft
      ? "edit"
      : null;

  const closeEditor = useCallback(() => {
    setCreateOpen(false);
    setEditingReportId(null);
    setEditDraft(null);
  }, []);

  useEffect(() => {
    if (!editorMode) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editorMode, editingReportId]);

  async function createReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !permissions.create ||
      !draft.deviceId ||
      !draft.title.trim() ||
      !draft.issue.trim()
    ) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch("/api/problem-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizeDraftForSave(draft, permissions)),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("პრობლემის რეგისტრაცია ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { report: ProblemReport };
    setReports((current) => [data.report, ...current]);
    // Fields clear only once the report is stored.
    setDraft(emptyDraft(draft.deviceId));
    setCreateOpen(false);
  }

  function startEdit(report: ProblemReport) {
    setCreateOpen(false);
    setEditingReportId(report.id);
    setEditDraft({
      deviceId: report.deviceId,
      title: report.title,
      issue: report.issue,
      phone: report.phone ?? "",
      status: report.status,
      priority: report.priority,
      tags: report.tags,
      assigneeIds: report.assigneeIds,
      dueDate: report.dueDate,
    });
    setError("");
  }

  async function saveReport(reportId: string) {
    if (!canUpdate || !editDraft) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/problem-reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizeDraftForSave(editDraft, permissions)),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("პრობლემის განახლება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { report: ProblemReport };
    setReports((current) =>
      current.map((report) => (report.id === reportId ? data.report : report)),
    );
    setEditingReportId(null);
    setEditDraft(null);
  }

  async function removeReport(reportId: string) {
    if (!permissions.delete) {
      return;
    }

    const confirmed = await confirm();
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/problem-reports/${reportId}`, {
      method: "DELETE",
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("პრობლემის წაშლა ვერ მოხერხდა.");
      return;
    }

    setReports((current) => current.filter((report) => report.id !== reportId));
    if (editingReportId === reportId) {
      setEditingReportId(null);
      setEditDraft(null);
    }
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
        ? { ...current, tags: toggleListValue(current.tags, tagName) }
        : current,
    );
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
    setAvailableTags(
      (current) => data.tags ?? current.filter((tag) => tag !== tagName),
    );
    setDraft((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag !== tagName),
    }));
    setEditDraft((current) =>
      current
        ? { ...current, tags: current.tags.filter((tag) => tag !== tagName) }
        : current,
    );
    setReports((current) =>
      current.map((report) => ({
        ...report,
        tags: report.tags.filter((tag) => tag !== tagName),
      })),
    );
    return true;
  }

  function toggleDraftAssignee(userId: string) {
    setDraft((current) => ({
      ...current,
      assigneeIds: toggleListValue(current.assigneeIds, userId),
    }));
  }

  function toggleEditAssignee(userId: string) {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            assigneeIds: toggleListValue(current.assigneeIds, userId),
          }
        : current,
    );
  }

  return (
    <div className="reports-page">
      {confirmationDialog}

      <section className="tasks-head">
        <div>
          <h1>პრობლემის დაფიქსირება</h1>
          <p>
            {reports.length} დაფიქსირებული · {doneCount} დასრულებული ·{" "}
            {overdueCount} ვადაგასული
          </p>
        </div>
        {permissions.create ? (
          <div className="tasks-head-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditingReportId(null);
                setEditDraft(null);
                setError("");
                setCreateOpen(true);
              }}
            >
              <Plus size={17} />
              <span>ახალი პრობლემა</span>
            </button>
          </div>
        ) : null}
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
          <MapPin size={16} />
          <select
            value={deviceFilter}
            onChange={(event) => setDeviceFilter(event.target.value)}
          >
            <option value="all">ყველა ბაღი</option>
            {gardenOptions.map((garden) => (
              <option key={garden.code} value={garden.code}>
                {garden.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {editorMode ? (
        <section
          className="task-editor"
          ref={editorRef}
          aria-label={
            editorMode === "create" ? "ახალი პრობლემა" : "პრობლემის რედაქტირება"
          }
        >
          <header className="task-editor-head">
            <div>
              <h2>
                {editorMode === "create"
                  ? "ახალი პრობლემა"
                  : "პრობლემის რედაქტირება"}
              </h2>
              <p>
                {editorMode === "create"
                  ? "დაკეცვისას ჩაწერილი რჩება — ველები მხოლოდ რეგისტრაციის შემდეგ სუფთავდება."
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
              id="report-create-form"
              onSubmit={createReport}
            >
              <ReportFields
                draft={draft}
                devices={devices}
                gardenOptions={gardenOptions}
                availableTags={availableTags}
                permissions={permissions}
                users={assignableUsers}
                canChooseDueDate={canChooseDueDate}
                onChange={(updater) =>
                  setDraft((current) => updater(current) ?? current)
                }
                onToggleTag={toggleDraftTag}
                onCreateTag={createAvailableTag}
                onDeleteTag={removeAvailableTag}
                onToggleAssignee={toggleDraftAssignee}
                mode="create"
              />
            </form>
          ) : editDraft ? (
            <div className="task-editor-body">
              <ReportFields
                draft={editDraft}
                devices={devices}
                gardenOptions={gardenOptions}
                availableTags={availableTags}
                permissions={permissions}
                users={assignableUsers}
                canChooseDueDate={canChooseDueDate}
                onChange={setEditDraft}
                onToggleTag={toggleEditTag}
                onCreateTag={createAvailableTag}
                onDeleteTag={removeAvailableTag}
                onToggleAssignee={toggleEditAssignee}
                mode="edit"
              />
            </div>
          ) : null}

          <div className="task-editor-foot">
            {editorMode === "create" ? (
              <button
                className="primary-button"
                type="submit"
                form="report-create-form"
                disabled={saving}
              >
                <Plus size={17} />
                <span>{saving ? "ინახება..." : "რეგისტრაცია"}</span>
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => editingReportId && saveReport(editingReportId)}
                disabled={saving}
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

      <div className="task-scroll">
        <div className="task-scroll-inner report-scroll-inner">
          <div className="report-grid task-grid-head" aria-hidden="true">
            <span />
            <span>ბაღი</span>
            <span>პრიორიტეტი</span>
            <span>პრობლემა</span>
            <span>ტეგები</span>
            <span>ტელ.</span>
            <span>შემსრ.</span>
            <span>სტატუსი</span>
            <span>ვადა</span>
            <span />
          </div>

          <section className="task-module" aria-label="დაფიქსირებული პრობლემები">
            <div className="task-module-body">
              {visibleReports.length ? (
                visibleReports.map((report) => {
                  const device = deviceMap.get(report.deviceId);
                  const overdue = isOverdueReport(report);
                  return (
                    <article
                      key={report.id}
                      id={`report-${report.id}`}
                      className={`report-grid task-row${overdue ? " urgent" : ""}${report.status === "done" ? " muted" : ""}`}
                    >
                      <span
                        className={`issue-indicator ${getIssueIndicatorState(report)}`}
                        aria-label="პრობლემის ინდიკატორი"
                      />
                      <Link
                        className="task-row-device"
                        href={`/devices/${device?.id ?? report.deviceId}`}
                      >
                        <MapPin size={14} />
                        {device
                          ? getGardenDisplayName(device)
                          : report.deviceGroupCode || "ბაღი ვერ მოიძებნა"}
                      </Link>
                      <span className="task-row-priority">
                        <span className={`mini-pill p-${report.priority}`}>
                          {priorityLabels[report.priority]}
                        </span>
                      </span>
                      <span className="task-row-summary">
                        <span className="task-row-title" title={report.title}>
                          {report.title}
                        </span>
                        <span className="task-row-sub" title={report.issue}>
                          {report.issue}
                        </span>
                      </span>
                      <TagCell tags={report.tags} />
                      <span className="task-row-phone">
                        {report.phone || "—"}
                      </span>
                      <span className="avatar-stack">
                        {report.assigneeIds.map((userId) => {
                          const assignee = userMap.get(userId);
                          return assignee ? (
                            <span
                              key={assignee.id}
                              className="avatar small"
                              style={{ backgroundColor: assignee.color }}
                              title={assignee.name}
                            >
                              {assignee.initials}
                            </span>
                          ) : null;
                        })}
                      </span>
                      <span className={`status-pill ${report.status}`}>
                        {statusLabels[report.status]}
                      </span>
                      <span
                        className={`task-row-due${overdue ? " overdue" : ""}`}
                      >
                        <CalendarDays size={13} />
                        {report.dueDate}
                      </span>
                      <div className="task-row-actions">
                        {canUpdate ? (
                          <button
                            className="icon-button"
                            type="button"
                            aria-label="რედაქტირება"
                            title="რედაქტირება"
                            onClick={() => startEdit(report)}
                          >
                            <Edit3 size={15} />
                          </button>
                        ) : null}
                        {permissions.delete ? (
                          <button
                            className="icon-button danger"
                            type="button"
                            aria-label="წაშლა"
                            title="წაშლა"
                            disabled={saving}
                            onClick={() => removeReport(report.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="task-module-empty">პრობლემა ვერ მოიძებნა.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
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

function ReportFields({
  draft,
  devices,
  gardenOptions,
  availableTags,
  permissions,
  users,
  canChooseDueDate,
  onChange,
  onToggleTag,
  onCreateTag,
  onDeleteTag,
  onToggleAssignee,
  mode,
}: {
  draft: ReportDraft;
  devices: Device[];
  gardenOptions: GardenOption[];
  availableTags: string[];
  permissions: ProblemReportPermissions;
  users: AppUser[];
  canChooseDueDate: boolean;
  onChange: (
    updater: (current: ReportDraft | null) => ReportDraft | null,
  ) => void;
  onToggleTag: (tagName: string) => void;
  onCreateTag: (tagName: string) => Promise<boolean> | boolean;
  onDeleteTag: (tagName: string) => Promise<boolean> | boolean;
  onToggleAssignee: (userId: string) => void;
  mode: "create" | "edit";
}) {
  const canEditCore = mode === "create" || permissions.edit;
  const update = (patch: Partial<ReportDraft>) => {
    onChange((current) => (current ? { ...current, ...patch } : current));
  };
  const selectedDevice = devices.find((device) => device.id === draft.deviceId);
  const selectedGardenCode = selectedDevice
    ? getGardenCode(selectedDevice)
    : "";
  const selectedGardenOption = gardenOptions.find(
    (garden) => garden.code === selectedGardenCode,
  );
  const canManagePriority = permissions.edit || permissions.manageStatus;

  return (
    <>
      <label className="task-field span-2">
        <span>ბაღი</span>
        <select
          value={selectedGardenOption?.deviceId ?? draft.deviceId}
          onChange={(event) => update({ deviceId: event.target.value })}
          disabled={!canEditCore}
          required
        >
          {gardenOptions.map((garden) => (
            <option key={garden.code} value={garden.deviceId}>
              {garden.label}
            </option>
          ))}
        </select>
      </label>
      <label className="task-field span-2">
        <span>სათაური</span>
        <input
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          disabled={!canEditCore}
          required
        />
      </label>
      <label className="task-field">
        <span>ტელეფონი</span>
        <input
          value={draft.phone}
          onChange={(event) => update({ phone: event.target.value })}
          disabled={!canEditCore}
          inputMode="tel"
        />
      </label>
      <label className="task-field">
        <span>ვადა</span>
        <input
          type="date"
          value={draft.dueDate}
          onChange={(event) => update({ dueDate: event.target.value })}
          disabled={!canEditCore || !canChooseDueDate}
        />
        {canChooseDueDate ? null : (
          <small className="task-field-hint">
            ავტომატურად — 5 სამუშაო დღე
          </small>
        )}
      </label>
      {canManagePriority ? (
        <label className="task-field">
          <span>პრიორიტეტი</span>
          <select
            value={draft.priority}
            onChange={(event) =>
              update({ priority: event.target.value as TaskPriority })
            }
          >
            {Object.entries(priorityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {permissions.manageStatus ? (
        <label className="task-field">
          <span>სტატუსი</span>
          <select
            value={draft.status}
            onChange={(event) =>
              update({ status: event.target.value as TaskStatus })
            }
          >
            {statusOrder.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="task-field span-full">
        <span>საკითხი</span>
        <textarea
          value={draft.issue}
          onChange={(event) => update({ issue: event.target.value })}
          disabled={!canEditCore}
          rows={3}
          required
        />
      </label>
      {permissions.manageTags ? (
        <TaskTagPicker
          className="task-field span-full"
          availableTags={availableTags}
          selectedTags={draft.tags}
          canCreateTags={permissions.createTags}
          canDeleteTags={permissions.deleteTags}
          onToggle={onToggleTag}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
        />
      ) : null}
      {permissions.assignUsers ? (
        <div className="task-field span-full">
          <span>მომხმარებლები</span>
          <div className="row-tags">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`tag-toggle compact ${draft.assigneeIds.includes(user.id) ? "active" : ""}`}
                onClick={() => onToggleAssignee(user.id)}
              >
                <UserRound size={13} />
                {user.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function buildGardenOptions(devices: Device[]): GardenOption[] {
  const options = new Map<string, GardenOption>();

  devices.forEach((device) => {
    const code = getGardenCode(device);
    if (!code || options.has(code)) {
      return;
    }

    options.set(code, {
      code,
      label: getGardenDisplayName(device),
      deviceId: device.id,
    });
  });

  return [...options.values()];
}

function getGardenDisplayName(device: Device) {
  return getGardenCode(device) || device.name;
}

function getGardenCode(device: Pick<Device, "code" | "name">) {
  const name = String(device.name || "").trim();
  return normalizeGardenCode(name) || normalizeGardenCode(device.code);
}

function normalizeGardenCode(value?: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const firstPart = trimmed.split("-")[0]?.trim();
  if (firstPart && /^\d+$/.test(firstPart)) {
    return firstPart;
  }

  return trimmed.match(/\d+/)?.[0] || firstPart || trimmed;
}

function normalizeDraftForSave(
  draft: ReportDraft,
  permissions: ProblemReportPermissions,
) {
  const canManagePriority = permissions.edit || permissions.manageStatus;

  return {
    deviceId: draft.deviceId,
    title: draft.title.trim(),
    issue: draft.issue.trim(),
    phone: draft.phone.trim(),
    status: permissions.manageStatus ? draft.status : "planned",
    priority: canManagePriority ? draft.priority : "normal",
    tags: permissions.manageTags ? draft.tags : [],
    assigneeIds: permissions.assignUsers ? draft.assigneeIds : [],
    dueDate: draft.dueDate,
  };
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function getIssueIndicatorState(
  report: Pick<ProblemReport, "status" | "dueDate">,
) {
  if (report.status === "done") {
    return "done";
  }

  return isOverdueReport(report) ? "overdue" : "active";
}

function isOverdueReport(report: Pick<ProblemReport, "status" | "dueDate">) {
  return report.status !== "done" && report.dueDate < today;
}
