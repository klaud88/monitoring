"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Filter,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import type { AuditLogEntry, AuditLogsResult, SessionUser } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  "auth.login":                    "შესვლა",
  "auth.login.failed":             "შესვლის მცდელობა",
  "auth.logout":                   "გამოსვლა",
  "auth.change_password":          "პაროლის შეცვლა",
  "user.create":                   "მომხმარებელი შეიქმნა",
  "user.update":                   "მომხმარებელი განახლდა",
  "user.delete":                   "მომხმარებელი წაიშალა",
  "role.create":                   "როლი შეიქმნა",
  "role.permissions_update":       "უფლებები განახლდა",
  "task.create":                   "დავალება შეიქმნა",
  "task.update":                   "დავალება განახლდა",
  "task.delete":                   "დავალება წაიშალა",
  "form_one.create":               "ფ-1 შეიქმნა",
  "form_one.update":               "ფ-1 განახლდა",
  "form_one.delete":               "ფ-1 წაიშალა",
  "form_one.comment_update":       "ფ-1 კომენტარი",
  "form_one.completion_request":   "ფ-1 დასრულების მოთხოვნა",
  "form_one.completion_approve":   "ფ-1 დასტური",
  "form_one.completion_reject":    "ფ-1 უარყოფა",
  "problem_report.create":         "განაცხადი შეიქმნა",
  "problem_report.update":         "განაცხადი განახლდა",
  "problem_report.delete":         "განაცხადი წაიშალა",
  "device.create":                 "მოწყობილობა შეიქმნა",
  "device.update":                 "მოწყობილობა განახლდა",
  "device.delete":                 "მოწყობილობა წაიშალა",
  "device.position_update":        "მოწყობილობის პოზიცია",
  "region.create":                 "რეგიონი შეიქმნა",
  "region.update":                 "რეგიონი განახლდა",
  "region.delete":                 "რეგიონი წაიშალა",
  "device_tag.create":             "Tag შეიქმნა",
  "device_tag.delete":             "Tag წაიშალა",
  "task_tag.create":               "Task tag შეიქმნა",
  "task_tag.delete":               "Task tag წაიშალა",
};

const ENTITY_OPTIONS = [
  { value: "",                  label: "ყველა ტიპი" },
  { value: "user",              label: "მომხმარებელი" },
  { value: "role",              label: "როლი" },
  { value: "task",              label: "დავალება" },
  { value: "form_one_record",   label: "ფორმა 1" },
  { value: "problem_report",    label: "განაცხადი" },
  { value: "device",            label: "მოწყობილობა" },
  { value: "region",            label: "რეგიონი" },
  { value: "device_tag",        label: "Device Tag" },
  { value: "task_tag",          label: "Task Tag" },
];

