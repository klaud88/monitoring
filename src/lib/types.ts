export type DeviceStatus = "online" | "offline" | "error";
export type TaskStatus = "planned" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type PageKey =
  | "dashboard"
  | "tasks"
  | "regions"
  | "offline_records"
  | "users"
  | "permissions"
  | "analytics";

export type PermissionAction = "view" | "create" | "edit" | "delete";
export type PermissionKey = `${PageKey}.${PermissionAction}`;

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  color: string;
  permissions: PermissionKey[];
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
  region: string;
  tags: string[];
  position: {
    x: number;
    y: number;
  };
  lastSeenAt: string;
  associatedDevices: string[];
  problems: ProblemRecord[];
  statusEvents: StatusEvent[];
};

export type Task = {
  id: string;
  title: string;
  issue: string;
  deviceId: string;
  assigneeIds: string[];
  status: TaskStatus;
  priority: TaskPriority;
  startsAt?: string;
  dueDate: string;
  createdAt: string;
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
  enabledAt: string;
  enabledDate: string;
};
