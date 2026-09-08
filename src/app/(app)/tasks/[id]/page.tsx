import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  Cpu,
  Edit3,
  FileText,
  History,
  MapPin,
  MessageSquare,
  Phone,
  Tag,
  UserRoundCheck,
} from "lucide-react";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { withoutDeviceCodes } from "@/lib/display";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDevices,
  getEntityAuditTrail,
  getTasks,
  getUsers,
} from "@/lib/repositories";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const editActions = new Set([
  "task.update",
  "task.status_local_change",
  "task.assign",
]);

const editActionLabels: Record<string, string> = {
  "task.update": "რედაქტირება",
  "task.status_local_change": "სტატუსის შეცვლა",
  "task.assign": "შემსრულებლის შეცვლა",
};

const maxEditRows = 8;

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

export default async function TaskDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "tasks.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const [tasks, devices, users, auditTrail] = await Promise.all([
    getTasks(),
    getDevices(),
    getUsers(),
    getEntityAuditTrail("task", id),
  ]);
  const task = tasks.find((item) => item.id === id);

  if (!task) {
    notFound();
  }

  const createdEntry = auditTrail.find((entry) => entry.action === "task.create");
  const editEntries = auditTrail
    .filter((entry) => editActions.has(entry.action))
    .reverse();
  const shownEdits = editEntries.slice(0, maxEditRows);

  const device = devices.find((item) => item.id === task.deviceId);
  const assignees = users.filter((item) => task.assigneeIds.includes(item.id));
  const displayTitle = withoutDeviceCodes(task.title, [device?.code]);
  const displayIssue = withoutDeviceCodes(task.issue, [device?.code]);
  const canEditTask = hasPermission(user, "tasks.edit");
  const canViewReports = hasPermission(user, "problem_reports.view");
  const overdue =
    task.status !== "done" &&
    task.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <div className="task-detail">
      <header className="detail-head">
        <div className="detail-head-main">
          <Link className="back-link" href="/tasks">
            <ChevronLeft size={16} />
            დავალებებზე დაბრუნება
          </Link>
          <h1 className="detail-title">{displayTitle}</h1>
          <div className="detail-badges">
            <span className={`detail-badge status ${task.status}`}>
              <i className={`status-dot ${task.status}`} />
              {statusLabels[task.status]}
            </span>
            <span className={`detail-badge p-${task.priority}`}>
              {priorityLabels[task.priority]}
            </span>
            {overdue ? (
              <span className="detail-badge p-urgent">
                <AlertTriangle size={13} />
                ვადაგადაცილებული
              </span>
            ) : null}
          </div>
          <p className="detail-sub">
            <MapPin size={14} />
            {device ? (
              <Link className="inline-link" href={`/devices/${device.id}`}>
                {device.name}
              </Link>
            ) : (
              <span>ბაღი ვერ მოიძებნა</span>
            )}
            {device?.region ? <span>· {device.region}</span> : null}
          </p>
        </div>

        {canEditTask ? (
          <Link
            className="primary-button"
            href={`/tasks?edit=${encodeURIComponent(task.id)}#task-${task.id}`}
          >
            <Edit3 size={16} />
            <span>რედაქტირება</span>
          </Link>
        ) : null}
      </header>

      <section className="detail-facts" aria-label="ძირითადი მონაცემები">
        <div className="detail-fact">
          <span>
            <CalendarDays size={13} />
            ვადა
          </span>
          <strong className={overdue ? "overdue" : undefined}>
            {formatDate(task.dueDate)}
          </strong>
        </div>
        <div className="detail-fact">
          <span>
            <CalendarDays size={13} />
            დაწყება
          </span>
          <strong>
            {task.startsAt ? formatDateTime(task.startsAt) : "—"}
          </strong>
        </div>
        <div className="detail-fact">
          <span>
            <CalendarDays size={13} />
            შექმნილია
          </span>
          <strong>{formatDateTime(task.createdAt)}</strong>
        </div>
        <div className="detail-fact">
          <span>
            <Phone size={13} />
            ტელეფონი
          </span>
          <strong>{task.phone || "—"}</strong>
        </div>
        <div className="detail-fact">
          <span>
            <UserRoundCheck size={13} />
            შემსრულებელი
          </span>
          <strong>{assignees.length}</strong>
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-main">
          <article className="detail-card">
            <section className="detail-section">
              <div className="detail-section-head">
                <h2>საკითხი</h2>
                <FileText size={15} />
              </div>
              <p className="detail-body-text">{displayIssue || "—"}</p>
            </section>

            <section className="detail-section comment">
              <div className="detail-section-head">
                <h2>კომენტარი</h2>
                <MessageSquare size={15} />
              </div>
              {task.comment ? (
                <p className="detail-body-text comment">{task.comment}</p>
              ) : (
                <p className="muted">კომენტარი არ არის.</p>
              )}
            </section>
          </article>

          <article className="detail-card">
            <div className="detail-card-head">
              <h2>ტეგები</h2>
              <Tag size={16} />
            </div>
            {task.tags.length ? (
              <div className="detail-chips">
                {task.tags.map((tagName) => (
                  <span key={tagName} className="mini-pill tag">
                    {tagName}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">ტეგი არ არის მითითებული.</p>
            )}
          </article>

          <article className="detail-card">
            <div className="detail-card-head">
              <h2>წარმოშობა</h2>
              <History size={16} />
            </div>

            <div className="origin-list">
              <div className="origin-row">
                <span className="origin-kind create">შემქმნელი</span>
                <span className="origin-user">
                  {createdEntry?.userName ?? "უცნობი"}
                </span>
                <span className="origin-time">
                  {formatDateTime(createdEntry?.createdAt ?? task.createdAt)}
                </span>
              </div>

              {shownEdits.map((entry) => (
                <div key={entry.id} className="origin-row">
                  <span className="origin-kind edit">
                    {editActionLabels[entry.action] ?? "რედაქტირება"}
                  </span>
                  <span className="origin-user">
                    {entry.userName ?? "უცნობი"}
                  </span>
                  <span className="origin-time">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
              ))}

              {editEntries.length === 0 ? (
                <p className="muted">რედაქტირება არ ყოფილა.</p>
              ) : null}
              {editEntries.length > shownEdits.length ? (
                <p className="muted">
                  კიდევ {editEntries.length - shownEdits.length} ჩანაწერი
                </p>
              ) : null}
            </div>

            {task.problemReportId ? (
              <p className="origin-note">
                <AlertTriangle size={13} />
                ეს დავალება დაფიქსირებული პრობლემიდან შეიქმნა.
                {canViewReports ? (
                  <>
                    {" "}
                    <Link className="inline-link" href="/problem-reports">
                      პრობლემის დაფიქსირებაზე გადასვლა
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
          </article>
        </div>

        <aside className="detail-side">
          <article className="detail-card">
            <div className="detail-card-head">
              <h2>შემსრულებლები</h2>
              <UserRoundCheck size={16} />
            </div>
            {assignees.length ? (
              <div className="detail-people">
                {assignees.map((assignee) => (
                  <div key={assignee.id} className="detail-person">
                    <span
                      className="avatar"
                      style={{ backgroundColor: assignee.color }}
                    >
                      {assignee.initials}
                    </span>
                    <span className="detail-person-copy">
                      <strong>{assignee.name}</strong>
                      <small>{assignee.email}</small>
                    </span>
                    <span className="role-pill">{assignee.role}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">შემსრულებელი მიმაგრებული არ არის.</p>
            )}
          </article>

          <article className="detail-card">
            <div className="detail-card-head">
              <h2>ბაღის კონტექსტი</h2>
              <Cpu size={16} />
            </div>
            {device ? (
              <dl className="detail-list">
                <div>
                  <dt>ბაღი</dt>
                  <dd>
                    <Link className="inline-link" href={`/devices/${device.id}`}>
                      {device.name}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>რაიონი</dt>
                  <dd>{device.region || "—"}</dd>
                </div>
                <div>
                  <dt>სტატუსი</dt>
                  <dd>
                    <span className={`device-status-chip ${device.status}`}>
                      <i className={`status-dot ${device.status}`} />
                      {formatDeviceStatus(device.status)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>ტეგები</dt>
                  <dd>
                    {device.tags.length ? (
                      <span className="detail-chips">
                        {device.tags.map((tagName) => (
                          <span key={tagName} className="mini-pill tag">
                            {tagName}
                          </span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>ბოლო კონტაქტი</dt>
                  <dd>{formatDateTime(device.lastSeenAt)}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">ბაღი აღარ მოიძებნა.</p>
            )}
          </article>
        </aside>
      </div>
    </div>
  );
}

function formatDeviceStatus(status: "online" | "offline" | "error") {
  if (status === "online") {
    return "Online";
  }

  if (status === "offline") {
    return "Offline";
  }

  return "Error";
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }
  return new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ka-GE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
