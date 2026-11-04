import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  Cpu,
  MapPin,
  Wifi,
  WifiOff,
} from "lucide-react";
import { DeviceAssociations } from "@/components/devices/device-associations";
import { DeletedDeviceBanner } from "@/components/devices/deleted-device-banner";
import { DeviceOfflineCalendar } from "@/components/devices/device-offline-calendar";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  findSiblingDevices,
  getExtraAssociations,
} from "@/lib/device-associations";
import { withoutDeviceCodes } from "@/lib/display";
import { getFirstAllowedPath } from "@/lib/navigation";
import { computeBlackoutStats } from "@/lib/offline-day";
import {
  getDailyOfflineLevels,
  getDevices,
  getTasks,
  getUsers,
} from "@/lib/repositories";
import { resolveTaskVisibilityScope } from "@/lib/task-visibility";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const homePath = getFirstAllowedPath(user);
  if (!hasPermission(user, "dashboard.view") && !hasPermission(user, "devices.view")) {
    redirect(homePath);
  }

  const canDeleteDevice = hasPermission(user, "devices.delete");
  const [allDevices, tasks, users, dailyLevels] = await Promise.all([
    getDevices({ includeDeleted: true }),
    getTasks(resolveTaskVisibilityScope(user)),
    getUsers(),
    getDailyOfflineLevels(),
  ]);
  const device = allDevices.find((item) => item.id === id);

  // A deleted device is shown only to those who may restore it.
  if (!device || (device.deletedAt && !canDeleteDevice)) {
    notFound();
  }
  const devices = allDevices.filter(
    (item) => !item.deletedAt || item.id === device.id,
  );

  const canEditDevice = hasPermission(user, "devices.edit");
  const canViewTasks = hasPermission(user, "tasks.view");
  // Opened from the device list → back goes to the list.
  const fromDeviceList = from === "devices";
  const backHref = fromDeviceList
    ? "/devices/regions"
    : canViewTasks
      ? "/tasks"
      : homePath;
  const backLabel = fromDeviceList
    ? "მოწყობილობებზე დაბრუნება"
    : canViewTasks
      ? "დავალებებზე დაბრუნება"
      : "უკან დაბრუნება";

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

  const deviceMap = new Map(allDevices.map((item) => [item.id, item]));
  const userMap = new Map(users.map((item) => [item.id, item]));

  // Same rows as the monitoring calendar: the 20% "no data" rule counts
  // every tracked device, then only this device's days go to the page.
  const inOfflineCalendar = !device.deletedAt && !device.isExcluded;
  const blackouts = computeBlackoutStats(
    dailyLevels.levels,
    new Set(
      allDevices
        .filter((item) => !item.deletedAt && !item.isExcluded)
        .map((item) => item.id),
    ),
  );
  const deviceLevels = dailyLevels.levels.filter(
    (entry) => entry.deviceId === device.id,
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
      {device.deletedAt ? <DeletedDeviceBanner deviceId={device.id} /> : null}
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
            ბოლო კონტაქტი {formatDateTime(device.lastSeenAt)}
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
              canEdit={canEditDevice && !device.deletedAt}
            />
          </div>

          {/* Tags belong to the garden; this device shows its garden's. */}
          <div className="device-meta-row device-meta-tags">
            <div className="row-tags">
              {device.tags.length ? (
                device.tags.map((tagName) => (
                  <span key={tagName} className="garden-tag-chip">
                    {tagName}
                  </span>
                ))
              ) : (
                <span className="muted">ბაღს ტეგი არ აქვს</span>
              )}
              {canEditDevice ? (
                <Link className="inline-link" href="/devices/regions">
                  ბაღის ტეგების შეცვლა
                </Link>
              ) : null}
            </div>
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

      <section className="surface device-problems-section">
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
      </section>

      <section className="surface device-offline-section">
        <div className="section-title">
          <h2>Offline მოვლენები</h2>
          <CalendarClock size={20} />
        </div>
        {inOfflineCalendar ? (
          <DeviceOfflineCalendar
            deviceName={device.name}
            levels={deviceLevels}
            coveredDays={dailyLevels.coveredDays}
            blackouts={[...blackouts.entries()]}
          />
        ) : (
          <p className="muted">
            {device.deletedAt
              ? "მოწყობილობა წაშლილია — მონიტორინგის კალენდარში არ ჩანს."
              : "მოწყობილობა Offline აღრიცხვიდან გამორიცხულია — მონიტორინგის კალენდარში არ ჩანს."}
          </p>
        )}
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
