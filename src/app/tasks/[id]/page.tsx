import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  Edit3,
  MapPin,
  MessageSquare,
  Phone,
  ShieldAlert,
  Tags,
  UserRoundCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { withoutDeviceCodes } from "@/lib/display";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getDevices, getTasks, getUsers } from "@/lib/repositories";
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

  const [tasks, devices, users] = await Promise.all([
    getTasks(),
    getDevices(),
    getUsers(),
  ]);
  const task = tasks.find((item) => item.id === id);

  if (!task) {
    notFound();
  }

  const device = devices.find((item) => item.id === task.deviceId);
  const assignees = users.filter((user) => task.assigneeIds.includes(user.id));
  const displayTitle = withoutDeviceCodes(task.title, [device?.code]);
  const displayIssue = withoutDeviceCodes(task.issue, [device?.code]);
  const canEditTask = hasPermission(user, "tasks.edit");

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <Link className="back-link" href="/tasks">
            <ChevronLeft size={16} />
            ტასკებში დაბრუნება
          </Link>
          <p className="eyebrow">ტასკი</p>
          <h1>{displayTitle}</h1>
          <p>{displayIssue}</p>
        </div>
        <div className="page-actions">
          {canEditTask ? (
            <Link
              className="primary-button"
              href={`/tasks?edit=${encodeURIComponent(task.id)}#task-${task.id}`}
            >
              <Edit3 size={16} />
              <span>რედაქტირება</span>
            </Link>
          ) : null}
          <div className="metric-strip">
            <div className="metric">
              <ClipboardList size={18} />
              <span>{statusLabels[task.status]}</span>
              <small>სტატუსი</small>
            </div>
            <div className="metric">
              <ShieldAlert size={18} />
              <span>{priorityLabels[task.priority]}</span>
              <small>პრიორიტეტი</small>
            </div>
            <div className="metric">
              <Tags size={18} />
              <span>{task.tags.length}</span>
              <small>ტეგი</small>
            </div>
          </div>
        </div>
      </section>

      {task.tags.length ? (
        <section className="tag-filter task-tag-filter" aria-label="დავალების ტეგები">
          {task.tags.map((tagName) => (
            <span key={tagName} className="tag-toggle active">
              {tagName}
            </span>
          ))}
        </section>
      ) : null}

      <section className="content-grid three">
        <div className="surface stat-surface">
          <MapPin size={20} />
          <span>X-Station</span>
          <strong>{device?.name ?? "დავაისი ვერ მოიძებნა"}</strong>
        </div>
        <div className="surface stat-surface">
          <CalendarDays size={20} />
          <span>ვადა</span>
          <strong>{task.dueDate}</strong>
          <small>
            {task.startsAt
              ? `დაწყება ${formatDateTime(task.startsAt)}`
              : "დაწყების დრო არ არის მითითებული"}
          </small>
        </div>
        <div className="surface stat-surface">
          <UserRoundCheck size={20} />
          <span>მიმაგრებულია</span>
          <strong>{assignees.length}</strong>
          <small>მომხმარებელი</small>
        </div>
      </section>

      {task.phone ? (
        <section className="content-grid two">
          <div className="surface stat-surface">
            <Phone size={20} />
            <span>ტელეფონი</span>
            <strong>{task.phone}</strong>
          </div>
        </section>
      ) : null}

      {task.comment ? (
        <section className="surface task-comment-detail">
          <div className="section-title">
            <h2>კომენტარი</h2>
            <MessageSquare size={20} />
          </div>
          <p className="task-comment-text">{task.comment}</p>
        </section>
      ) : null}

      <section className="content-grid two">
        <div className="surface">
          <div className="section-title">
            <h2>მომხმარებლები</h2>
            <UserRoundCheck size={20} />
          </div>
          <div className="user-table compact-user-table">
            {assignees.map((user) => (
              <article key={user.id} className="user-row">
                <span
                  className="avatar"
                  style={{ backgroundColor: user.color }}
                >
                  {user.initials}
                </span>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <span className="role-pill">{user.role}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="surface">
          <div className="section-title">
            <h2>დავაისის კონტექსტი</h2>
            <MapPin size={20} />
          </div>
          {device ? (
            <dl className="details-list">
              <div>
                <dt>რაიონი</dt>
                <dd>{device.region}</dd>
              </div>
              <div>
                <dt>სტატუსი</dt>
                <dd>{formatDeviceStatus(device.status)}</dd>
              </div>
              <div>
                <dt>ტეგები</dt>
                <dd>{device.tags.join(", ")}</dd>
              </div>
              <div>
                <dt>დეტალური გვერდი</dt>
                <dd>
                  <Link className="inline-link" href={`/devices/${device.id}`}>
                    დავაისის გვერდზე გადასვლა
                  </Link>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="muted">დავაისი აღარ მოიძებნა.</p>
          )}
        </div>
      </section>
    </AppShell>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ka-GE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
