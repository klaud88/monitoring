"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Download, UserRound } from "lucide-react";
import type { TaskStatus } from "@/lib/types";

/** One task as the statistics need it (built in analytics/page.tsx). */
export type TaskStatRow = {
  id: string;
  title: string;
  garden: string;
  assigneeIds: string[];
  status: TaskStatus;
  dueDate: string;
  /** The problem report's registration, else the task's creation. */
  registeredAt: string;
  /** Only on done tasks: when it last became done. */
  completedAt?: string;
};

export type TaskStatUser = { id: string; name: string };

type Preset = "1d" | "7d" | "30d" | "custom";

const presetLabels: Record<Preset, string> = {
  "1d": "1 დღე",
  "7d": "1 კვირა",
  "30d": "1 თვე",
  custom: "პერიოდი",
};

const presetDays: Record<Exclude<Preset, "custom">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

const statusLabels: Record<TaskStatus, string> = {
  planned: "დაგეგმილი",
  in_progress: "მიმდინარეობს",
  blocked: "შეჩერებული",
  done: "დასრულებული",
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/* How long closing took, in the four spans the page reports. */
const closeBuckets = [
  { key: "day", label: "≤ 1 დღე", max: DAY },
  { key: "week", label: "≤ 1 კვირა", max: 7 * DAY },
  { key: "month", label: "≤ 1 თვე", max: 30 * DAY },
  { key: "longer", label: "> 1 თვე", max: Infinity },
] as const;

type Stats = {
  received: number;
  closed: number;
  open: number;
  overdue: number;
  /** Mean registered → closed time of the tasks closed in range, in ms. */
  averageMs: number | null;
  buckets: number[];
};

export function TaskStats({
  tasks,
  users,
  canExport,
}: {
  tasks: TaskStatRow[];
  users: TaskStatUser[];
  canExport: boolean;
}) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [fromDate, setFromDate] = useState(() => daysAgoKey(29));
  const [toDate, setToDate] = useState(() => dateKey(new Date()));
  const [userId, setUserId] = useState("all");

  const today = dateKey(new Date());

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === "custom") {
      return;
    }
    setFromDate(daysAgoKey(presetDays[next] - 1));
    setToDate(dateKey(new Date()));
  }

  /** Tasks received or closed in the range — the ones the period is about. */
  const rangeTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          isWithin(task.registeredAt, fromDate, toDate) ||
          isWithin(task.completedAt, fromDate, toDate),
      ),
    [fromDate, tasks, toDate],
  );

  const userRows = useMemo(
    () =>
      users
        .map((user) => ({
          user,
          stats: computeStats(
            rangeTasks.filter((task) => task.assigneeIds.includes(user.id)),
            fromDate,
            toDate,
            today,
          ),
        }))
        .filter((row) => row.stats.received || row.stats.closed)
        .sort(
          (a, b) =>
            b.stats.closed - a.stats.closed ||
            b.stats.received - a.stats.received ||
            a.user.name.localeCompare(b.user.name, "ka"),
        ),
    [fromDate, rangeTasks, toDate, today, users],
  );

  const scopedTasks = useMemo(
    () =>
      userId === "all"
        ? rangeTasks
        : rangeTasks.filter((task) => task.assigneeIds.includes(userId)),
    [rangeTasks, userId],
  );
  // Everyone's totals count each task once, however many people it has.
  const totals = useMemo(
    () => computeStats(scopedTasks, fromDate, toDate, today),
    [fromDate, scopedTasks, toDate, today],
  );
  const visibleRows =
    userId === "all"
      ? userRows
      : userRows.filter((row) => row.user.id === userId);
  const selectedUser = users.find((user) => user.id === userId);

  /* Closed newest first, then the still-open ones by registration. */
  const taskList = useMemo(
    () =>
      [...scopedTasks].sort((a, b) => {
        if (a.completedAt && b.completedAt) {
          return b.completedAt.localeCompare(a.completedAt);
        }
        if (a.completedAt || b.completedAt) {
          return a.completedAt ? -1 : 1;
        }
        return b.registeredAt.localeCompare(a.registeredAt);
      }),
    [scopedTasks],
  );

  function exportCsv() {
    const header = [
      "მომხმარებელი",
      "მიღებული",
      "დახურული",
      "ღია",
      "ვადაგასული",
      "საშ. დახურვის დრო",
      ...closeBuckets.map((bucket) => bucket.label),
    ];
    const rows = visibleRows.map(({ user, stats }) => [
      user.name,
      String(stats.received),
      String(stats.closed),
      String(stats.open),
      String(stats.overdue),
      stats.averageMs === null ? "" : formatDuration(stats.averageMs),
      ...stats.buckets.map(String),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tasks-${fromDate}-${toDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="task-stats" aria-label="დავალებების სტატისტიკა">
      <div className="analytics-head">
        <div>
          <h2 className="task-stats-title">დავალებების სტატისტიკა</h2>
          <p>
            {formatDate(fromDate)} — {formatDate(toDate)} ·{" "}
            {selectedUser ? selectedUser.name : `${userRows.length} შემსრულებელი`}
          </p>
        </div>
        <div className="analytics-head-actions">
          <div className="preset-switch" role="group" aria-label="პერიოდი">
            {(Object.keys(presetLabels) as Preset[]).map((value) => (
              <button
                key={value}
                type="button"
                className={preset === value ? "active" : ""}
                onClick={() => applyPreset(value)}
                aria-pressed={preset === value}
              >
                {presetLabels[value]}
              </button>
            ))}
          </div>
          {canExport ? (
            <button className="ghost-button" type="button" onClick={exportCsv}>
              <Download size={15} />
              <span>ექსპორტი</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="analytics-range">
        <label className="select-control">
          <UserRound size={16} />
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            aria-label="მომხმარებელი"
          >
            <option value="all">ყველა მომხმარებელი</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        {preset === "custom" ? (
          <>
            <label className="select-control">
              <CalendarDays size={16} />
              <span>დან</span>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <label className="select-control">
              <CalendarDays size={16} />
              <span>მდე</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="kpi-strip task-stats-kpis">
        <div className="kpi-cell">
          <span>მიღებული</span>
          <div className="kpi-value">
            <strong>{totals.received}</strong>
          </div>
        </div>
        <div className="kpi-cell">
          <span>დახურული</span>
          <div className="kpi-value">
            <strong>{totals.closed}</strong>
          </div>
        </div>
        <div className="kpi-cell">
          <span>ღია · ვადაგასული</span>
          <div className="kpi-value">
            <strong>{totals.open}</strong>
            <small className={totals.overdue ? "task-stats-overdue" : undefined}>
              {totals.overdue} ვადაგასული
            </small>
          </div>
        </div>
        <div className="kpi-cell">
          <span>საშუალო დახურვის დრო</span>
          <div className="kpi-value">
            <strong>
              {totals.averageMs === null ? "—" : formatDuration(totals.averageMs)}
            </strong>
          </div>
        </div>
        <div className="kpi-cell task-stats-buckets">
          <span>დახურვის დრო</span>
          <div className="task-stats-bucket-row">
            {closeBuckets.map((bucket, index) => (
              <span key={bucket.key}>
                <strong>{totals.buckets[index]}</strong>
                <small>{bucket.label}</small>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="surface task-stats-card">
        <div className="rank-card-head">
          <h3>შემსრულებლები</h3>
          <span>მიღებული/დახურული — არჩეულ პერიოდში</span>
        </div>
        {visibleRows.length ? (
          <div className="task-stats-table">
            <div className="task-stats-row head">
              <span>მომხმარებელი</span>
              <span>მიღებული</span>
              <span>დახურული</span>
              <span>ღია</span>
              <span>ვადაგასული</span>
              <span>საშ. დრო</span>
              {closeBuckets.map((bucket) => (
                <span key={bucket.key}>
                  {bucket.label}
                </span>
              ))}
            </div>
            {visibleRows.map(({ user, stats }) => (
              <button
                key={user.id}
                type="button"
               
                className={`task-stats-row${userId === user.id ? " active" : ""}`}
                onClick={() =>
                  setUserId((current) => (current === user.id ? "all" : user.id))
                }
                title={
                  userId === user.id ? "ყველას ჩვენება" : "მხოლოდ ამ მომხმარებლის"
                }
              >
                <span className="task-stats-name">
                  {user.name}
                </span>
                <StatCell label="მიღებული" value={stats.received} />
                <StatCell label="დახურული" value={stats.closed} strong />
                <StatCell label="ღია" value={stats.open} />
                <StatCell
                  label="ვადაგასული"
                  value={stats.overdue}
                  warn={stats.overdue > 0}
                />
                <StatCell
                  wide
                  label="საშ. დრო"
                  value={
                    stats.averageMs === null ? "—" : formatDuration(stats.averageMs)
                  }
                />
                {closeBuckets.map((bucket, index) => (
                  <StatCell
                    key={bucket.key}
                    label={bucket.label}
                    value={stats.buckets[index]}
                  />
                ))}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">ამ პერიოდში დავალება არ არის.</p>
        )}
      </div>

      {selectedUser ? (
        <div className="surface task-stats-card">
          <div className="rank-card-head">
            <h3>{selectedUser.name} — დავალებები</h3>
            <span>{taskList.length}</span>
          </div>
          {taskList.length ? (
            <div className="task-stats-list">
              <div className="task-stats-task head" aria-hidden="true">
                <span>დავალება</span>
                <span>ბაღი</span>
                <span>დაფიქსირდა</span>
                <span>დაიხურა</span>
                <span>დრო</span>
                <span>სტატუსი</span>
              </div>
              {taskList.map((task) => {
                const overdue = task.status !== "done" && task.dueDate < today;
                return (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className={`task-stats-task${overdue ? " overdue" : ""}`}
                  >
                    <span className="task-stats-task-title">{task.title}</span>
                    <span className="task-stats-garden">{task.garden}</span>
                    <span data-label="დაფიქსირდა">
                      {formatDateTime(task.registeredAt)}
                    </span>
                    <span data-label="დაიხურა">
                      {task.completedAt ? formatDateTime(task.completedAt) : "—"}
                    </span>
                    <span data-label="დრო">
                      {task.completedAt
                        ? formatDuration(
                            Date.parse(task.completedAt) -
                              Date.parse(task.registeredAt),
                          )
                        : "—"}
                    </span>
                    <span className={`task-status-pill ${task.status}`}>
                      <span className="task-stats-status">
                        {statusLabels[task.status]}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="muted">ამ პერიოდში დავალება არ არის.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function StatCell({
  label,
  value,
  strong = false,
  warn = false,
  wide = false,
}: {
  label: string;
  value: number | string;
  strong?: boolean;
  warn?: boolean;
  /** Takes a whole row of a phone card (a duration is too long for half). */
  wide?: boolean;
}) {
  return (
    <span
     
      data-label={label}
      className={`task-stats-cell${strong ? " strong" : ""}${warn ? " warn" : ""}${wide ? " wide" : ""}`}
    >
      {value}
    </span>
  );
}

/**
 * Received = registered in the range; closed = became done in the range.
 * Open and overdue are among the received ones that are not done yet.
 */
function computeStats(
  tasks: TaskStatRow[],
  fromDate: string,
  toDate: string,
  today: string,
): Stats {
  let received = 0;
  let open = 0;
  let overdue = 0;
  const durations: number[] = [];
  const buckets = closeBuckets.map(() => 0);

  for (const task of tasks) {
    if (isWithin(task.registeredAt, fromDate, toDate)) {
      received += 1;
      if (task.status !== "done") {
        open += 1;
        if (task.dueDate < today) {
          overdue += 1;
        }
      }
    }
    if (task.completedAt && isWithin(task.completedAt, fromDate, toDate)) {
      const duration = Math.max(
        0,
        Date.parse(task.completedAt) - Date.parse(task.registeredAt),
      );
      durations.push(duration);
      buckets[closeBuckets.findIndex((bucket) => duration <= bucket.max)] += 1;
    }
  }

  return {
    received,
    closed: durations.length,
    open,
    overdue,
    averageMs: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null,
    buckets,
  };
}

/** "2 დღე 4 სთ", "3 სთ 10 წთ", "25 წთ". */
function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) {
    return hours ? `${days} დღე ${hours} სთ` : `${days} დღე`;
  }
  if (hours) {
    return rest ? `${hours} სთ ${rest} წთ` : `${hours} სთ`;
  }
  return `${rest} წთ`;
}

/** Whether a timestamp falls on a day of the range (local calendar days). */
function isWithin(value: string | undefined, fromDate: string, toDate: string) {
  if (!value) {
    return false;
  }
  const key = dateKey(new Date(value));
  return key >= fromDate && key <= toDate;
}

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgoKey(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dateKey(date);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${formatDate(dateKey(date))} ${time}`;
}

function escapeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
