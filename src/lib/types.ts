import type { LatLng } from "./geo";

export type DeviceStatus = "online" | "offline" | "error";
export type TaskStatus = "planned" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type PageKey =
  | "dashboard"
  | "devices"
  | "tasks"
  | "problem_reports"
  | "regions"
  | "offline_records"
  | "users"
  | "permissions"
  | "analytics";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "assign"
  | "tag"
  | "status";
export type PermissionKey = `${PageKey}.${PermissionAction}`;

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  color: string;
  permissions: PermissionKey[];
  deviceGroupCode?: string;
  passwordHash?: string;
};

export type ProblemRecord = {
  id: string;
  title: string;
  description: string;
  status: "open" | "planned" | "resolved";
  reportedAt: string;
  plannedAt?: string;
  resolvedAt?: string;
  ownerUserId?: string;
};

export type StatusEvent = {
  id: string;
  deviceId: string;
  status: DeviceStatus;
  happenedAt: string;
  durationMinutes?: number;
};

export type Device = {
  id: string;
  code: string;
  name: string;
  status: DeviceStatus;
  isExcluded: boolean;
  region: string;
  tags: string[];
  position: LatLng;
  lastSeenAt: string;
  associatedDevices: string[];
  problems: ProblemRecord[];
  statusEvents: StatusEvent[];
};

export type Task = {
  id: string;
  title: string;
  issue: string;
  phone?: string;
  deviceId: string;
  assigneeIds: string[];
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  startsAt?: string;
  dueDate: string;
  createdAt: string;
  problemReportId?: string;
};

export type ProblemReport = {
  id: string;
  taskId?: string;
  deviceId: string;
  deviceGroupCode: string;
  title: string;
  issue: string;
  phone?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  assigneeIds: string[];
  dueDate: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type SessionUser = Omit<AppUser, "passwordHash">;

export type AppRole = {
  id: string;
  name: string;
  label: string;
  permissions: PermissionKey[];
};

export type Region = {
  id: string;
  name: string;
  color: string;
};

export type OfflineSummary = {
  id: string;
  label: string;
  count: number;
};

export type OfflineSnapshotDevice = {
  deviceId: string;
  deviceCode: string;
  deviceName: string;
};

export type OfflineSnapshot = {
  id: string;
  date: string;
  capturedAt: string;
  devices: OfflineSnapshotDevice[];
};

export type MonitoredDevice = {
  deviceId: string;
  deviceName: string;
  enabledAt: string;
  enabledDate: string;
  isActive: boolean;
  offlineCount: number;
  lastStatus?: DeviceStatus;
  lastOfflineAt?: string;
  lastNotificationAt?: string;
  offlinePeriods: MonitoredOfflinePeriod[];
};

export type MonitoredOfflinePeriod = {
  id: string;
  deviceId: string;
  offlineAt: string;
  onlineAt?: string;
};