const ACTION_BADGE_CLASS: Record<string, string> = {
  "auth.login.failed":   "badge-danger",
  "user.delete":         "badge-danger",
  "task.delete":         "badge-danger",
  "form_one.delete":     "badge-danger",
  "problem_report.delete": "badge-danger",
  "device.delete":       "badge-danger",
  "region.delete":       "badge-danger",
  "auth.login":          "badge-success",
  "role.permissions_update": "badge-warning",
  "auth.change_password": "badge-warning",
};

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("ka-GE", {
      day:    "2-digit",
      month:  "2-digit",
      year:   "numeric",
      hour:   "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Filters = {
  action: string;
  entityType: string;
  userId: string;
  from: string;
  to: string;
};

const emptyFilters: Filters = { action: "", entityType: "", userId: "", from: "", to: "" };

type Props = {
  initial: AuditLogsResult;
  users: SessionUser[];
};

export function AuditLogsManager({ initial, users }: Props) {
  const [result, setResult] = useState<AuditLogsResult>(initial);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchPage = useCallback((f: Filters, page: number) => {
    startTransition(async () => {
      const sp = new URLSearchParams();
      sp.set("page", String(page));
      sp.set("pageSize", "50");
      if (f.action)     sp.set("action",     f.action);
      if (f.entityType) sp.set("entityType", f.entityType);
      if (f.userId)     sp.set("userId",     f.userId);
      if (f.from)       sp.set("from",       f.from);
      if (f.to)         sp.set("to",         f.to);

      const res = await fetch(`/api/audit?${sp}`).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as AuditLogsResult;
      setResult(data);
      setExpanded(null);
    });
  }, []);

  function handleFilterChange(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPage(next, 1), 350);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="audit-logs-page">
      <div className="page-header compact">
        <div>
          <p className="eyebrow">ადმინისტრირება</p>
          <h1>Audit Logs</h1>
          <p>მომხმარებლების ქმედებების ისტორია</p>
        </div>
        <button
          className="ghost-button"
          type="button"
          onClick={() => fetchPage(filters, result.page)}
          disabled={pending}
        >
          <RefreshCw size={15} className={pending ? "spin" : ""} />
          <span>განახლება</span>
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar audit-filter-bar">
        <div className="field-with-icon search-field">
          <Search size={16} />
          <input
            type="text"
            placeholder="Action-ის ძიება…"
            value={filters.action}
            onChange={(e) => handleFilterChange({ action: e.target.value })}
          />
        </div>

        <select
          className="select-control"
          value={filters.entityType}
          onChange={(e) => handleFilterChange({ entityType: e.target.value })}
        >
          {ENTITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="select-control"
          value={filters.userId}
          onChange={(e) => handleFilterChange({ userId: e.target.value })}
        >
          <option value="">ყველა მომხმარებელი</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <div className="audit-date-range">
          <Filter size={14} className="audit-date-icon" />
          <input
            type="date"
            value={filters.from}
            onChange={(e) => handleFilterChange({ from: e.target.value })}
            title="თარიღიდან"
          />
          <span className="audit-date-sep">—</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => handleFilterChange({ to: e.target.value })}
            title="თარიღამდე"
          />
        </div>

        {Object.values(filters).some(Boolean) && (
          <button
            className="ghost-button"
            type="button"
            onClick={() => { setFilters(emptyFilters); fetchPage(emptyFilters, 1); }}
          >
            გასუფთავება
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="audit-stats">
        <span>
          <ClipboardList size={14} />
          სულ: <strong>{result.total}</strong> ჩანაწერი
        </span>
        {totalPages > 1 && (
          <span>გვ. {result.page} / {totalPages}</span>
        )}
      </div>

      {/* Table */}
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>თარიღი</th>
              <th>მომხმარებელი</th>
              <th>ქმედება</th>
              <th>ობიექტი</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="audit-empty">
                  <Shield size={24} />
                  <span>ჩანაწერი არ მოიძებნა</span>
                </td>
              </tr>
            ) : result.entries.map((entry) => (
              <AuditRow
                key={entry.id}
                entry={entry}
                isExpanded={expanded === entry.id}
                onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="audit-pagination">
          <button
            className="ghost-button"
            type="button"
            disabled={result.page <= 1 || pending}
            onClick={() => fetchPage(filters, result.page - 1)}
          >
            <ChevronLeft size={16} />
            <span>წინა</span>
          </button>
          <span className="audit-page-info">
            {result.page} / {totalPages}
          </span>
          <button
            className="ghost-button"
            type="button"
            disabled={result.page >= totalPages || pending}
            onClick={() => fetchPage(filters, result.page + 1)}
          >
            <span>შემდეგი</span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <style>{auditCss}</style>
    </div>
  );
}

function AuditRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const badgeClass = ACTION_BADGE_CLASS[entry.action] ?? "badge-neutral";
  const hasExtra = entry.entityId || entry.metadata;

  return (
    <>
      <tr
        className={`audit-row ${isExpanded ? "audit-row--expanded" : ""} ${hasExtra ? "audit-row--clickable" : ""}`}
        onClick={hasExtra ? onToggle : undefined}
      >
        <td className="audit-cell-date">{formatDateTime(entry.createdAt)}</td>
        <td className="audit-cell-user">
          <span className="audit-user-name">{entry.userName}</span>
          <small className="audit-user-role">{entry.userRole}</small>
        </td>
        <td>
          <span className={`audit-badge ${badgeClass}`}>{label}</span>
        </td>
        <td className="audit-cell-entity">
          <span className="audit-entity-type">{entry.entityType}</span>
        </td>
        <td className="audit-cell-ip">{entry.ipAddress ?? "—"}</td>
      </tr>
      {isExpanded && (
        <tr className="audit-detail-row">
          <td colSpan={5}>
            <div className="audit-detail">
              {entry.entityId && (
                <div><strong>ID:</strong> <code>{entry.entityId}</code></div>
              )}
              {entry.userAgent && (
                <div><strong>User-Agent:</strong> <span>{entry.userAgent}</span></div>
              )}
              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <div><strong>Metadata:</strong> <code>{JSON.stringify(entry.metadata, null, 2)}</code></div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const auditCss = `
  .audit-logs-page {
    max-width: 1200px;
  }

  .audit-filter-bar {
    margin-bottom: 14px;
    flex-wrap: wrap;
  }

  .audit-date-range {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 10px;
    height: 38px;
  }

  .audit-date-icon { color: var(--muted); flex-shrink: 0; }
  .audit-date-sep  { color: var(--muted); }

  .audit-date-range input[type="date"] {
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 0.82rem;
    outline: none;
    min-width: 120px;
  }

  .audit-stats {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 0.82rem;
    color: var(--muted);
    margin-bottom: 10px;
  }

  .audit-stats span { display: flex; align-items: center; gap: 6px; }
  .audit-stats strong { color: var(--text); }

  .audit-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }

  .audit-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .audit-table thead tr {
    border-bottom: 1px solid var(--line);
  }

  .audit-table th {
    text-align: left;
    padding: 10px 14px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .audit-row td {
    padding: 9px 14px;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }

  .audit-row:last-child td,
  .audit-detail-row:last-child td { border-bottom: none; }

  .audit-row--clickable { cursor: pointer; }
  .audit-row--clickable:hover { background: var(--surface-soft); }
  .audit-row--expanded td { background: var(--surface-soft); }

  .audit-cell-date {
    white-space: nowrap;
    color: var(--muted);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }

  .audit-cell-user {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .audit-user-name { font-weight: 500; }
  .audit-user-role { color: var(--muted); font-size: 0.75rem; }

  .audit-cell-entity { color: var(--muted); font-size: 0.8rem; }
  .audit-entity-type { font-family: monospace; }

  .audit-cell-ip {
    font-size: 0.78rem;
    color: var(--muted);
    font-family: monospace;
    white-space: nowrap;
  }

  .audit-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .badge-neutral { background: var(--surface-muted); color: var(--text); }
  .badge-success { background: var(--success-soft); color: var(--green); }
  .badge-danger  { background: var(--danger-soft);  color: var(--red); }
  .badge-warning { background: var(--warning-soft); color: var(--orange); }

  .audit-detail-row td { padding: 0; border-bottom: 1px solid var(--line); }

  .audit-detail {
    padding: 10px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--muted);
    background: var(--surface-muted);
  }

  .audit-detail code {
    font-family: monospace;
    font-size: 0.78rem;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .audit-detail strong { color: var(--text); }

  .audit-empty {
    text-align: center;
    padding: 48px 20px !important;
    color: var(--muted);
  }

  .audit-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .audit-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
  }

  .audit-page-info {
    font-size: 0.85rem;
    color: var(--muted);
    min-width: 60px;
    text-align: center;
  }

  .spin {
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
`;
