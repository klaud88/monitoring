import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  MapPin,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
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

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <Link className="back-link" href="/tasks">
            <ChevronLeft size={16} />
            ტასკებში დაბრუნება
          </Link>
          <p className="eyebrow">ტასკი</p>
          <h1>{task.title}</h1>
          <p>{task.issue}</p>
        </div>
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
        </div>
      </section>

      <section className="content-grid three">
        <div className="surface stat-surface">
          <MapPin size={20} />
          <span>X-Station</span>
          <strong>{device?.code ?? task.deviceId}</strong>
          <small>{device?.name}</small>
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
                <dt>რეგიონი</dt>
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
                    {device.code}-ზე გადასვლა
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
