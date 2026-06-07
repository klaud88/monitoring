"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Edit3,
  Filter,
  MapPin,
  Phone,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { taskTagCatalog } from "@/lib/catalog";
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
  manageStatus: boolean;
};

type Props = {
  initialReports: ProblemReport[];
  devices: Device[];
  users: AppUser[];
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

const today = new Date().toISOString().slice(0, 10);

export function ProblemReportsManager({
  initialReports,
  devices,
  users,
  permissions,
}: Props) {
  const [reports, setReports] = useState(initialReports);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ReportDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ReportDraft>({
    deviceId: devices[0]?.id || "",
    title: "",
    issue: "",
    phone: "",
    status: "planned",
    priority: "normal",
    tags: [],
    assigneeIds: [],
    dueDate: today,
  });

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
      const gardenName = device ? getGardenDisplayName(device) : report.deviceGroupCode;
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

  async function createReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.create || !draft.deviceId || !draft.title.trim() || !draft.issue.trim()) {
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
    setDraft((current) => ({
      ...current,
      title: "",
      issue: "",
      phone: "",
      status: "planned",
      priority: "normal",
      tags: [],
      assigneeIds: [],
      dueDate: today,
    }));
  }

  function startEdit(report: ProblemReport) {
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

    const confirmed = window.confirm("წავშალო დარეგისტრირებული პრობლემა?");
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
    <div className="problem-reports-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">პრობლემების რეგისტრაცია</p>
          <h1>დარეგისტრირებული პრობლემები</h1>
          <p>ბაღები აფიქსირებენ პრობლემებს, დისპეტჩერი კი ანაწილებს მომხმარებლებს, ტეგებს და სტატუსს.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <AlertCircle size={18} />
            <span>{reports.length}</span>
            <small>სულ</small>
          </div>
          <div className="metric">
            <CheckCircle2 size={18} />
            <span>{reports.filter((report) => report.status === "done").length}</span>
            <small>დასრულდა</small>
          </div>
          <div className="metric">
            <CalendarDays size={18} />
            <span>{reports.filter(isOverdueReport).length}</span>
            <small>ვადაგასული</small>
          </div>
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      <section className="content-grid problem-report-grid">
        {permissions.create ? (
          <form className="surface admin-form problem-report-form" onSubmit={createReport}>
            <div className="section-title">
              <h2>ახალი პრობლემა</h2>
              <Plus size={20} />
            </div>
            <ReportFields
              draft={draft}
              devices={devices}
              gardenOptions={gardenOptions}
              permissions={permissions}
              users={users}
              onChange={(updater) =>
                setDraft((current) => updater(current) ?? current)
              }
              onToggleTag={toggleDraftTag}
              onToggleAssignee={toggleDraftAssignee}
              mode="create"
            />
            <button className="primary-button" type="submit" disabled={saving}>
              <Plus size={18} />
              <span>{saving ? "ინახება..." : "რეგისტრაცია"}</span>
            </button>
          </form>
        ) : (
          <section className="surface empty-state">რეგისტრაციის უფლება არ გაქვთ.</section>
        )}

        <section className="surface problem-report-list">
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
              <MapPin size={17} />
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
          </div>

          <div className="problem-report-table">
            <div className="problem-report-head">
              <span />
              <span>ბაღი</span>
              <span>პრობლემა</span>
              <span>მომხმარებლები</span>
              <span>სტატუსი</span>
              <span>ვადა</span>
              <span>მოქმედება</span>
            </div>
            {visibleReports.map((report) => {
              const device = deviceMap.get(report.deviceId);
              return editingReportId === report.id && editDraft ? (
                <article key={report.id} className="problem-report-row editing">
                  <ReportFields
                    draft={editDraft}
                    devices={devices}
                    gardenOptions={gardenOptions}
                    permissions={permissions}
                    users={users}
                    onChange={setEditDraft}
                    onToggleTag={toggleEditTag}
                    onToggleAssignee={toggleEditAssignee}
                    mode="edit"
                  />
                  <div className="row-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => saveReport(report.id)}
                      disabled={saving}
                    >
                      <Save size={16} />
                      <span>შენახვა</span>
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setEditingReportId(null);
                        setEditDraft(null);
                      }}
                    >
                      <X size={16} />
                      <span>გაუქმება</span>
                    </button>
                  </div>
                </article>
              ) : (
                <article key={report.id} className="problem-report-row">
                  <span
                    className={`issue-indicator ${getIssueIndicatorState(report)}`}
                    aria-label="პრობლემის ინდიკატორი"
                  />
                  <Link
                    className="task-device-cell clickable-cell"
                    href={`/devices/${device?.id ?? report.deviceId}`}
                  >
                    <span className="device-name-inline">
                      <MapPin size={15} />
                      {device ? getGardenDisplayName(device) : "ბაღი ვერ მოიძებნა"}
                    </span>
                  </Link>
                  <div className="problem-summary-cell">
                    <strong>{report.title}</strong>
                    <p>{report.issue}</p>
                    {report.phone ? (
                      <small className="phone-inline">
                        <Phone size={13} />
                        {report.phone}
                      </small>
                    ) : null}
                    <TaskTagList tags={report.tags} />
                    <small className={`priority-label ${report.priority}`}>
                      {priorityLabels[report.priority]}
                    </small>
                  </div>
                  <span className="avatar-stack">
                    {report.assigneeIds.map((userId) => {
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
                  <span className={`status-pill ${report.status}`}>
                    {statusLabels[report.status]}
                  </span>
                  <span className="date-cell">
                    <CalendarDays size={14} />
                    {report.dueDate}
                  </span>
                  <div className="row-actions">
                    {canUpdate ? (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="რედაქტირება"
                        title="რედაქტირება"
                        onClick={() => startEdit(report)}
                      >
                        <Edit3 size={17} />
                      </button>
                    ) : null}
                    {permissions.delete ? (
                      <button
                        className="icon-button danger"
                        type="button"
                        aria-label="წაშლა"
                        title="წაშლა"
                        onClick={() => removeReport(report.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </div>
  );
}

function ReportFields({
  draft,
  devices,
  gardenOptions,
  permissions,
  users,
  onChange,
  onToggleTag,
  onToggleAssignee,
  mode,
}: {
  draft: ReportDraft;
  devices: Device[];
  gardenOptions: GardenOption[];
  permissions: ProblemReportPermissions;
  users: AppUser[];
  onChange: (
    updater: (current: ReportDraft | null) => ReportDraft | null,
  ) => void;
  onToggleTag: (tagName: string) => void;
  onToggleAssignee: (userId: string) => void;
  mode: "create" | "edit";
}) {
  const canEditCore = mode === "create" || permissions.edit;
  const update = (patch: Partial<ReportDraft>) => {
    onChange((current) => (current ? { ...current, ...patch } : current));
  };
  const selectedDevice = devices.find((device) => device.id === draft.deviceId);
  const selectedGardenCode = selectedDevice ? getGardenCode(selectedDevice) : "";
  const selectedGardenOption = gardenOptions.find(
    (garden) => garden.code === selectedGardenCode,
  );
  const canManagePriority = permissions.edit || permissions.manageStatus;

  return (
    <>
      <label>
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
      <label>
        <span>სათაური</span>
        <input
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          disabled={!canEditCore}
          required
        />
      </label>
      <div className="form-row">
        <label>
          <span>ტელეფონი</span>
          <input
            value={draft.phone}
            onChange={(event) => update({ phone: event.target.value })}
            disabled={!canEditCore}
            inputMode="tel"
          />
        </label>
        <label>
          <span>ვადა</span>
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) => update({ dueDate: event.target.value })}
            disabled={!canEditCore}
          />
        </label>
      </div>
      {canManagePriority || permissions.manageStatus ? (
        <div className="form-row">
          {canManagePriority ? (
            <label>
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
          <label>
            <span>სტატუსი</span>
            <select
              value={draft.status}
              onChange={(event) =>
                update({ status: event.target.value as TaskStatus })
              }
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          ) : null}
        </div>
      ) : null}
      <label>
        <span>საკითხი</span>
        <textarea
          value={draft.issue}
          onChange={(event) => update({ issue: event.target.value })}
          disabled={!canEditCore}
          rows={4}
          required
        />
      </label>
      {permissions.manageTags ? (
        <div className="task-tag-picker">
          <span>ტეგები</span>
          <div className="row-tags">
            {taskTagCatalog.map((tagName) => (
              <button
                key={tagName}
                type="button"
                className={`tag-toggle compact ${draft.tags.includes(tagName) ? "active" : ""}`}
                onClick={() => onToggleTag(tagName)}
              >
                <Tag size={13} />
                {tagName}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {permissions.assignUsers ? (
        <div className="task-assignee-edit">
          <span>მომხმარებლები</span>
          <div className="row-tags">
            {users
              .filter((user) => user.role !== "viewer" && user.role !== "garden")
              .map((user) => (
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

function toggleListValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function getIssueIndicatorState(report: Pick<ProblemReport, "status" | "dueDate">) {
  if (report.status === "done") {
    return "done";
  }

  return isOverdueReport(report) ? "overdue" : "active";
}

function isOverdueReport(report: Pick<ProblemReport, "status" | "dueDate">) {
  return report.status !== "done" && report.dueDate < today;
}
