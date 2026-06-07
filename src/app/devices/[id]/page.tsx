import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  Cpu,
  MapPin,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { withoutDeviceCodes } from "@/lib/display";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getDeviceById, getTasks, getUsers } from "@/lib/repositories";
import type { ProblemRecord, TaskStatus } from "@/lib/types";

const problemLabels: Record<ProblemRecord["status"], string> = {
  open: "ღია",
  planned: "დაგეგმილი",
  resolved: "მოგვარებული",
};

const taskLabels: Record<TaskStatus, string> = {
  planned: "დაგეგმილი",
  in_progress: "მიმდინარეობს",
  blocked: "შეჩერებული",
  done: "დასრულებული",
};

export default async function DeviceDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const homePath = getFirstAllowedPath(user);
  if (!hasPermission(user, "dashboard.view") && !hasPermission(user, "devices.view")) {
    redirect(homePath);
  }

  const [device, tasks, users] = await Promise.all([
    getDeviceById(id),
    getTasks(),
    getUsers(),
  ]);

  if (!device) {
    notFound();
  }

  const deviceTasks = tasks.filter((task) => task.deviceId === device.id);
  const userMap = new Map(users.map((user) => [user.id, user]));
  const offlineEvents = device.statusEvents.filter(
    (event) => event.status === "offline",
  );

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <Link className="back-link" href={homePath}>
            <ChevronLeft size={16} />
            რუკაზე დაბრუნება
          </Link>
          <p className="eyebrow">X-Station</p>
          <h1>{device.name}</h1>
          <p>
            {device.region} · ბოლო კონტაქტი {formatDateTime(device.lastSeenAt)}
          </p>
        </div>
        <div className={`device-status-card ${device.status}`}>
          {device.status === "online" ? (
            <Wifi size={24} />
          ) : device.status === "error" ? (
            <AlertTriangle size={24} />
          ) : (
            <WifiOff size={24} />
          )}
          <strong>{formatDeviceStatus(device.status)}</strong>
          <small>{offlineEvents.length} offline შემთხვევა</small>
        </div>
      </section>

      <section className="content-grid three">
        <div className="surface stat-surface">
          <MapPin size={20} />
          <span>რაიონი</span>
          <strong>{device.region}</strong>
        </div>
        <div className="surface stat-surface">
          <Cpu size={20} />
          <span>ასოცირებული</span>
          <strong>{device.associatedDevices.length}</strong>
        </div>
        <div className="surface stat-surface">
          <Activity size={20} />
          <span>ტეგები</span>
          <strong>{device.tags.length}</strong>
        </div>
      </section>

      <section className="content-grid two">
        <div className="surface">
          <div className="section-title">
            <h2>ასოცირებული მოწყობილობები</h2>
            <Cpu size={20} />
          </div>
          <div className="device-asset-list">
            {device.associatedDevices.length ? (
              device.associatedDevices.map((asset) => (
                <div key={asset} className="asset-row">
                  <span>
                    <Cpu size={16} />
                    {asset}
                  </span>
                  <small>BioStar2 linked</small>
                </div>
              ))
            ) : (
              <p className="muted">
                ასოცირებული მოწყობილობა ჯერ არ არის მითითებული.
              </p>
            )}
          </div>
        </div>

        <div className="surface">
          <div className="section-title">
            <h2>მიმაგრებული ტასკები</h2>
            <Users size={20} />
          </div>
          <div className="task-list compact-list">
            {deviceTasks.length ? (
              deviceTasks.map((task) => {
                const displayTitle = withoutDeviceCodes(task.title, [device.code]);
                const displayIssue = withoutDeviceCodes(task.issue, [device.code]);

                return (
                  <article
                    key={task.id}
                    className={`task-card priority-${task.priority}`}
                  >
                    <div className="task-card-top">
                      <div className="avatar-stack">
                        {task.assigneeIds.map((userId) => {
                          const user = userMap.get(userId);
                          return user ? (
                            <span
                              key={user.id}
                              className="avatar small"
                              style={{ backgroundColor: user.color }}
                            >
                              {user.initials}
                            </span>
                          ) : null;
                        })}
                      </div>
                      <span className={`status-pill ${task.status}`}>
                        {taskLabels[task.status]}
                      </span>
                    </div>
                    <h3>{displayTitle}</h3>
                    <p>{displayIssue}</p>
                    {task.tags.length ? (
                      <div className="task-tags">
                        {task.tags.map((tagName) => (
                          <span key={tagName} className="tag-toggle compact active">
                            {tagName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className="muted">ამ X-Station-ზე აქტიური ტასკი არ არის.</p>
            )}
          </div>
        </div>
      </section>

      <section className="content-grid two">
        <div className="surface">
          <div className="section-title">
            <h2>პრობლემების ისტორია</h2>
            <AlertTriangle size={20} />
          </div>
          <div className="timeline">
            {device.problems.length ? (
              device.problems.map((problem) => {
                const displayTitle = withoutDeviceCodes(problem.title, [
                  device.code,
                ]);
                const displayDescription = withoutDeviceCodes(
                  problem.description,
                  [device.code],
                );

                return (
                  <article
                    key={problem.id}
                    className={`timeline-item ${problem.status}`}
                  >
                    <span className="timeline-dot" />
                    <div>
                      <div className="timeline-head">
                        <h3>{displayTitle}</h3>
                        <span className={`status-pill ${problem.status}`}>
                          {problemLabels[problem.status]}
                        </span>
                      </div>
                      <p>{displayDescription}</p>
                      <dl className="inline-meta">
                        <div>
                          <dt>დაფიქსირდა</dt>
                          <dd>{formatDateTime(problem.reportedAt)}</dd>
                        </div>
                        {problem.plannedAt ? (
                          <div>
                            <dt>იგეგმება</dt>
                            <dd>{formatDateTime(problem.plannedAt)}</dd>
                          </div>
                        ) : null}
                        {problem.resolvedAt ? (
                          <div>
                            <dt>მოგვარდა</dt>
                            <dd>{formatDateTime(problem.resolvedAt)}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="muted">პრობლემები არ ფიქსირდება.</p>
            )}
          </div>
        </div>

        <div className="surface">
          <div className="section-title">
            <h2>Offline მოვლენები</h2>
            <CalendarClock size={20} />
          </div>
          <div className="event-list">
            {offlineEvents.length ? (
              offlineEvents.map((event) => (
                <div key={event.id} className="event-row">
                  {event.durationMinutes && event.durationMinutes > 90 ? (
                    <AlertTriangle size={17} />
                  ) : (
                    <CircleDot size={17} />
                  )}
                  <span>{formatDateTime(event.happenedAt)}</span>
                  <strong>{event.durationMinutes ?? 0} წთ</strong>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <CheckCircle2 size={22} />
                <span>ბოლო პერიოდში offline არ დაფიქსირებულა.</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ka-GE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
