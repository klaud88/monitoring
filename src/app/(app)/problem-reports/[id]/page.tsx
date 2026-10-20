import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
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
import { getGardenDisplayName } from "@/lib/device-options";
import { PeopleSection } from "@/components/detail/people-section";
import { OriginHistoryRows } from "@/components/history/origin-history";
import { getGardenScope } from "@/lib/garden-scope";
import { buildHistoryRows } from "@/lib/history-view";
import { getLinkedHistory } from "@/lib/linked-history";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDevices,
  getRoleLabel,
  getProblemReports,
  getUsers,
} from "@/lib/repositories";
import type { TaskPriority, TaskStatus } from "@/lib/types";

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

export default async function ProblemReportDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.view")) {
    redirect(getFirstAllowedPath(user));
  }

  /* Same scope as the list: linked gardens only, or every garden. */
  const [reports, devices, users] = await Promise.all([
    getProblemReports({ gardenCodes: getGardenScope(user, "problem_reports") }),
    getDevices(),
    getUsers(),
  ]);
  const report = reports.find((item) => item.id === id);

  if (!report) {
    notFound();
  }
  /* The linked task's comment and tags, for roles allowed to see them. */
  const showTaskComment = hasPermission(user, "problem_reports.task_comment");
  const showTaskTags = hasPermission(user, "problem_reports.task_tags");
  const tags = showTaskTags
    ? [...new Set([...report.tags, ...(report.taskTags ?? [])])]
    : report.tags;

  /* One history with the linked task (linked-history.ts), newest first.
     The task's comment and tag changes need their own permissions here. */
  const history = await getLinkedHistory({
    reportId: report.id,
    taskId: report.taskId,
  });
  const createdEntry = history.created;
  const userNames = new Map(users.map((item) => [item.id, item.name]));
  const editEntries = buildHistoryRows(history.edits, userNames, (field) =>
    field === "comment" ? showTaskComment : field === "tags" ? showTaskTags : true,
  );

  const device = devices.find((item) => item.id === report.deviceId);
  /* Who reported it, and the garden's own accounts to call. */
  const reporter = users.find(
    (item) => item.id === (report.createdBy ?? history.created?.userId),
  );
  const reporterRole = reporter ? await getRoleLabel(reporter.role) : undefined;
  const gardenContacts = users.filter(
    (item) =>
      item.role === "garden" &&
      Boolean(report.deviceGroupCode) &&
      (item.gardenCodes ?? []).includes(report.deviceGroupCode),
  );
  const assignees = users.filter((item) => report.assigneeIds.includes(item.id));
  const canEditReport =
    hasPermission(user, "problem_reports.edit") ||
    hasPermission(user, "problem_reports.assign") ||
    hasPermission(user, "problem_reports.tag") ||
    hasPermission(user, "problem_reports.status");
  const canViewTasks = hasPermission(user, "tasks.view");
  const overdue =
    report.status !== "done" &&
    report.dueDate < new Date().toISOString().slice(0, 10);
  const urgentActive = report.priority === "urgent" && report.status !== "done";

  return (
    <div className="task-detail">
      <header className="detail-head">
        <div className="detail-head-main">
          <Link className="back-link" href="/problem-reports">
            <ChevronLeft size={16} />
            პრობლემებზე დაბრუნება
          </Link>
          <h1 className="detail-title">{report.title}</h1>
          <div className="detail-badges">
            <span
              className={`detail-badge status ${report.status}${urgentActive ? " urgent-alert" : ""}`}
            >
              <i className={`status-dot ${report.status}`} />
              {statusLabels[report.status]}
            </span>
            <span className={`detail-badge p-${report.priority}`}>
              {priorityLabels[report.priority]}
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
                {getGardenDisplayName(device)}
              </Link>
            ) : (
              <span>{report.deviceGroupCode || "ბაღი ვერ მოიძებნა"}</span>
            )}
            {device?.region ? <span>· {device.region}</span> : null}
          </p>
        </div>

        {canEditReport ? (
          <Link
            className="primary-button"
            href={`/problem-reports?edit=${encodeURIComponent(report.id)}#report-${report.id}`}
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
            {formatDate(report.dueDate)}
          </strong>
        </div>
        <div className="detail-fact">
          <span>
            <CalendarDays size={13} />
            შექმნილია
          </span>
          <strong>{formatDateTime(report.createdAt)}</strong>
        </div>
        <div className="detail-fact">
          <span>
            <CalendarDays size={13} />
            განახლდა
          </span>
          <strong>{formatDateTime(report.updatedAt)}</strong>
        </div>
        <div className="detail-fact">
          <span>
            <Phone size={13} />
            ტელეფონი
          </span>
          <strong>{report.phone || "—"}</strong>
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
                <h2>პრობლემა</h2>
                <FileText size={15} />
              </div>
              <p className="detail-body-text">{report.issue || "—"}</p>
            </section>
          </article>

          {showTaskComment ? (
            <article className="detail-card">
              <div className="detail-card-head">
                <h2>კომენტარი</h2>
                <MessageSquare size={16} />
              </div>
              {report.taskComment ? (
                <p className="detail-body-text comment">{report.taskComment}</p>
              ) : (
                <p className="muted">კომენტარი ჯერ არ არის.</p>
              )}
            </article>
          ) : null}

          <article className="detail-card">
            <div className="detail-card-head">
              <h2>ტეგები</h2>
              <Tag size={16} />
            </div>
            {tags.length ? (
              <div className="detail-chips">
                {tags.map((tagName) => (
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
              <h2>ცვლილების ისტორია</h2>
              <History size={16} />
            </div>

            <div className="origin-list">
              <div className="origin-row">
                <span className="origin-kind create">შემქმნელი</span>
                <span className="origin-user">
                  {createdEntry?.userName ?? "უცნობი"}
                </span>
                <span className="origin-change" />
                <span className="origin-time">
                  {formatDateTime(createdEntry?.createdAt ?? report.createdAt)}
                </span>
              </div>

              <OriginHistoryRows rows={editEntries} />

              {editEntries.length === 0 ? (
                <p className="muted">რედაქტირება არ ყოფილა.</p>
              ) : null}
            </div>

            {report.taskId ? (
              <p className="origin-note">
                <ClipboardList size={13} />
                ამ პრობლემისთვის დავალება შექმნილია.
                {canViewTasks ? (
                  <>
                    {" "}
                    <Link className="inline-link" href={`/tasks/${report.taskId}`}>
                      დავალებაზე გადასვლა
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
              <h2>მომხმარებლის მონაცემები</h2>
              <Cpu size={16} />
            </div>
            <PeopleSection
              reporter={reporter}
              reporterRole={reporterRole}
              gardenContacts={gardenContacts}
            />
            {device ? (
              <dl className="detail-list">
                <div>
                  <dt>ბაღი</dt>
                  <dd>
                    <Link className="inline-link" href={`/devices/${device.id}`}>
                      {getGardenDisplayName(device)}
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
