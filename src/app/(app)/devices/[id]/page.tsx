import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  Cpu,
  MapPin,
  Wifi,
  WifiOff,
} from "lucide-react";
import { DeviceAssociations } from "@/components/devices/device-associations";
import { DeviceTagsEditor } from "@/components/devices/device-tags-editor";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { tagCatalog } from "@/lib/catalog";
import {
  findSiblingDevices,
  getExtraAssociations,
} from "@/lib/device-associations";
import { withoutDeviceCodes } from "@/lib/display";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getDevices, getTasks, getUsers } from "@/lib/repositories";
import { mergeTags } from "@/lib/tags";
import type {
  AppUser,
  Device,
  ProblemRecord,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

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

const priorityLabels: Record<TaskPriority, string> = {
  low: "დაბალი",
  normal: "ჩვეულებრივი",
  high: "მაღალი",
  urgent: "სასწრაფო",
};

const boardColumns: TaskStatus[] = [
  "planned",
  "in_progress",
  "blocked",
  "done",
];

const doneLimit = 8;

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

  const [devices, tasks, users] = await Promise.all([
    getDevices(),
    getTasks(),
    getUsers(),
  ]);
  const device = devices.find((item) => item.id === id);

  if (!device) {
    notFound();
  }

  const canEditDevice = hasPermission(user, "devices.edit");
  const canViewTasks = hasPermission(user, "tasks.view");
  const backHref = canViewTasks ? "/tasks" : homePath;
  const backLabel = canViewTasks ? "დავალებებზე დაბრუნება" : "უკან დაბრუნება";
  const availableDeviceTags = mergeTags(
    [...tagCatalog],
    devices.flatMap((item) => item.tags),
  );

  const siblings = findSiblingDevices(device, devices);
  const manualNames = getExtraAssociations(device, siblings);
  const manualDevices = manualNames
    .map((name) =>
      devices.find(
        (item) =>
          item.name.trim().toLocaleLowerCase() ===
          name.trim().toLocaleLowerCase(),
      ),
    )
    .filter((item): item is Device => Boolean(item));

  const relatedIds = new Set([
    device.id,
    ...siblings.map((item) => item.id),
    ...manualDevices.map((item) => item.id),
  ]);
  const relatedTasks = tasks.filter((task) => relatedIds.has(task.deviceId));

  const deviceMap = new Map(devices.map((item) => [item.id, item]));
  const userMap = new Map(users.map((item) => [item.id, item]));
  const offlineEvents = device.statusEvents.filter(
    (event) => event.status === "offline",
  );

  const grouped: Record<TaskStatus, Task[]> = {
    planned: [],
    in_progress: [],
    blocked: [],
    done: [],
  };
  for (const task of relatedTasks) {
    grouped[task.status].push(task);
  }
  grouped.done.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const doneTotal = grouped.done.length;
  grouped.done = grouped.done.slice(0, doneLimit);

  return (
    <div className="device-page">
      <header className="device-head">
        <div className="device-head-main">
          <Link className="back-link" href={backHref}>
            <ChevronLeft size={16} />
            {backLabel}
          </Link>
          <div className="device-title-row">
            <h1>{device.name}</h1>
            <span className={`device-status-chip ${device.status}`}>
              {device.status === "online" ? (
                <Wifi size={15} />
              ) : device.status === "error" ? (
                <AlertTriangle size={15} />
              ) : (
                <WifiOff size={15} />
              )}
              {formatDeviceStatus(device.status)}
            </span>
          </div>
          <p className="device-head-sub">
            ბოლო კონტაქტი {formatDateTime(device.lastSeenAt)} ·{" "}
            {offlineEvents.length} offline შემთხვევა
          </p>
        </div>

        <div className="device-meta">
          <div className="device-meta-row">
            <span className="device-meta-label">
              <MapPin size={14} />
              რაიონი
            </span>
            <strong>{device.region || "დაუნაწილებელი"}</strong>
          </div>

          <div className="device-meta-row">
            <span className="device-meta-label">
              <Cpu size={14} />
              ასოცირებული
            </span>
            <DeviceAssociations
              deviceId={device.id}
              siblings={siblings.map((item) => ({
                id: item.id,
                name: item.name,
                status: item.status,
              }))}
              manual={manualNames}
              options={devices
                .filter((item) => item.id !== device.id)
                .map((item) => item.name)}
              canEdit={canEditDevice}
            />
          </div>

          <div className="device-meta-row device-meta-tags">
            <DeviceTagsEditor
              device={device}
              availableTags={availableDeviceTags}
              canEdit={canEditDevice}
            />
          </div>
        </div>
      </header>

      <section className="device-board-section" aria-label="დავალებები">
        <div className="device-board-head">
          <h2>დავალებები</h2>
          <p>
            {device.name}
            {siblings.length || manualDevices.length
              ? ` და ${siblings.length + manualDevices.length} ასოცირებული მოწყობილობა`
              : ""}
            {" · "}
            {relatedTasks.length} სულ
          </p>
        </div>

        <div className="task-columns">
          {boardColumns.map((status) => (
            <div
              key={status}
              className={`task-column${status === "blocked" ? " danger" : ""}`}
            >
              <div className="task-column-head">
                <span className={`status-dot ${status}`} />
                <h3>{taskLabels[status]}</h3>
                <span className={`task-module-count ${status}`}>
                  {status === "done" ? doneTotal : grouped[status].length}
                </span>
                {status === "done" && doneTotal > doneLimit ? (
                  <span className="task-module-meta">ბოლო {doneLimit}</span>
                ) : null}
              </div>

              {grouped[status].length ? (
                grouped[status].map((task) => (
                  <DeviceTaskCard
                    key={task.id}
                    task={task}
                    device={deviceMap.get(task.deviceId)}
                    userMap={userMap}
                  />
                ))
              ) : (
                <p className="task-module-empty">დავალება არ არის.</p>
              )}
            </div>
          ))}
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
    </div>
  );
}

function DeviceTaskCard({
  task,
  device,
  userMap,
}: {
  task: Task;
  device?: Device;
  userMap: Map<string, AppUser>;
}) {
  const displayTitle = withoutDeviceCodes(task.title, [device?.code]);
  const displayIssue = withoutDeviceCodes(task.issue, [device?.code]);
  const showPriority = task.priority === "urgent" || task.priority === "high";

  return (
    <Link
      className={`task-card2${task.status === "done" ? " muted" : ""}`}
      href={`/tasks/${task.id}`}
    >
      <div className="task-card2-head">
        <span className="task-card2-device">
          <Cpu size={12} />
          {device?.name || "—"}
        </span>
        {showPriority ? (
          <span className={`mini-pill p-${task.priority}`}>
            {priorityLabels[task.priority]}
          </span>
        ) : null}
      </div>
      <span className="task-card2-title">{displayTitle}</span>
      <p className="task-card2-sub">{displayIssue}</p>
      {task.comment ? (
        <p className="task-card2-comment">{task.comment}</p>
      ) : null}
      <div className="task-card2-meta">
        <span>
          <CalendarDays size={13} /> {task.dueDate}
        </span>
        <span className="avatar-stack" style={{ marginLeft: "auto" }}>
          {task.assigneeIds.map((userId) => {
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
      </div>
    </Link>
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
