import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { Prisma } from "@/generated/prisma/client";
import { fetchBiostarDevices, hasBiostarConfig } from "./biostar";
import { mockDevices, mockTasks, mockUsers } from "./mock-data";
import { prisma } from "./prisma";
import type {
  AppUser,
  AppRole,
  Device,
  DeviceStatus,
  FormOneDueDateEntry,
  FormOneNotification,
  FormOneNotificationType,
  FormOneRecord,
  FormOneRecordItem,
  FormOneRejectionComment,
  FormOneStatus,
  MonitoredDevice,
  MonitoredOfflinePeriod,
  OfflineSnapshot,
  PermissionKey,
  ProblemReport,
  Region,
  SessionUser,
  StatusEvent,
  Task,
  TaskStatus,
} from "./types";
import {
  tagCatalog,
  normalizeTaskTagName,
  normalizeTaskTags,
  regions as fallbackRegionNames,
  taskTagCatalog,
} from "./catalog";
import { queryRows, withConnection } from "./db";
import { TBILISI_BOUNDS, clampLatLng, type LatLng } from "./geo";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role_name: string;
  initials: string;
  color: string;
  device_group_code: string | null;
  password_hash: string;
  must_change_password: boolean | number;
  permissions: string | null;
};

type RoleRow = {
  id: string;
  name: string;
  label: string;
  permissions: string | null;
};

type RoleIdRow = RowDataPacket & {
  id: string;
};

type TaskTagRow = {
  name: string;
};

type TaggedJsonRow = RowDataPacket & {
  id: string;
  tags: unknown;
};

type RegionRow = {
  id: string;
  name: string;
  color: string;
};

type DeviceRow = {
  id: string;
  code: string;
  name: string;
  status: DeviceStatus;
  is_excluded: boolean | number | string;
  region: string;
  latitude: number;
  longitude: number;
  last_seen_at: DatabaseDate;
  tags: string | null;
  associated_devices: string | null;
};

type OfflineSnapshotRow = {
  id: string;
  snapshot_date: DatabaseDate;
  captured_at: DatabaseDate;
};

type OfflineSnapshotDeviceRow = {
  snapshot_id: string;
  device_id: string;
  device_code: string;
  device_name: string;
};

type StatusEventRow = {
  id: string;
  device_id: string;
  status: DeviceStatus;
  happened_at: DatabaseDate;
  duration_minutes: number | null;
};

type MonitoredDeviceRow = {
  device_id: string;
  device_name: string;
  enabled_at: DatabaseDate;
  enabled_date: DatabaseDate;
  is_active: boolean | number | string;
  offline_count: number | null;
  last_status: string | null;
  last_offline_at: DatabaseDate | null;
  last_notification_at: DatabaseDate | null;
};

type MonitoredOfflinePeriodRow = {
  id: string;
  device_id: string;
  offline_at: DatabaseDate;
  online_at: DatabaseDate | null;
};

type DatabaseDate = string | Date;

const TBILISI_TIME_ZONE = "Asia/Tbilisi";
const DEFAULT_BIOSTAR_SYNC_TTL_MS = 60 * 60 * 1000;
const UNASSIGNED_REGION = "დაუნაწილებელი";
const DEFAULT_REGION_COLORS = [
  "#2563eb",
  "#0f766e",
  "#f97316",
  "#7c3aed",
  "#dc2626",
  "#64748b",
];
const GARDEN_ROLE_NAME = "garden";
const GARDEN_ROLE_LABEL = "ბაღი";
const OUTSOURCING_ROLE_NAME = "outsourcing";
const OUTSOURCING_ROLE_LABEL = "Outsourcing";
const PROBLEM_REPORT_PERMISSIONS: {
  code: PermissionKey;
  label: string;
  roles: string[];
}[] = [
  {
    code: "problem_reports.view",
    label: "განაცხადები: ნახვა",
    roles: ["admin", "dispatcher", GARDEN_ROLE_NAME],
  },
  {
    code: "problem_reports.create",
    label: "განაცხადები: დამატება",
    roles: ["admin", "dispatcher", GARDEN_ROLE_NAME],
  },
  {
    code: "problem_reports.edit",
    label: "განაცხადები: რედაქტირება",
    roles: ["admin", "dispatcher"],
  },
  {
    code: "problem_reports.delete",
    label: "განაცხადები: წაშლა",
    roles: ["admin"],
  },
  {
    code: "problem_reports.assign",
    label: "ბაღები: მომხმარებლების დამატება",
    roles: ["admin", "dispatcher"],
  },
  {
    code: "problem_reports.tag",
    label: "ბაღები: ტეგების დამატება/რედაქტირება",
    roles: ["admin", "dispatcher"],
  },
  {
    code: "problem_reports.status",
    label: "ბაღები: სტატუსების დამატება/რედაქტირება",
    roles: ["admin", "dispatcher"],
  },
];
const FORM_ONE_PERMISSIONS: {
  code: PermissionKey;
  label: string;
  roles: string[];
}[] = [
  {
    code: "form_one.view",
    label: "ფორმა ერთი: ნახვა",
    roles: ["admin", "dispatcher", GARDEN_ROLE_NAME, OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.create",
    label: "ფორმა ერთი: ახალი ფორმის დამატება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.edit",
    label: "ფორმა ერთი: არჩეული ფორმის რედაქტირება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.garden_edit",
    label: "ფორმა ერთი: ბაღის ველის რედაქტირება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.phone_edit",
    label: "ფორმა ერთი: ტელეფონის ნომრის რედაქტირება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.due_date_edit",
    label: "ფორმა ერთი: შესრულების თარიღის რედაქტირება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.model_add",
    label: "ფორმა ერთი: მოდელის დამატება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.model_edit",
    label: "ფორმა ერთი: მოდელის ცვლილება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.service_add",
    label: "ფორმა ერთი: მომსახურების დამატება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.service_edit",
    label: "ფორმა ერთი: მომსახურების ცვლილება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.service_delete",
    label: "ფორმა ერთი: მომსახურების წაშლა",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.quantity_edit",
    label: "ფორმა ერთი: რაოდენობის ცვლილება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.completion_request",
    label: "ფორმა ერთი: დადასტურებაზე გადაგზავნა",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.completion_response",
    label: "ფორმა ერთი: დადასტურება/გაუქმება",
    roles: ["admin", GARDEN_ROLE_NAME],
  },
  {
    code: "form_one.comment_edit",
    label: "ფორმა ერთი: კომენტარის რედაქტირება",
    roles: ["admin", "dispatcher", OUTSOURCING_ROLE_NAME],
  },
  {
    code: "form_one.delete",
    label: "ფორმა ერთი: წაშლა",
    roles: ["admin"],
  },
];
const TASK_TAG_PERMISSIONS: {
  code: PermissionKey;
  label: string;
  roles: string[];
}[] = [
  {
    code: "tasks.tag_create",
    label: "ტასკები: ახალი ტეგის დამატება",
    roles: ["admin", "dispatcher"],
  },
  {
    code: "tasks.tag_delete",
    label: "ტასკები: ტეგის წაშლა",
    roles: ["admin"],
  },
  {
    code: "problem_reports.tag_create",
    label: "განაცხადები: ახალი ტეგის დამატება",
    roles: ["admin", "dispatcher"],
  },
  {
    code: "problem_reports.tag_delete",
    label: "განაცხადები: ტეგის წაშლა",
    roles: ["admin"],
  },
];
const ACCESS_PERMISSIONS = [
  ...PROBLEM_REPORT_PERMISSIONS,
  ...FORM_ONE_PERMISSIONS,
  ...TASK_TAG_PERMISSIONS,
];
let lastBiostarSyncAt = 0;
let biostarSyncPromise: Promise<{ synced: number; syncedAt: string }> | null =
  null;
let operationalSchemaPromise: Promise<void> | null = null;
let fallbackTaskTagNames: string[] = [...taskTagCatalog];
let fallbackDeviceTagNames: string[] = [...tagCatalog];

type TaskRow = {
  id: string;
  title: string;
  issue: string;
  comment_text: string | null;
  phone: string | null;
  device_id: string;
  status: TaskStatus;
  priority: Task["priority"];
  tags: unknown;
  starts_at: DatabaseDate | null;
  due_date: DatabaseDate;
  created_at: DatabaseDate;
  problem_report_id: string | null;
  assignee_ids: string | null;
};

type ProblemReportRow = {
  id: string;
  task_id: string | null;
  device_id: string;
  device_group_code: string;
  title: string;
  issue: string;
  phone: string | null;
  status: TaskStatus;
  priority: Task["priority"];
  tags: unknown;
  due_date: DatabaseDate;
  created_by: string | null;
  created_at: DatabaseDate;
  updated_at: DatabaseDate;
  assignee_ids: string | null;
};

type FormOneRecordRow = {
  id: string;
  device_id: string;
  device_group_code: string;
  garden_label: string;
  phone: string | null;
  submitted_date: DatabaseDate;
  due_date: DatabaseDate | null;
  due_dates: unknown;
  due_date_change_count: number | null;
  status: FormOneStatus | string | null;
  completion_requested_at: DatabaseDate | null;
  completion_requested_by: string | null;
  completed_at: DatabaseDate | null;
  completed_by: string | null;
  rejection_comments: unknown;
  items: unknown;
  created_by: string | null;
  created_at: DatabaseDate;
  updated_at: DatabaseDate;
};

type FormOneNotificationRow = FormOneRecordRow & {
  notification_id: string;
  notification_record_id: string;
  notification_type: string;
  notification_comment_text: string | null;
  notification_read_at: DatabaseDate | null;
  notification_created_at: DatabaseDate;
};

const csv = (value: string | null | undefined) =>
  value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const normalizeRegionName = (region?: string | null) => {
  const value = String(region || "").trim();
  return value && value !== UNASSIGNED_REGION ? value : null;
};

const toBoolean = (value: boolean | number | string | null | undefined) =>
  value === true || value === 1 || value === "1";

const normalizeDeviceStatus = (value: unknown): DeviceStatus | null => {
  if (value === "online" || value === "offline" || value === "error") {
    return value;
  }

  return null;
};

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const makeStableId = (prefix: string, value: string) => {
  const normalized = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32);
  return `${prefix}-${normalized}`;
};

export const normalizeDeviceGroupCode = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const firstPart = trimmed.split("-")[0]?.trim();
  if (firstPart && /^\d+$/.test(firstPart)) {
    return firstPart;
  }

  const numeric = trimmed.match(/\d+/)?.[0];
  if (numeric) {
    return numeric;
  }

  return firstPart || trimmed;
};

export const getDeviceGroupCode = (device: Pick<Device, "code" | "name">) => {
  const name = String(device.name || "").trim();
  return normalizeDeviceGroupCode(name) || normalizeDeviceGroupCode(device.code);
};

const toDateTimeString = (value: DatabaseDate) =>
  value instanceof Date ? value.toISOString() : value;

const toDateString = (value: DatabaseDate) => {
  if (!(value instanceof Date)) {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toSqlDateTime = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TBILISI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);

  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${readPart("year")}-${readPart("month")}-${readPart("day")} ${readPart("hour")}:${readPart("minute")}:${readPart("second")}`;
};

const getTbilisiDateKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TBILISI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
};

const getTbilisiHour = (value = new Date()) => {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: TBILISI_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(value);

  return Number(hour);
};

const getSyncTtlMs = () => {
  const configured = Number(process.env.BIOSTAR2_SYNC_TTL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_BIOSTAR_SYNC_TTL_MS;
};

async function ensureBiostarDeviceSync() {
  if (!hasBiostarConfig() || isBuildTime()) {
    return;
  }

  try {
    await syncBiostarDevices();
  } catch (error) {
    console.warn(
      `[biostar] ${error instanceof Error ? error.message : "Sync failed"}`,
    );
  }
}

export async function syncBiostarDevices({
  force = false,
}: { force?: boolean } = {}) {
  if (!hasBiostarConfig() || isBuildTime()) {
    return { synced: 0, syncedAt: new Date().toISOString() };
  }

  const now = Date.now();
  if (!force && lastBiostarSyncAt && now - lastBiostarSyncAt < getSyncTtlMs()) {
    return { synced: 0, syncedAt: new Date(lastBiostarSyncAt).toISOString() };
  }

  if (!biostarSyncPromise) {
    biostarSyncPromise = runBiostarDeviceSync().finally(() => {
      biostarSyncPromise = null;
    });
  }

  return biostarSyncPromise;
}

async function runBiostarDeviceSync() {
  await ensureOperationalSchema();
  const biostarDevices = await fetchBiostarDevices();
  const syncedAt = new Date();

  if (!biostarDevices.length) {
    lastBiostarSyncAt = syncedAt.getTime();
    return { synced: 0, syncedAt: syncedAt.toISOString() };
  }

  const synced = await withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        for (const device of biostarDevices) {
          const [existingRows] = await connection.query<RowDataPacket[]>(
            "select status from devices where id = ? limit 1 for update",
            [device.id],
          );
          const previousStatus = normalizeDeviceStatus(existingRows[0]?.status);
          await connection.query<ResultSetHeader>(
            `
              insert into devices
                (id, code, name, status, last_seen_at)
            values (?, ?, ?, ?, ?)
            on duplicate key update
              name = values(name),
              status = values(status),
              updated_at = updated_at
          `,
          [
            device.id,
            device.id,
            device.name,
            device.status,
            toSqlDateTime(syncedAt),
          ],
        );
          await updateMonitoredDeviceStatus(
            connection,
            device.id,
            device.status,
            syncedAt,
            previousStatus,
          );
      }

      await connection.commit();
      return biostarDevices.length;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  lastBiostarSyncAt = syncedAt.getTime();
  return { synced: synced ?? 0, syncedAt: syncedAt.toISOString() };
}

async function ensureOperationalSchema() {
  if (isBuildTime()) {
    return;
  }

  if (!operationalSchemaPromise) {
    operationalSchemaPromise = withConnection(async (connection) => {
      await connection.query(
        "alter table devices modify status enum('online', 'offline', 'error') not null default 'online'",
      );
      await connection.query(
        "alter table status_events modify status enum('online', 'offline', 'error') not null",
      );
      await connection.query(
        "alter table tasks modify priority enum('low', 'normal', 'high', 'urgent') not null default 'normal'",
      );
      const deviceColumns = await getTableColumns(connection, "devices");
      const addedLatitude = await addColumnIfMissing(
        connection,
        deviceColumns,
        "devices",
        "latitude",
        "latitude decimal(10, 6) not null default 41.715100 after region_id",
      );
      const addedLongitude = await addColumnIfMissing(
        connection,
        deviceColumns,
        "devices",
        "longitude",
        "longitude decimal(10, 6) not null default 44.827100 after latitude",
      );

      if (
        (addedLatitude || addedLongitude) &&
        deviceColumns.has("position_x") &&
        deviceColumns.has("position_y")
      ) {
        const backfillColumns = [
          addedLatitude
            ? `latitude = round(${TBILISI_BOUNDS.north} - (position_y / 100) * (${TBILISI_BOUNDS.north} - ${TBILISI_BOUNDS.south}), 6)`
            : "",
          addedLongitude
            ? `longitude = round(${TBILISI_BOUNDS.west} + (position_x / 100) * (${TBILISI_BOUNDS.east} - ${TBILISI_BOUNDS.west}), 6)`
            : "",
        ].filter(Boolean);

        await connection.query(`
          update devices
          set ${backfillColumns.join(", ")}
        `);
      }

      await addColumnIfMissing(
        connection,
        deviceColumns,
        "devices",
        "is_excluded",
        "is_excluded boolean not null default false after biostar_payload",
      );
      const taskColumns = await getTableColumns(connection, "tasks");
      await addColumnIfMissing(
        connection,
        taskColumns,
        "tasks",
        "comment_text",
        "comment_text text null after issue",
      );
      await addColumnIfMissing(
        connection,
        taskColumns,
        "tasks",
        "phone",
        "phone varchar(80) null after comment_text",
      );
      await addColumnIfMissing(
        connection,
        taskColumns,
        "tasks",
        "tags",
        "tags json null after priority",
      );
      const userColumns = await getTableColumns(connection, "users");
      await addColumnIfMissing(
        connection,
        userColumns,
        "users",
        "device_group_code",
        "device_group_code varchar(80) null after color",
      );
      await addColumnIfMissing(
        connection,
        userColumns,
        "users",
        "must_change_password",
        "must_change_password boolean not null default false after is_active",
      );
      await addIndexIfMissing(
        connection,
        "users",
        "idx_users_device_group",
        "device_group_code",
      );
      await connection.query(`
        create table if not exists offline_snapshots (
          id varchar(64) primary key,
          snapshot_date date not null unique,
          captured_at datetime not null,
          created_at timestamp not null default current_timestamp,
          index idx_offline_snapshots_date (snapshot_date)
        )
      `);
      await connection.query(`
        create table if not exists offline_snapshot_devices (
          snapshot_id varchar(64) not null,
          device_id varchar(64) not null,
          device_code varchar(80) not null,
          device_name varchar(180) not null,
          status varchar(16) not null default 'offline',
          raw_payload json null,
          primary key (snapshot_id, device_id),
          constraint fk_offline_snapshot_devices_snapshot foreign key (snapshot_id) references offline_snapshots(id) on delete cascade,
          constraint fk_offline_snapshot_devices_device foreign key (device_id) references devices(id) on delete cascade,
          index idx_offline_snapshot_devices_device (device_id)
        )
      `);
      await connection.query(`
        create table if not exists monitored_devices (
          device_id varchar(64) primary key,
          enabled_at datetime not null,
          enabled_date date not null,
          is_active boolean not null default true,
          offline_count int not null default 0,
          last_status varchar(16) null,
          last_offline_at datetime null,
          last_notification_at datetime null,
          created_at timestamp not null default current_timestamp,
          updated_at timestamp not null default current_timestamp on update current_timestamp,
          constraint fk_monitored_devices_device foreign key (device_id) references devices(id) on delete cascade,
          index idx_monitored_devices_active_date (is_active, enabled_date),
          index idx_monitored_devices_alert (last_notification_at)
        )
      `);
      await connection.query(`
        create table if not exists monitored_device_offline_periods (
          id varchar(64) primary key,
          device_id varchar(64) not null,
          offline_at datetime not null,
          online_at datetime null,
          created_at timestamp not null default current_timestamp,
          constraint fk_monitored_offline_periods_device foreign key (device_id) references devices(id) on delete cascade,
          index idx_monitored_offline_periods_device_time (device_id, offline_at),
          index idx_monitored_offline_periods_open (online_at)
        )
      `);
      const monitoredColumns = await getTableColumns(
        connection,
        "monitored_devices",
      );
      await addColumnIfMissing(
        connection,
        monitoredColumns,
        "monitored_devices",
        "offline_count",
        "offline_count int not null default 0 after is_active",
      );
      await addColumnIfMissing(
        connection,
        monitoredColumns,
        "monitored_devices",
        "last_status",
        "last_status varchar(16) null after offline_count",
      );
      await addColumnIfMissing(
        connection,
        monitoredColumns,
        "monitored_devices",
        "last_offline_at",
        "last_offline_at datetime null after last_status",
      );
      await addColumnIfMissing(
        connection,
        monitoredColumns,
        "monitored_devices",
        "last_notification_at",
        "last_notification_at datetime null after last_offline_at",
      );
      await addIndexIfMissing(
        connection,
        "monitored_devices",
        "idx_monitored_devices_alert",
        "last_notification_at",
      );
      await connection.query(`
        create table if not exists problem_reports (
          id varchar(64) primary key,
          task_id varchar(64) null unique,
          device_id varchar(64) not null,
          device_group_code varchar(80) not null,
          title varchar(220) not null,
          issue text not null,
          phone varchar(80) null,
          status enum('planned', 'in_progress', 'blocked', 'done') not null default 'planned',
          priority enum('low', 'normal', 'high', 'urgent') not null default 'normal',
          tags json null,
          due_date date not null,
          created_by varchar(64) null,
          created_at timestamp not null default current_timestamp,
          updated_at timestamp not null default current_timestamp on update current_timestamp,
          constraint fk_problem_reports_device foreign key (device_id) references devices(id) on delete cascade,
          constraint fk_problem_reports_task foreign key (task_id) references tasks(id) on delete set null,
          constraint fk_problem_reports_created_by foreign key (created_by) references users(id) on delete set null,
          index idx_problem_reports_device_group (device_group_code),
          index fk_problem_reports_device (device_id),
          index fk_problem_reports_created_by (created_by)
        )
      `);
      await connection.query(`
        create table if not exists problem_report_assignees (
          problem_report_id varchar(64) not null,
          user_id varchar(64) not null,
          primary key (problem_report_id, user_id),
          constraint fk_problem_report_assignees_report foreign key (problem_report_id) references problem_reports(id) on delete cascade,
          constraint fk_problem_report_assignees_user foreign key (user_id) references users(id) on delete cascade,
          index fk_problem_report_assignees_user (user_id)
        )
      `);
      await connection.query(`
        create table if not exists form_one_records (
          id varchar(64) primary key,
          device_id varchar(64) not null,
          device_group_code varchar(80) not null,
          garden_label varchar(180) not null,
          phone varchar(80) null,
          submitted_date date not null,
          due_date date null,
          due_dates json null,
          due_date_change_count int not null default 0,
          status enum('in_progress', 'completion_requested', 'completed') not null default 'in_progress',
          completion_requested_at datetime null,
          completion_requested_by varchar(64) null,
          completed_at datetime null,
          completed_by varchar(64) null,
          rejection_comments json null,
          items json not null,
          created_by varchar(64) null,
          created_at timestamp not null default current_timestamp,
          updated_at timestamp not null default current_timestamp on update current_timestamp,
          constraint fk_form_one_records_device foreign key (device_id) references devices(id) on delete cascade,
          constraint fk_form_one_records_created_by foreign key (created_by) references users(id) on delete set null,
          index idx_form_one_records_device_group (device_group_code),
          index fk_form_one_records_device (device_id),
          index fk_form_one_records_created_by (created_by)
        )
      `);
      const formOneColumns = await getTableColumns(connection, "form_one_records");
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "due_date",
        "due_date date null after submitted_date",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "due_dates",
        "due_dates json null after due_date",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "due_date_change_count",
        "due_date_change_count int not null default 0 after due_dates",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "status",
        "status enum('in_progress', 'completion_requested', 'completed') not null default 'in_progress' after due_date_change_count",
      );
      await connection.query(
        "alter table form_one_records modify status enum('in_progress', 'completion_requested', 'completed') not null default 'in_progress'",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "completion_requested_at",
        "completion_requested_at datetime null after status",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "completion_requested_by",
        "completion_requested_by varchar(64) null after completion_requested_at",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "completed_at",
        "completed_at datetime null after completion_requested_by",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "completed_by",
        "completed_by varchar(64) null after completed_at",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "rejection_comments",
        "rejection_comments json null after completed_by",
      );
      await connection.query(`
        create table if not exists form_one_notifications (
          id varchar(64) primary key,
          record_id varchar(64) not null,
          type varchar(40) not null,
          recipient_user_id varchar(64) null,
          recipient_role varchar(80) null,
          recipient_device_group_code varchar(80) null,
          comment_text text null,
          created_by varchar(64) null,
          read_at datetime null,
          created_at timestamp not null default current_timestamp,
          constraint fk_form_one_notifications_record foreign key (record_id) references form_one_records(id) on delete cascade,
          index fk_form_one_notifications_record (record_id),
          index idx_form_one_notifications_user (recipient_user_id, read_at),
          index idx_form_one_notifications_group (recipient_device_group_code, read_at),
          index idx_form_one_notifications_role (recipient_role, read_at)
        )
      `);
      await ensureTaskTagCatalog(connection);
      await ensureProblemReportAccess(connection);
      await ensureGardenUsersForDevices(connection);
    })
      .then(() => undefined)
      .catch((error) => {
        operationalSchemaPromise = null;
        throw error;
      });
  }

  await operationalSchemaPromise;
}

async function getTableColumns(connection: PoolConnection, tableName: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `
      select column_name
      from information_schema.columns
      where table_schema = database()
        and table_name = ?
    `,
    [tableName],
  );

  return new Set(rows.map((row) => String(row.column_name)));
}

async function addColumnIfMissing(
  connection: PoolConnection,
  columns: Set<string>,
  tableName:
    | "devices"
    | "tasks"
    | "users"
    | "monitored_devices"
    | "form_one_records",
  columnName: string,
  columnDefinition: string,
) {
  if (columns.has(columnName)) {
    return false;
  }

  try {
    await connection.query(`alter table ${tableName} add column ${columnDefinition}`);
    columns.add(columnName);
    return true;
  } catch (error) {
    if (isDuplicateColumnError(error)) {
      columns.add(columnName);
      return false;
    }

    throw error;
  }
}

async function addIndexIfMissing(
  connection: PoolConnection,
  tableName: "users" | "monitored_devices",
  indexName: string,
  columnName: string,
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `
      select index_name
      from information_schema.statistics
      where table_schema = database()
        and table_name = ?
        and index_name = ?
      limit 1
    `,
    [tableName, indexName],
  );

  if (rows.length) {
    return;
  }

  try {
    await connection.query(
      `alter table ${tableName} add index ${indexName} (${columnName})`,
    );
  } catch (error) {
    if (isDuplicateIndexError(error)) {
      return;
    }

    throw error;
  }
}

function isDuplicateColumnError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_FIELDNAME"
  );
}

function isDuplicateIndexError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_KEYNAME"
  );
}

async function ensureProblemReportAccess(connection: PoolConnection) {
  await connection.query<ResultSetHeader>(
    `
      insert into roles (id, name, label)
      values (?, ?, ?)
      on duplicate key update label = values(label)
    `,
    [makeStableId("role", GARDEN_ROLE_NAME), GARDEN_ROLE_NAME, GARDEN_ROLE_LABEL],
  );
  await connection.query<ResultSetHeader>(
    `
      insert into roles (id, name, label)
      values (?, ?, ?)
      on duplicate key update label = values(label)
    `,
    [
      makeStableId("role", OUTSOURCING_ROLE_NAME),
      OUTSOURCING_ROLE_NAME,
      OUTSOURCING_ROLE_LABEL,
    ],
  );

  for (const permission of ACCESS_PERMISSIONS) {
    const [pageKey, actionKey] = permission.code.split(".");
    await connection.query<ResultSetHeader>(
      `
        insert into permissions (id, code, label, page_key, action_key)
        values (?, ?, ?, ?, ?)
        on duplicate key update
          label = values(label),
          page_key = values(page_key),
          action_key = values(action_key)
      `,
      [
        makeStableId("perm", permission.code),
        permission.code,
        permission.label,
        pageKey,
        actionKey,
      ],
    );

    if (permission.roles.length) {
      await connection.query<ResultSetHeader>(
        `
          insert ignore into role_permissions (role_id, permission_id)
          select r.id, p.id
          from roles r
          join permissions p on p.code = ?
          where r.name in (?)
        `,
        [permission.code, permission.roles],
      );
    }
  }
}

async function ensureTaskTagCatalog(connection: PoolConnection) {
  await connection.query(`
    create table if not exists task_tags (
      id varchar(64) primary key,
      name varchar(120) not null unique,
      created_at timestamp not null default current_timestamp
    )
  `);

  const tagNames = new Set<string>(
    taskTagCatalog.map(normalizeTaskTagName).filter(Boolean),
  );

  for (const tableName of ["tasks", "problem_reports"] as const) {
    const [rows] = await connection.query<TaggedJsonRow[]>(
      `select id, tags from ${tableName} where tags is not null`,
    );
    for (const row of rows) {
      normalizeTaskTags(row.tags).forEach((tagName) => tagNames.add(tagName));
    }
  }

  for (const tagName of tagNames) {
    await connection.query<ResultSetHeader>(
      `
        insert into task_tags (id, name)
        values (?, ?)
        on duplicate key update name = values(name)
      `,
      [makeStableId("tasktag", tagName), tagName],
    );
  }
}

async function ensureGardenUsersForDevices(connection: PoolConnection) {
  const [roleRows] = await connection.query<RoleIdRow[]>(
    "select id from roles where name = ? limit 1",
    [GARDEN_ROLE_NAME],
  );
  const gardenRoleId = roleRows[0]?.id;
  if (!gardenRoleId) {
    return;
  }

  const [deviceRows] = await connection.query<RowDataPacket[]>(
    "select code, name from devices where is_excluded = false order by code",
  );
  const groups = new Map<string, string>();
  const invalidGeneratedGroups = new Set<string>();
  for (const row of deviceRows) {
    const code = String(row.code || "");
    const name = String(row.name || "");
    const groupCode = getDeviceGroupCode({ code, name });
    const codeOnlyGroup = normalizeDeviceGroupCode(code);
    if (codeOnlyGroup && codeOnlyGroup !== groupCode) {
      invalidGeneratedGroups.add(codeOnlyGroup);
    }
    if (groupCode && !groups.has(groupCode)) {
      groups.set(groupCode, name || `X-Station ${groupCode}`);
    }
  }

  if (invalidGeneratedGroups.size) {
    await connection.query<ResultSetHeader>(
      `
        update users u
        join roles r on r.id = u.role_id and r.name = ?
        set u.is_active = false
        where u.email like 'xstation-%@local.ge'
          and u.device_group_code in (?)
      `,
      [GARDEN_ROLE_NAME, [...invalidGeneratedGroups]],
    );
  }

  for (const [groupCode, deviceName] of groups) {
    const [existingRows] = await connection.query<RowDataPacket[]>(
      `
        select id
        from users
        where is_active = true and device_group_code = ?
        limit 1
      `,
      [groupCode],
    );

    if (existingRows.length) {
      continue;
    }

    const email = `xstation-${groupCode}@local.ge`;
    const initials = groupCode.slice(0, 3).toUpperCase();
    const passwordHash = await bcrypt.hash(randomBytes(24).toString("base64"), 10);
    await connection.query<ResultSetHeader>(
      `
        insert into users
          (id, role_id, name, email, password_hash, initials, color, device_group_code, must_change_password)
        values (?, ?, ?, ?, ?, ?, ?, ?, true)
        on duplicate key update
          role_id = values(role_id),
          name = values(name),
          initials = values(initials),
          device_group_code = values(device_group_code),
          is_active = true
      `,
      [
        makeStableId("garden", groupCode),
        gardenRoleId,
        `ბაღი ${groupCode}`,
        email,
        passwordHash,
        initials || "BG",
        "#0f766e",
        groupCode,
      ],
    );

    void deviceName;
  }
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  await ensureOperationalSchema();

  const rows = await queryRows<UserRow>(
    `
      select
        u.id,
        u.name,
        u.email,
        r.name as role_name,
        u.initials,
        u.color,
        u.device_group_code,
        u.password_hash,
        u.must_change_password,
        group_concat(distinct p.code order by p.code separator ',') as permissions
      from users u
      join roles r on r.id = u.role_id
      left join role_permissions rp on rp.role_id = r.id
      left join permissions p on p.id = rp.permission_id
      where u.email = ? and u.is_active = true
      group by u.id, r.name
      limit 1
    `,
    [email],
  );

  if (!rows) {
    return (
      mockUsers.find(
        (user) => user.email.toLowerCase() === email.toLowerCase(),
      ) ?? null
    );
  }

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role_name,
    initials: row.initials,
    color: row.color,
    deviceGroupCode: row.device_group_code ?? undefined,
    passwordHash: row.password_hash,
    mustChangePassword: Boolean(row.must_change_password),
    permissions: csv(row.permissions) as PermissionKey[],
  };
}

export async function getUserByLogin(identifier: string): Promise<AppUser | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("@")) {
    return getUserByEmail(normalized);
  }

  await ensureOperationalSchema();
  const deviceGroupCode = normalizeDeviceGroupCode(normalized);
  const rows = await queryRows<UserRow>(
    `
      select
        u.id,
        u.name,
        u.email,
        r.name as role_name,
        u.initials,
        u.color,
        u.device_group_code,
        u.password_hash,
        u.must_change_password,
        group_concat(distinct p.code order by p.code separator ',') as permissions
      from users u
      join roles r on r.id = u.role_id
      left join role_permissions rp on rp.role_id = r.id
      left join permissions p on p.id = rp.permission_id
      where u.device_group_code = ? and u.is_active = true
      group by u.id, r.name
      limit 1
    `,
    [deviceGroupCode],
  );

  if (!rows) {
    return (
      mockUsers.find(
        (user) => normalizeDeviceGroupCode(user.deviceGroupCode) === deviceGroupCode,
      ) ?? null
    );
  }

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role_name,
    initials: row.initials,
    color: row.color,
    deviceGroupCode: row.device_group_code ?? undefined,
    passwordHash: row.password_hash,
    mustChangePassword: Boolean(row.must_change_password),
    permissions: csv(row.permissions) as PermissionKey[],
  };
}

function toPublicUser(user: AppUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials,
    color: user.color,
    deviceGroupCode: user.deviceGroupCode,
    mustChangePassword: user.mustChangePassword,
    permissions: user.permissions,
  };
}

export async function getUsers(): Promise<SessionUser[]> {
  await ensureOperationalSchema();

  const rows = await queryRows<UserRow>(
    `
      select
        u.id,
        u.name,
        u.email,
        r.name as role_name,
        u.initials,
        u.color,
        u.device_group_code,
        u.must_change_password,
        group_concat(distinct p.code order by p.code separator ',') as permissions
      from users u
      join roles r on r.id = u.role_id
      left join role_permissions rp on rp.role_id = r.id
      left join permissions p on p.id = rp.permission_id
      where u.is_active = true
      group by u.id, r.name
      order by u.name
    `,
  );

  if (!rows) {
    return mockUsers.map(toPublicUser);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role_name,
    initials: row.initials,
    color: row.color,
    deviceGroupCode: row.device_group_code ?? undefined,
    mustChangePassword: Boolean(row.must_change_password),
    permissions: csv(row.permissions) as PermissionKey[],
  }));
}

export async function getUserById(id: string): Promise<SessionUser | null> {
  const users = await getUsers();
  return users.find((user) => user.id === id) ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  role: string;
  initials: string;
  color: string;
  passwordHash: string;
}): Promise<SessionUser> {
  const id = makeId("u");
  const inserted = await withConnection(async (connection) => {
    const [roleRows] = await connection.query(
      "select id from roles where name = ? limit 1",
      [input.role],
    );
    const roleId = (roleRows as { id: string }[])[0]?.id;
    if (!roleId) {
      throw new Error("Role not found");
    }

    await connection.query<ResultSetHeader>(
      `
        insert into users (id, role_id, name, email, password_hash, initials, color, must_change_password)
        values (?, ?, ?, ?, ?, ?, ?, true)
      `,
      [
        id,
        roleId,
        input.name,
        input.email,
        input.passwordHash,
        input.initials,
        input.color,
      ],
    );

    return getUserById(id);
  });

  return (
    inserted ?? {
      id,
      name: input.name,
      email: input.email,
      role: input.role,
      initials: input.initials,
      color: input.color,
      permissions: [],
    }
  );
}

export async function updateUser(
  id: string,
  input: {
    name: string;
    email: string;
    role: string;
    initials: string;
    color: string;
    passwordHash?: string;
  },
): Promise<SessionUser | null> {
  const updated = await withConnection(async (connection) => {
    const [roleRows] = await connection.query(
      "select id from roles where name = ? limit 1",
      [input.role],
    );
    const roleId = (roleRows as { id: string }[])[0]?.id;
    if (!roleId) {
      throw new Error("Role not found");
    }

    if (input.passwordHash) {
      await connection.query<ResultSetHeader>(
        `
          update users
          set role_id = ?, name = ?, email = ?, password_hash = ?, initials = ?, color = ?, must_change_password = true
          where id = ? and is_active = true
        `,
        [
          roleId,
          input.name,
          input.email,
          input.passwordHash,
          input.initials,
          input.color,
          id,
        ],
      );
    } else {
      await connection.query<ResultSetHeader>(
        `
          update users
          set role_id = ?, name = ?, email = ?, initials = ?, color = ?
          where id = ? and is_active = true
        `,
        [roleId, input.name, input.email, input.initials, input.color, id],
      );
    }

    return getUserById(id);
  });

  return updated ?? null;
}

export async function deleteUser(id: string) {
  const deleted = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      "update users set is_active = false where id = ? and is_active = true",
      [id],
    );
    return result.affectedRows > 0;
  });

  return deleted ?? false;
}

export async function changeUserPassword(
  id: string,
  newPasswordHash: string,
): Promise<boolean> {
  const updated = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `
        update users
        set password_hash = ?, must_change_password = false
        where id = ? and is_active = true
      `,
      [newPasswordHash, id],
    );
    return result.affectedRows > 0;
  });

  return updated ?? false;
}

let fallbackRoles: AppRole[] = [
  {
    id: "role-admin",
    name: "admin",
    label: "ადმინისტრატორი",
    permissions: [
      "dashboard.view",
      "dashboard.create",
      "dashboard.edit",
      "dashboard.delete",
      "devices.view",
      "devices.create",
      "devices.edit",
      "devices.delete",
      "tasks.view",
      "tasks.create",
      "tasks.edit",
      "tasks.delete",
      "tasks.tag_create",
      "tasks.tag_delete",
      "problem_reports.view",
      "problem_reports.create",
      "problem_reports.edit",
      "problem_reports.delete",
      "problem_reports.assign",
      "problem_reports.tag",
      "problem_reports.tag_create",
      "problem_reports.tag_delete",
      "problem_reports.status",
      "form_one.view",
      "form_one.create",
      "form_one.edit",
      "form_one.garden_edit",
      "form_one.phone_edit",
      "form_one.due_date_edit",
      "form_one.model_add",
      "form_one.model_edit",
      "form_one.service_add",
      "form_one.service_edit",
      "form_one.service_delete",
      "form_one.quantity_edit",
      "form_one.completion_request",
      "form_one.completion_response",
      "form_one.delete",
      "form_one.comment_edit",
      "regions.view",
      "regions.create",
      "regions.edit",
      "regions.delete",
      "offline_records.view",
      "offline_records.create",
      "offline_records.edit",
      "offline_records.delete",
      "users.view",
      "users.create",
      "users.edit",
      "users.delete",
      "permissions.view",
      "permissions.create",
      "permissions.edit",
      "permissions.delete",
      "analytics.view",
      "analytics.create",
      "analytics.edit",
      "analytics.delete",
    ],
  },
  {
    id: "role-dispatcher",
    name: "dispatcher",
    label: "დისპეტჩერი",
    permissions: [
      "dashboard.view",
      "devices.view",
      "devices.create",
      "devices.edit",
      "tasks.view",
      "tasks.create",
      "tasks.edit",
      "tasks.tag_create",
      "problem_reports.view",
      "problem_reports.create",
      "problem_reports.edit",
      "problem_reports.assign",
      "problem_reports.tag",
      "problem_reports.tag_create",
      "problem_reports.status",
      "form_one.view",
      "form_one.create",
      "form_one.edit",
      "form_one.garden_edit",
      "form_one.phone_edit",
      "form_one.due_date_edit",
      "form_one.model_add",
      "form_one.model_edit",
      "form_one.service_add",
      "form_one.service_edit",
      "form_one.service_delete",
      "form_one.quantity_edit",
      "form_one.completion_request",
      "form_one.comment_edit",
      "regions.view",
      "offline_records.view",
      "offline_records.create",
      "offline_records.edit",
      "analytics.view",
    ],
  },
  {
    id: "role-technician",
    name: "technician",
    label: "ტექნიკოსი",
    permissions: [
      "dashboard.view",
      "devices.view",
      "devices.edit",
      "tasks.view",
      "tasks.edit",
      "problem_reports.view",
      "form_one.view",
      "regions.view",
      "offline_records.view",
      "offline_records.edit",
      "analytics.view",
    ],
  },
  {
    id: "role-outsourcing",
    name: OUTSOURCING_ROLE_NAME,
    label: OUTSOURCING_ROLE_LABEL,
    permissions: [
      "dashboard.view",
      "devices.view",
      "problem_reports.view",
      "form_one.view",
      "form_one.create",
      "form_one.edit",
      "form_one.garden_edit",
      "form_one.phone_edit",
      "form_one.due_date_edit",
      "form_one.model_add",
      "form_one.model_edit",
      "form_one.service_add",
      "form_one.service_edit",
      "form_one.service_delete",
      "form_one.quantity_edit",
      "form_one.completion_request",
      "form_one.comment_edit",
    ],
  },
  {
    id: "role-viewer",
    name: "viewer",
    label: "მხოლოდ ნახვა",
    permissions: [
      "dashboard.view",
      "devices.view",
      "tasks.view",
      "problem_reports.view",
      "form_one.view",
      "regions.view",
      "offline_records.view",
      "analytics.view",
    ],
  },
  {
    id: "role-garden",
    name: GARDEN_ROLE_NAME,
    label: GARDEN_ROLE_LABEL,
    permissions: [
      "problem_reports.view",
      "problem_reports.create",
      "form_one.view",
      "form_one.completion_response",
    ],
  },
];

export async function getRoles(): Promise<AppRole[]> {
  await ensureOperationalSchema();

  const rows = await queryRows<RoleRow>(
    `
      select
        r.id,
        r.name,
        r.label,
        group_concat(distinct p.code order by p.code separator ',') as permissions
      from roles r
      left join role_permissions rp on rp.role_id = r.id
      left join permissions p on p.id = rp.permission_id
      group by r.id
      order by field(r.name, 'admin', 'dispatcher', 'technician', 'viewer', 'garden'), r.name
    `,
  );

  if (!rows) {
    return fallbackRoles;
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    label: row.label,
    permissions: csv(row.permissions) as PermissionKey[],
  }));
}

export async function createRole(input: {
  name: string;
  label: string;
}): Promise<AppRole | null> {
  const name = input.name.trim().toLowerCase();
  const label = input.label.trim();
  if (!name || !label) {
    return null;
  }

  const created = await withConnection(async (connection) => {
    const [existingRows] = await connection.query<RoleIdRow[]>(
      "select id from roles where name = ? limit 1",
      [name],
    );
    if (existingRows.length) {
      return null;
    }

    const id = makeStableId("role", name);
    await connection.query<ResultSetHeader>(
      "insert into roles (id, name, label) values (?, ?, ?)",
      [id, name, label],
    );

    return getRoles().then(
      (roles) => roles.find((role) => role.name === name) ?? null,
    );
  });

  if (created !== null) {
    return created;
  }

  if (fallbackRoles.some((role) => role.name === name)) {
    return null;
  }
  const role = { id: makeStableId("role", name), name, label, permissions: [] };
  fallbackRoles = [...fallbackRoles, role];
  return role;
}

export async function updateRolePermissions(
  roleId: string,
  permissions: PermissionKey[],
) {
  const uniquePermissions = [...new Set(permissions)];
  const updated = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [roleRows] = await connection.query<RoleIdRow[]>(
        "select id from roles where id = ? limit 1 for update",
        [roleId],
      );
      if (!roleRows.length) {
        await connection.rollback();
        return null;
      }

      for (const permission of uniquePermissions) {
        const [pageKey, actionKey] = permission.split(".");
        await connection.query<ResultSetHeader>(
          `
            insert into permissions (id, code, label, page_key, action_key)
            values (?, ?, ?, ?, ?)
            on duplicate key update
              label = values(label),
              page_key = values(page_key),
              action_key = values(action_key)
          `,
          [
            makeStableId("perm", permission),
            permission,
            permission,
            pageKey,
            actionKey,
          ],
        );
      }

      await connection.query("delete from role_permissions where role_id = ?", [
        roleId,
      ]);

      if (uniquePermissions.length) {
        await connection.query(
          `
            insert ignore into role_permissions (role_id, permission_id)
            select ?, id from permissions where code in (?)
          `,
          [roleId, uniquePermissions],
        );
      }

      await connection.commit();
      return getRoles().then(
        (roles) => roles.find((role) => role.id === roleId) ?? null,
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return updated ?? null;
}

export async function getDevices(): Promise<Device[]> {
  if (isBuildTime()) {
    return mockDevices;
  }

  await ensureBiostarDeviceSync();
  await ensureOperationalSchema();

  const rows = await queryRows<DeviceRow>(
    `
      select
        d.id,
        d.code,
        d.name,
        d.status,
        d.is_excluded,
        coalesce(r.name, 'დაუნაწილებელი') as region,
        d.latitude,
        d.longitude,
        d.last_seen_at,
        group_concat(distinct t.name order by t.name separator ',') as tags,
        group_concat(distinct ad.name order by ad.name separator ',') as associated_devices
      from devices d
      left join regions r on r.id = d.region_id
      left join device_tags dt on dt.device_id = d.id
      left join tags t on t.id = dt.tag_id
      left join associated_devices ad on ad.device_id = d.id
      group by d.id, r.name
      order by d.code
    `,
  );

  if (!rows) {
    return mockDevices;
  }

  const eventRows = rows.length
    ? await queryRows<StatusEventRow>(
        `
          select id, device_id, status, happened_at, duration_minutes
          from status_events
          where device_id in (?)
          order by happened_at desc
        `,
        [rows.map((row) => row.id)],
      )
    : [];
  const eventsByDevice = new Map<string, StatusEvent[]>();
  (eventRows ?? []).forEach((row) => {
    const events = eventsByDevice.get(row.device_id) ?? [];
    events.push({
      id: row.id,
      deviceId: row.device_id,
      status: row.status,
      happenedAt: toDateTimeString(row.happened_at),
      durationMinutes: row.duration_minutes ?? undefined,
    });
    eventsByDevice.set(row.device_id, events);
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    isExcluded: toBoolean(row.is_excluded),
    region: row.region,
    tags: csv(row.tags),
    position: clampLatLng({
      lat: Number(row.latitude),
      lng: Number(row.longitude),
    }),
    lastSeenAt: toDateTimeString(row.last_seen_at),
    associatedDevices: csv(row.associated_devices),
    problems: [],
    statusEvents: eventsByDevice.get(row.id) ?? [],
  }));
}

export async function getRegions(): Promise<Region[]> {
  const rows = await queryRows<RegionRow>(
    "select id, name, color from regions order by name",
  );

  if (!rows) {
    return fallbackRegionNames.map((name, index) => ({
      id: makeStableId("region", name),
      name,
      color: DEFAULT_REGION_COLORS[index % DEFAULT_REGION_COLORS.length],
    }));
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
  }));
}

export async function getTaskTagNames(): Promise<string[]> {
  if (isBuildTime()) {
    return [...taskTagCatalog];
  }

  await ensureOperationalSchema();

  const rows = await queryRows<TaskTagRow>(
    "select name from task_tags order by name",
  );

  if (!rows) {
    return [...fallbackTaskTagNames];
  }

  return rows.map((row) => row.name);
}

export async function getDeviceTagNames(): Promise<string[]> {
  if (isBuildTime()) {
    return [
      ...new Set([
        ...fallbackDeviceTagNames,
        ...mockDevices.flatMap((device) => device.tags),
      ]),
    ].sort((a, b) => a.localeCompare(b, "ka"));
  }

  await ensureOperationalSchema();

  const rows = await queryRows<TaskTagRow>(
    "select name from tags order by name",
  );

  if (!rows) {
    return [
      ...new Set([
        ...fallbackDeviceTagNames,
        ...mockDevices.flatMap((device) => device.tags),
      ]),
    ].sort((a, b) => a.localeCompare(b, "ka"));
  }

  return rows.map((row) => row.name);
}

export async function createDeviceTag(name: string) {
  const tagName = normalizeTaskTagName(name);
  if (!tagName) {
    return null;
  }

  await ensureOperationalSchema();

  const created = await withConnection(async (connection) => {
    await connection.query<ResultSetHeader>(
      `
        insert into tags (id, name, color)
        values (?, ?, ?)
        on duplicate key update name = values(name)
      `,
      [makeStableId("tag", tagName), tagName, "#64748b"],
    );

    return tagName;
  });

  if (created !== null) {
    return created;
  }

  fallbackDeviceTagNames = [
    ...new Set([...fallbackDeviceTagNames, tagName].map(normalizeTaskTagName)),
  ].filter(Boolean);
  return tagName;
}

export async function deleteDeviceTag(name: string) {
  const tagName = normalizeTaskTagName(name);
  if (!tagName) {
    return false;
  }

  await ensureOperationalSchema();

  const deleted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query<ResultSetHeader>(
        `
          delete dt
          from device_tags dt
          join tags t on t.id = dt.tag_id
          where t.name = ?
        `,
        [tagName],
      );
      await connection.query<ResultSetHeader>(
        "delete from tags where name = ?",
        [tagName],
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  if (deleted !== null) {
    return deleted;
  }

  fallbackDeviceTagNames = fallbackDeviceTagNames.filter(
    (tag) => tag !== tagName,
  );
  mockDevices.forEach((device) => {
    device.tags = device.tags.filter((tag) => tag !== tagName);
  });
  return true;
}

export async function createTaskTag(name: string) {
  const tagName = normalizeTaskTagName(name);
  if (!tagName) {
    return null;
  }

  await ensureOperationalSchema();

  const created = await withConnection(async (connection) => {
    await connection.query<ResultSetHeader>(
      `
        insert into task_tags (id, name)
        values (?, ?)
        on duplicate key update name = values(name)
      `,
      [makeStableId("tasktag", tagName), tagName],
    );

    return tagName;
  });

  if (created !== null) {
    return created;
  }

  fallbackTaskTagNames = [
    ...new Set([...fallbackTaskTagNames, tagName].map(normalizeTaskTagName)),
  ].filter(Boolean);
  return tagName;
}

export async function deleteTaskTag(name: string) {
  const tagName = normalizeTaskTagName(name);
  if (!tagName) {
    return false;
  }

  await ensureOperationalSchema();

  const deleted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [result] = await connection.query<ResultSetHeader>(
        "delete from task_tags where name = ?",
        [tagName],
      );

      await removeTaskTagReferences(connection, tagName);
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  if (deleted !== null) {
    return deleted;
  }

  const hadTag = fallbackTaskTagNames.includes(tagName);
  fallbackTaskTagNames = fallbackTaskTagNames.filter((tag) => tag !== tagName);
  return hadTag;
}

export async function createRegion(input: {
  name: string;
  color: string;
}): Promise<Region> {
  const id = makeId("region");
  const inserted = await withConnection(async (connection) => {
    await connection.query<ResultSetHeader>(
      "insert into regions (id, name, color) values (?, ?, ?)",
      [id, input.name, input.color],
    );
    return { id, name: input.name, color: input.color };
  });

  return inserted ?? { id, name: input.name, color: input.color };
}

export async function updateRegion(
  id: string,
  input: { name: string; color: string },
): Promise<Region | null> {
  const updated = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      "update regions set name = ?, color = ? where id = ?",
      [input.name, input.color, id],
    );
    if (!result.affectedRows) {
      return null;
    }

    return { id, name: input.name, color: input.color };
  });

  return updated ?? null;
}

export async function deleteRegion(id: string) {
  const deleted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query("update devices set region_id = null where region_id = ?", [
        id,
      ]);
      const [result] = await connection.query<ResultSetHeader>(
        "delete from regions where id = ?",
        [id],
      );
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return deleted ?? false;
}

export async function getDeviceById(id: string): Promise<Device | null> {
  const devices = await getDevices();
  return devices.find((device) => device.id === id) ?? null;
}

async function getRegionIdByName(
  connection: PoolConnection,
  regionName?: string | null,
) {
  const normalizedRegion = normalizeRegionName(regionName);
  if (!normalizedRegion) {
    return null;
  }

  const [rows] = await connection.query(
    "select id from regions where name = ? limit 1",
    [normalizedRegion],
  );
  return (rows as { id: string }[])[0]?.id ?? null;
}

async function replaceDeviceTags(
  connection: PoolConnection,
  deviceId: string,
  tags: string[],
) {
  const uniqueTags = [...new Set(tags.map((tag) => tag.trim()))].filter(
    Boolean,
  );

  await connection.query("delete from device_tags where device_id = ?", [
    deviceId,
  ]);

  for (const tagName of uniqueTags) {
    await connection.query<ResultSetHeader>(
      `
        insert into tags (id, name, color)
        values (?, ?, ?)
        on duplicate key update name = values(name)
      `,
      [makeStableId("tag", tagName), tagName, "#64748b"],
    );
  }

  if (uniqueTags.length) {
    await connection.query(
      `
        insert ignore into device_tags (device_id, tag_id)
        select ?, id from tags where name in (?)
      `,
      [deviceId, uniqueTags],
    );
  }
}

async function removeTaskTagReferences(
  connection: PoolConnection,
  tagName: string,
) {
  for (const tableName of ["tasks", "problem_reports"] as const) {
    const [rows] = await connection.query<TaggedJsonRow[]>(
      `select id, tags from ${tableName} where tags is not null`,
    );

    for (const row of rows) {
      const tags = normalizeTaskTags(row.tags);
      const nextTags = tags.filter((tag) => tag !== tagName);
      if (nextTags.length === tags.length) {
        continue;
      }

      await connection.query<ResultSetHeader>(
        `update ${tableName} set tags = cast(? as json) where id = ?`,
        [JSON.stringify(nextTags), row.id],
      );
    }
  }
}

export async function createDevice(input: {
  code: string;
  name: string;
  status: DeviceStatus;
  isExcluded?: boolean;
  region?: string | null;
  position: LatLng;
  tags: string[];
}): Promise<Device> {
  await ensureOperationalSchema();

  const id = makeId("dev");
  const now = new Date().toISOString();
  const inserted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const regionId = await getRegionIdByName(connection, input.region);
      const position = clampLatLng(input.position);
      await connection.query<ResultSetHeader>(
        `
          insert into devices
            (id, code, name, status, is_excluded, region_id, latitude, longitude, last_seen_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          input.code,
          input.name,
          input.status,
          Boolean(input.isExcluded),
          regionId,
          position.lat,
          position.lng,
          toSqlDateTime(new Date()),
        ],
      );
      await replaceDeviceTags(connection, id, input.tags);
      await connection.commit();
      return getDeviceById(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return (
    inserted ?? {
      id,
      code: input.code,
      name: input.name,
      status: input.status,
      isExcluded: Boolean(input.isExcluded),
      region: normalizeRegionName(input.region) ?? UNASSIGNED_REGION,
      tags: input.tags,
      position: clampLatLng(input.position),
      lastSeenAt: now,
      associatedDevices: [],
      problems: [],
      statusEvents: [],
    }
  );
}

export async function updateDevice(
  id: string,
  input: {
    code: string;
    name: string;
    status: DeviceStatus;
    isExcluded: boolean;
    region?: string | null;
    position: LatLng;
    tags: string[];
  },
): Promise<Device | null> {
  await ensureOperationalSchema();

  const updated = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const regionId = await getRegionIdByName(connection, input.region);
      const position = clampLatLng(input.position);
      const [existingRows] = await connection.query<RowDataPacket[]>(
        "select status from devices where id = ? limit 1 for update",
        [id],
      );
      const previousStatus = normalizeDeviceStatus(existingRows[0]?.status);
      const [result] = await connection.query<ResultSetHeader>(
        `
          update devices
          set
            code = ?,
            name = ?,
            status = ?,
            is_excluded = ?,
            region_id = ?,
            latitude = ?,
            longitude = ?
          where id = ?
        `,
        [
          input.code,
          input.name,
          input.status,
          input.isExcluded,
          regionId,
          position.lat,
          position.lng,
          id,
        ],
      );

      if (!result.affectedRows) {
        await connection.rollback();
        return null;
      }

      await replaceDeviceTags(connection, id, input.tags);
      if (input.isExcluded) {
        await connection.query(
          "update monitored_devices set is_active = false where device_id = ?",
          [id],
        );
      } else {
        await updateMonitoredDeviceStatus(
          connection,
          id,
          input.status,
          new Date(),
          previousStatus,
        );
      }
      await connection.commit();
      return getDeviceById(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return updated ?? null;
}

export async function updateDevicePosition(
  id: string,
  position: LatLng,
): Promise<Device | null> {
  await ensureOperationalSchema();

  const location = clampLatLng(position);
  const updated = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `
        update devices
        set latitude = ?, longitude = ?
        where id = ?
      `,
      [location.lat, location.lng, id],
    );

    if (!result.affectedRows) {
      return null;
    }

    return getDeviceById(id);
  });

  return updated ?? null;
}

export async function deleteDevice(id: string) {
  const deleted = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      "delete from devices where id = ?",
      [id],
    );
    return result.affectedRows > 0;
  });

  return deleted ?? false;
}

export async function ensureTodayOfflineSnapshot() {
  if (isBuildTime()) {
    return null;
  }

  if (getTbilisiHour() < 9) {
    return null;
  }

  return captureDailyOfflineSnapshot();
}

export async function captureDailyOfflineSnapshot(value = new Date()) {
  if (isBuildTime()) {
    return null;
  }

  try {
    await syncBiostarDevices({ force: true });
  } catch (error) {
    console.warn(
      `[biostar] ${error instanceof Error ? error.message : "Snapshot sync failed"}`,
    );
  }

  await ensureOperationalSchema();

  const snapshotDate = getTbilisiDateKey(value);
  const capturedAt = toSqlDateTime(value);
  const snapshotId = `offline-${snapshotDate}`;

  const inserted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [existingRows] = await connection.query(
        "select id from offline_snapshots where snapshot_date = ? limit 1",
        [snapshotDate],
      );
      const existingSnapshot = (existingRows as { id: string }[])[0];

      if (existingSnapshot) {
        await connection.commit();
        return existingSnapshot.id;
      }

      await connection.query<ResultSetHeader>(
        `
          insert into offline_snapshots (id, snapshot_date, captured_at)
          values (?, ?, ?)
        `,
        [snapshotId, snapshotDate, capturedAt],
      );

      const [offlineRows] = await connection.query(
        `
          select id, code, name, biostar_payload
          from devices
          where status = 'offline' and is_excluded = false
          order by code
        `,
      );
      const offlineDevices = offlineRows as {
        id: string;
        code: string;
        name: string;
        biostar_payload: unknown;
      }[];

      if (offlineDevices.length) {
        await connection.query<ResultSetHeader>(
          `
            insert into offline_snapshot_devices
              (snapshot_id, device_id, device_code, device_name, raw_payload)
            values ${offlineDevices.map(() => "(?, ?, ?, ?, cast(? as json))").join(", ")}
          `,
          offlineDevices.flatMap((device) => [
            snapshotId,
            device.id,
            device.code,
            device.name,
            JSON.stringify(device.biostar_payload ?? {}),
          ]),
        );
      }

      await connection.commit();
      return snapshotId;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  if (!inserted) {
    return getMockOfflineSnapshots().find(
      (snapshot) => snapshot.date === snapshotDate,
    );
  }

  const snapshots = await getOfflineSnapshots(snapshotDate, snapshotDate);
  return snapshots[0] ?? null;
}

export async function getOfflineSnapshots(fromDate?: string, toDate?: string) {
  if (isBuildTime()) {
    return filterOfflineSnapshots(getMockOfflineSnapshots(), fromDate, toDate);
  }

  await ensureOperationalSchema();

  const filters: string[] = [];
  const params: string[] = [];

  if (fromDate) {
    filters.push("snapshot_date >= ?");
    params.push(fromDate);
  }

  if (toDate) {
    filters.push("snapshot_date <= ?");
    params.push(toDate);
  }

  const rows = await queryRows<OfflineSnapshotRow>(
    `
      select id, snapshot_date, captured_at
      from offline_snapshots
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
      order by snapshot_date desc
    `,
    params,
  );

  if (!rows) {
    return filterOfflineSnapshots(getMockOfflineSnapshots(), fromDate, toDate);
  }

  if (!rows.length) {
    return [];
  }

  const deviceRows = await queryRows<OfflineSnapshotDeviceRow>(
    `
      select
        osd.snapshot_id,
        osd.device_id,
        osd.device_code,
        osd.device_name
      from offline_snapshot_devices osd
      join devices d on d.id = osd.device_id and d.is_excluded = false
      where osd.snapshot_id in (?)
      order by osd.device_name
    `,
    [rows.map((row) => row.id)],
  );

  const devicesBySnapshot = new Map<string, OfflineSnapshot["devices"]>();
  (deviceRows ?? []).forEach((row) => {
    const devices = devicesBySnapshot.get(row.snapshot_id) ?? [];
    devices.push({
      deviceId: row.device_id,
      deviceCode: row.device_code,
      deviceName: row.device_name,
    });
    devicesBySnapshot.set(row.snapshot_id, devices);
  });

  return rows.map((row) => ({
    id: row.id,
    date: toDateString(row.snapshot_date),
    capturedAt: toDateTimeString(row.captured_at),
    devices: devicesBySnapshot.get(row.id) ?? [],
  }));
}

export async function clearOfflineFrequencyForDevice(deviceId: string) {
  if (isBuildTime()) {
    return false;
  }

  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) {
    return false;
  }

  await ensureOperationalSchema();

  const deleted = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      "delete from offline_snapshot_devices where device_id = ?",
      [normalizedDeviceId],
    );
    return result.affectedRows > 0;
  });

  return deleted ?? false;
}

export async function getMonitoredDevices({
  includeInactive = false,
}: {
  includeInactive?: boolean;
} = {}): Promise<MonitoredDevice[]> {
  if (isBuildTime()) {
    return [];
  }

  await ensureOperationalSchema();

  const rows = await queryRows<MonitoredDeviceRow>(
    `
      select
        md.device_id,
        d.name as device_name,
        md.enabled_at,
        md.enabled_date,
        md.is_active,
        md.offline_count,
        md.last_status,
        md.last_offline_at,
        md.last_notification_at
      from monitored_devices md
      join devices d on d.id = md.device_id and d.is_excluded = false
      ${includeInactive ? "" : "where md.is_active = true"}
      order by md.is_active desc, md.enabled_date desc, md.device_id
    `,
  );

  if (!rows) {
    return [];
  }

  const periodRows = rows.length
    ? await queryRows<MonitoredOfflinePeriodRow>(
        `
          select id, device_id, offline_at, online_at
          from monitored_device_offline_periods
          where device_id in (?)
          order by offline_at desc
        `,
        [rows.map((row) => row.device_id)],
      )
    : [];
  const periodsByDevice = new Map<string, MonitoredOfflinePeriod[]>();
  (periodRows ?? []).forEach((row) => {
    const periods = periodsByDevice.get(row.device_id) ?? [];
    periods.push(mapMonitoredOfflinePeriodRow(row));
    periodsByDevice.set(row.device_id, periods);
  });

  return rows.map((row) =>
    mapMonitoredDeviceRow(row, periodsByDevice.get(row.device_id) ?? []),
  );
}

export async function refreshMonitoredDeviceStatuses({
  sync = false,
  includeInactive = true,
}: {
  sync?: boolean;
  includeInactive?: boolean;
} = {}) {
  if (sync && hasBiostarConfig()) {
    try {
      await syncBiostarDevices({ force: true });
    } catch (error) {
      console.warn(
        `[biostar] ${
          error instanceof Error ? error.message : "Monitoring sync failed"
        }`,
      );
    }
  }

  await ensureOperationalSchema();

  await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [rows] = await connection.query<RowDataPacket[]>(
        `
          select md.device_id, md.last_status, d.status
          from monitored_devices md
          join devices d on d.id = md.device_id and d.is_excluded = false
          where md.is_active = true
          for update
        `,
      );

      for (const row of rows) {
        await updateMonitoredDeviceStatus(
          connection,
          String(row.device_id),
          normalizeDeviceStatus(row.status) ?? "error",
          new Date(),
          normalizeDeviceStatus(row.last_status),
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return getMonitoredDevices({ includeInactive });
}

export async function setDeviceMonitoring(
  deviceIds: string[],
  enabled: boolean,
) {
  await ensureOperationalSchema();

  const uniqueDeviceIds = [...new Set(deviceIds.map((id) => id.trim()))].filter(
    Boolean,
  );

  if (!uniqueDeviceIds.length) {
    return getMonitoredDevices();
  }

  const now = new Date();
  const enabledAt = toSqlDateTime(now);
  const enabledDate = getTbilisiDateKey(now);

  await withConnection(async (connection) => {
    if (enabled) {
      const [deviceRows] = await connection.query(
        "select id, status from devices where id in (?) and is_excluded = false",
        [uniqueDeviceIds],
      );
      const activeDevices = deviceRows as { id: string; status: DeviceStatus }[];
      if (!activeDevices.length) {
        return;
      }
      const activeDeviceIds = activeDevices.map((device) => device.id);

      await connection.query<ResultSetHeader>(
        "delete from monitored_device_offline_periods where device_id in (?)",
        [activeDeviceIds],
      );

      await connection.query<ResultSetHeader>(
        `
          insert into monitored_devices
            (device_id, enabled_at, enabled_date, is_active, offline_count, last_status, last_offline_at, last_notification_at)
          values ${activeDevices.map(() => "(?, ?, ?, true, 0, ?, null, null)").join(", ")}
          on duplicate key update
            enabled_at = values(enabled_at),
            enabled_date = values(enabled_date),
            is_active = true,
            offline_count = 0,
            last_status = values(last_status),
            last_offline_at = null,
            last_notification_at = null,
          updated_at = current_timestamp
        `,
        activeDevices.flatMap((device) => [
          device.id,
          enabledAt,
          enabledDate,
          device.status,
        ]),
      );
      return;
    }

    await connection.query<ResultSetHeader>(
      "update monitored_devices set is_active = false where device_id in (?)",
      [uniqueDeviceIds],
    );
  });

  return getMonitoredDevices({ includeInactive: true });
}

function mapMonitoredDeviceRow(
  row: MonitoredDeviceRow,
  offlinePeriods: MonitoredOfflinePeriod[],
): MonitoredDevice {
  const lastStatus = normalizeDeviceStatus(row.last_status);

  return {
    deviceId: row.device_id,
    deviceName: row.device_name,
    enabledAt: toDateTimeString(row.enabled_at),
    enabledDate: toDateString(row.enabled_date),
    isActive: toBoolean(row.is_active),
    offlineCount: Number(row.offline_count ?? 0),
    lastStatus: lastStatus ?? undefined,
    lastOfflineAt: row.last_offline_at
      ? toDateTimeString(row.last_offline_at)
      : undefined,
    lastNotificationAt: row.last_notification_at
      ? toDateTimeString(row.last_notification_at)
      : undefined,
    offlinePeriods,
  };
}

function mapMonitoredOfflinePeriodRow(
  row: MonitoredOfflinePeriodRow,
): MonitoredOfflinePeriod {
  return {
    id: row.id,
    deviceId: row.device_id,
    offlineAt: toDateTimeString(row.offline_at),
    onlineAt: row.online_at ? toDateTimeString(row.online_at) : undefined,
  };
}

async function updateMonitoredDeviceStatus(
  connection: PoolConnection,
  deviceId: string,
  status: DeviceStatus,
  happenedAt: Date,
  previousStatus?: DeviceStatus | null,
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `
      select last_status, is_active
      from monitored_devices
      where device_id = ? and is_active = true
      limit 1
      for update
    `,
    [deviceId],
  );
  const row = rows[0];
  if (!row || !toBoolean(row.is_active)) {
    return;
  }

  const trackedStatus =
    normalizeDeviceStatus(row.last_status) ?? previousStatus ?? null;
  const shouldIncrement =
    status === "offline" && trackedStatus !== null && trackedStatus !== "offline";
  const happenedAtSql = toSqlDateTime(happenedAt);

  if (shouldIncrement) {
    await connection.query<ResultSetHeader>(
      `
        insert into monitored_device_offline_periods
          (id, device_id, offline_at)
        values (?, ?, ?)
      `,
      [makeId("mon-offline"), deviceId, happenedAtSql],
    );
    await connection.query<ResultSetHeader>(
      `
        update monitored_devices
        set
          offline_count = offline_count + 1,
          last_status = ?,
          last_offline_at = ?,
          last_notification_at = ?,
          updated_at = current_timestamp
        where device_id = ?
      `,
      [status, happenedAtSql, happenedAtSql, deviceId],
    );
    return;
  }

  if (trackedStatus === "offline" && status !== "offline") {
    await connection.query<ResultSetHeader>(
      `
        update monitored_device_offline_periods
        set online_at = ?
        where device_id = ? and online_at is null
        order by offline_at desc
        limit 1
      `,
      [happenedAtSql, deviceId],
    );
  }

  if (trackedStatus !== status) {
    await connection.query<ResultSetHeader>(
      `
        update monitored_devices
        set last_status = ?, updated_at = current_timestamp
        where device_id = ?
      `,
      [status, deviceId],
    );
  }
}

function getMockOfflineSnapshots(): OfflineSnapshot[] {
  const snapshots = new Map<string, Map<string, OfflineSnapshot["devices"][0]>>();

  mockDevices.forEach((device) => {
    device.statusEvents
      .filter((event) => event.status === "offline")
      .forEach((event) => {
        const date = event.happenedAt.slice(0, 10);
        const devices = snapshots.get(date) ?? new Map();
        devices.set(device.id, {
          deviceId: device.id,
          deviceCode: device.code,
          deviceName: device.name,
        });
        snapshots.set(date, devices);
      });
  });

  return [...snapshots.entries()]
    .map(([date, devices]) => ({
      id: `mock-offline-${date}`,
      date,
      capturedAt: `${date}T09:00:00+04:00`,
      devices: [...devices.values()].sort((a, b) =>
        a.deviceCode.localeCompare(b.deviceCode),
      ),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function filterOfflineSnapshots(
  snapshots: OfflineSnapshot[],
  fromDate?: string,
  toDate?: string,
) {
  return snapshots.filter(
    (snapshot) =>
      (!fromDate || snapshot.date >= fromDate) &&
      (!toDate || snapshot.date <= toDate),
  );
}

function isBuildTime() {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

export async function getTasks(): Promise<Task[]> {
  await ensureOperationalSchema();

  const rows = await queryRows<TaskRow>(
    `
      select
        t.id,
        t.title,
        t.issue,
        t.comment_text,
        t.phone,
        t.device_id,
        t.status,
        t.priority,
        t.tags,
        t.starts_at,
        t.due_date,
        t.created_at,
        pr.id as problem_report_id,
        group_concat(ta.user_id order by ta.user_id separator ',') as assignee_ids
      from tasks t
      left join task_assignees ta on ta.task_id = t.id
      left join problem_reports pr on pr.task_id = t.id
      where pr.id is null
        or exists (
          select 1
          from task_assignees ready_ta
          where ready_ta.task_id = t.id
          limit 1
        )
      group by t.id
      order by t.created_at desc
    `,
  );

  if (!rows) {
    return mockTasks;
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    issue: row.issue,
    comment: row.comment_text ?? undefined,
    phone: row.phone ?? undefined,
    deviceId: row.device_id,
    status: row.status,
    priority: row.priority,
    tags: normalizeTaskTags(row.tags),
    startsAt: row.starts_at ? toDateTimeString(row.starts_at) : undefined,
    dueDate: toDateString(row.due_date),
    createdAt: toDateTimeString(row.created_at),
    problemReportId: row.problem_report_id ?? undefined,
    assigneeIds: csv(row.assignee_ids),
  }));
}

export async function createTask(
  input: Omit<Task, "id" | "createdAt">,
): Promise<Task> {
  const id = `task-${Date.now()}`;
  const task: Task = {
    id,
    createdAt: new Date().toISOString(),
    ...input,
    tags: normalizeTaskTags(input.tags),
  };

  await ensureOperationalSchema();

  const inserted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query<ResultSetHeader>(
        `
          insert into tasks (id, title, issue, comment_text, phone, device_id, status, priority, tags, starts_at, due_date)
          values (?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?)
        `,
        [
          task.id,
          task.title,
          task.issue,
          task.comment?.trim() || null,
          task.phone ?? null,
          task.deviceId,
          task.status,
          task.priority,
          JSON.stringify(task.tags),
          task.startsAt ?? null,
          task.dueDate,
        ],
      );

      if (task.assigneeIds.length) {
        await connection.query(
          `
            insert into task_assignees (task_id, user_id)
            values ${task.assigneeIds.map(() => "(?, ?)").join(", ")}
          `,
          task.assigneeIds.flatMap((userId) => [task.id, userId]),
        );
      }

      await connection.commit();
      return task;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return inserted ?? task;
}

export async function updateTask(
  id: string,
  input: Omit<Task, "id" | "createdAt">,
): Promise<Task | null> {
  await ensureOperationalSchema();

  const tags = normalizeTaskTags(input.tags);
  const updated = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [result] = await connection.query<ResultSetHeader>(
        `
          update tasks
          set
            title = ?,
            issue = ?,
            comment_text = ?,
            phone = ?,
            device_id = ?,
            status = ?,
            priority = ?,
            tags = cast(? as json),
            starts_at = ?,
            due_date = ?
          where id = ?
        `,
        [
          input.title,
          input.issue,
          input.comment?.trim() || null,
          input.phone ?? null,
          input.deviceId,
          input.status,
          input.priority,
          JSON.stringify(tags),
          input.startsAt ?? null,
          input.dueDate,
          id,
        ],
      );

      if (!result.affectedRows) {
        await connection.rollback();
        return null;
      }

      await connection.query("delete from task_assignees where task_id = ?", [
        id,
      ]);

      if (input.assigneeIds.length) {
        await connection.query(
          `
            insert into task_assignees (task_id, user_id)
            values ${input.assigneeIds.map(() => "(?, ?)").join(", ")}
          `,
          input.assigneeIds.flatMap((userId) => [id, userId]),
        );
      }

      await connection.commit();
      const tasks = await getTasks();
      return tasks.find((task) => task.id === id) ?? null;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  if (updated !== null) {
    return updated;
  }

  const task = mockTasks.find((item) => item.id === id);
  return task ? { ...task, ...input, tags } : null;
}

export async function deleteTask(id: string) {
  const deleted = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      "delete from tasks where id = ?",
      [id],
    );
    return result.affectedRows > 0;
  });

  if (deleted !== null) {
    return deleted;
  }

  return mockTasks.some((task) => task.id === id);
}

export async function getProblemReports({
  deviceGroupCode,
}: {
  deviceGroupCode?: string;
} = {}): Promise<ProblemReport[]> {
  await ensureOperationalSchema();

  const filters: string[] = [];
  const params: string[] = [];
  const normalizedGroup = normalizeDeviceGroupCode(deviceGroupCode);

  if (normalizedGroup) {
    filters.push("pr.device_group_code = ?");
    params.push(normalizedGroup);
  }

  const rows = await queryRows<ProblemReportRow>(
    `
      select
        pr.id,
        pr.task_id,
        pr.device_id,
        pr.device_group_code,
        pr.title,
        pr.issue,
        pr.phone,
        pr.status,
        pr.priority,
        pr.tags,
        pr.due_date,
        pr.created_by,
        pr.created_at,
        pr.updated_at,
        group_concat(pra.user_id order by pra.user_id separator ',') as assignee_ids
      from problem_reports pr
      left join problem_report_assignees pra on pra.problem_report_id = pr.id
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
      group by pr.id
      order by pr.created_at desc
    `,
    params,
  );

  if (!rows) {
    return [];
  }

  return rows.map(mapProblemReportRow);
}

export async function getProblemReportById(id: string) {
  const reports = await getProblemReports();
  return reports.find((report) => report.id === id) ?? null;
}

export async function createProblemReport(
  input: Omit<
    ProblemReport,
    "id" | "taskId" | "deviceGroupCode" | "createdAt" | "updatedAt"
  >,
  options: { createdBy?: string; allowedDeviceGroupCode?: string } = {},
): Promise<ProblemReport> {
  await ensureOperationalSchema();

  const reportId = makeId("problem");
  const taskId = makeId("task");
  const tags = normalizeTaskTags(input.tags);
  const assigneeIds = normalizeUserIds(input.assigneeIds);
  const syncTask = shouldSyncProblemReportToTask(assigneeIds);
  const dueDate = input.dueDate || getTbilisiDateKey();
  const createdAt = new Date().toISOString();
  const fallbackReport: ProblemReport = {
    ...input,
    id: reportId,
    taskId: syncTask ? taskId : undefined,
    tags,
    assigneeIds,
    dueDate,
    deviceGroupCode: normalizeDeviceGroupCode(options.allowedDeviceGroupCode),
    createdBy: options.createdBy,
    createdAt,
    updatedAt: createdAt,
  };

  const insertedId = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const device = await getDeviceIdentity(connection, input.deviceId);
      if (!device) {
        await connection.rollback();
        return null;
      }

      const deviceGroupCode = getDeviceGroupCode(device);
      const allowedGroup = normalizeDeviceGroupCode(options.allowedDeviceGroupCode);
      if (allowedGroup && deviceGroupCode !== allowedGroup) {
        await connection.rollback();
        return null;
      }

      if (syncTask) {
        await upsertTaskForProblemReport(connection, {
          taskId,
          title: input.title,
          issue: input.issue,
          phone: input.phone,
          deviceId: input.deviceId,
          status: input.status,
          priority: input.priority,
          tags,
          dueDate,
          assigneeIds,
          createdBy: options.createdBy,
        });
      }

      await connection.query<ResultSetHeader>(
        `
          insert into problem_reports
            (id, task_id, device_id, device_group_code, title, issue, phone, status, priority, tags, due_date, created_by)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?)
        `,
        [
          reportId,
          syncTask ? taskId : null,
          input.deviceId,
          deviceGroupCode,
          input.title,
          input.issue,
          input.phone ?? null,
          input.status,
          input.priority,
          JSON.stringify(tags),
          dueDate,
          options.createdBy ?? null,
        ],
      );

      await replaceProblemReportAssignees(connection, reportId, assigneeIds);

      await connection.commit();
      return reportId;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  if (!insertedId) {
    return fallbackReport;
  }

  return (await getProblemReportById(insertedId)) ?? fallbackReport;
}

export async function updateProblemReport(
  id: string,
  input: Omit<
    ProblemReport,
    "id" | "taskId" | "deviceGroupCode" | "createdAt" | "updatedAt"
  >,
  options: { allowedDeviceGroupCode?: string } = {},
): Promise<ProblemReport | null> {
  await ensureOperationalSchema();

  const tags = normalizeTaskTags(input.tags);
  const assigneeIds = normalizeUserIds(input.assigneeIds);
  const dueDate = input.dueDate || getTbilisiDateKey();
  const updatedId = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [existingRows] = await connection.query<RowDataPacket[]>(
        "select task_id, device_group_code, created_by from problem_reports where id = ? limit 1 for update",
        [id],
      );
      const existing = existingRows[0] as
        | { task_id?: string | null; device_group_code?: string; created_by?: string | null }
        | undefined;
      if (!existing) {
        await connection.rollback();
        return null;
      }

      const allowedGroup = normalizeDeviceGroupCode(options.allowedDeviceGroupCode);
      if (allowedGroup && existing.device_group_code !== allowedGroup) {
        await connection.rollback();
        return null;
      }

      const device = await getDeviceIdentity(connection, input.deviceId);
      if (!device) {
        await connection.rollback();
        return null;
      }

      const deviceGroupCode = getDeviceGroupCode(device);
      if (allowedGroup && deviceGroupCode !== allowedGroup) {
        await connection.rollback();
        return null;
      }

      const taskId = existing.task_id || makeId("task");
      const syncTask = shouldSyncProblemReportToTask(assigneeIds);
      if (syncTask) {
        await upsertTaskForProblemReport(connection, {
          taskId,
          title: input.title,
          issue: input.issue,
          phone: input.phone,
          deviceId: input.deviceId,
          status: input.status,
          priority: input.priority,
          tags,
          dueDate,
          assigneeIds,
          createdBy: existing.created_by ?? undefined,
        });
      }

      await connection.query<ResultSetHeader>(
        `
          update problem_reports
          set
            task_id = ?,
            device_id = ?,
            device_group_code = ?,
            title = ?,
            issue = ?,
            phone = ?,
            status = ?,
            priority = ?,
            tags = cast(? as json),
            due_date = ?
          where id = ?
        `,
        [
          syncTask ? taskId : null,
          input.deviceId,
          deviceGroupCode,
          input.title,
          input.issue,
          input.phone ?? null,
          input.status,
          input.priority,
          JSON.stringify(tags),
          dueDate,
          id,
        ],
      );

      await replaceProblemReportAssignees(connection, id, assigneeIds);
      if (!syncTask && existing.task_id) {
        await connection.query<ResultSetHeader>(
          "delete from tasks where id = ?",
          [existing.task_id],
        );
      }

      await connection.commit();
      return id;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  if (!updatedId) {
    return null;
  }

  return getProblemReportById(updatedId);
}

export async function deleteProblemReport(id: string) {
  await ensureOperationalSchema();

  const deleted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [existingRows] = await connection.query<RowDataPacket[]>(
        "select task_id from problem_reports where id = ? limit 1 for update",
        [id],
      );
      const taskId = String(existingRows[0]?.task_id || "");
      const [result] = await connection.query<ResultSetHeader>(
        "delete from problem_reports where id = ?",
        [id],
      );

      if (taskId) {
        await connection.query<ResultSetHeader>(
          "delete from tasks where id = ?",
          [taskId],
        );
      }

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return deleted ?? false;
}

export async function getFormOneRecords({
  deviceGroupCode,
}: {
  deviceGroupCode?: string;
} = {}): Promise<FormOneRecord[]> {
  if (isBuildTime()) {
    return [];
  }

  await ensureOperationalSchema();

  const normalizedGroup = normalizeDeviceGroupCode(deviceGroupCode);
  const rows = await prisma.form_one_records.findMany({
    orderBy: { created_at: "desc" },
    where: normalizedGroup ? { device_group_code: normalizedGroup } : undefined,
  });

  return rows.map(mapPrismaFormOneRecord);
}

export async function getFormOneRecordById(id: string) {
  if (isBuildTime()) {
    return null;
  }

  await ensureOperationalSchema();

  const record = await prisma.form_one_records.findUnique({
    where: { id },
  });
  return record ? mapPrismaFormOneRecord(record) : null;
}

export async function createFormOneRecord(
  input: {
    deviceId: string;
    gardenLabel: string;
    phone?: string;
    submittedDate: string;
    dueDate?: string;
    items: FormOneRecordItem[];
  },
  options: { createdBy?: string; allowedDeviceGroupCode?: string } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  await ensureOperationalSchema();

  const recordId = makeId("formone");
  const items = normalizeFormOneRecordItems(input.items);
  const submittedDate = normalizeDateInput(input.submittedDate);
  const dueDate = normalizeOptionalDateInput(input.dueDate);
  const now = new Date();
  const dueDates = dueDate
    ? [
        {
          id: makeId("formonedue"),
          date: dueDate,
          changedAt: now.toISOString(),
          changedBy: options.createdBy,
        },
      ]
    : [];
  if (!items.length) {
    return null;
  }

  return prisma.$transaction(async (transaction) => {
    const device = await transaction.devices.findUnique({
      select: { code: true, id: true, name: true },
      where: { id: input.deviceId },
    });
    if (!device) {
      return null;
    }

    const deviceGroupCode = getDeviceGroupCode(device);
    const allowedGroup = normalizeDeviceGroupCode(options.allowedDeviceGroupCode);
    if (allowedGroup && deviceGroupCode !== allowedGroup) {
      return null;
    }

    const record = await transaction.form_one_records.create({
      data: {
        id: recordId,
        device_id: input.deviceId,
        device_group_code: deviceGroupCode,
        garden_label: input.gardenLabel || device.name || deviceGroupCode,
        phone: input.phone || null,
        submitted_date: toPrismaDateOnly(submittedDate),
        due_date: dueDate ? toPrismaDateOnly(dueDate) : null,
        due_dates: dueDates.length
          ? (dueDates as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        due_date_change_count: 0,
        status: "in_progress",
        items: items as unknown as Prisma.InputJsonValue,
        created_by: options.createdBy ?? null,
      },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function updateFormOneRecord(
  id: string,
  input: {
    deviceId: string;
    gardenLabel: string;
    phone?: string;
    submittedDate: string;
    dueDate?: string;
    items: FormOneRecordItem[];
  },
  options: { allowedDeviceGroupCode?: string; updatedBy?: string } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  await ensureOperationalSchema();

  const items = normalizeFormOneRecordItems(input.items);
  const submittedDate = normalizeDateInput(input.submittedDate);
  const dueDate = normalizeOptionalDateInput(input.dueDate);
  if (!items.length) {
    return null;
  }

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.form_one_records.findUnique({
      select: {
        device_group_code: true,
        due_date: true,
        due_dates: true,
        due_date_change_count: true,
      },
      where: { id },
    });
    if (!existing) {
      return null;
    }

    const allowedGroup = normalizeDeviceGroupCode(options.allowedDeviceGroupCode);
    if (allowedGroup && existing.device_group_code !== allowedGroup) {
      return null;
    }

    const device = await transaction.devices.findUnique({
      select: { code: true, id: true, name: true },
      where: { id: input.deviceId },
    });
    if (!device) {
      return null;
    }

    const deviceGroupCode = getDeviceGroupCode(device);
    if (allowedGroup && deviceGroupCode !== allowedGroup) {
      return null;
    }

    const existingDueDate = existing.due_date
      ? toDateString(existing.due_date)
      : undefined;
    const dueDateChanged = (dueDate || "") !== (existingDueDate || "");
    const dueDateChangeCount = existing.due_date_change_count ?? 0;
    const countsAsDueDateChange = dueDateChanged && Boolean(existingDueDate);
    const existingDueDates = normalizeFormOneDueDates(existing.due_dates);
    const dueDateHistoryBase =
      existingDueDates.length || !existingDueDate
        ? existingDueDates
        : [
            {
              id: makeStableId("formonedue", `${id}:${existingDueDate}`),
              date: existingDueDate,
              changedAt: "",
            },
          ];
    const dueDates = dueDateChanged
      ? [
          ...dueDateHistoryBase,
          ...(dueDate
            ? [
                {
                  id: makeId("formonedue"),
                  date: dueDate,
                  changedAt: new Date().toISOString(),
                  changedBy: options.updatedBy,
                },
              ]
            : []),
        ]
      : dueDateHistoryBase;

    const record = await transaction.form_one_records.update({
      data: {
        device_id: input.deviceId,
        device_group_code: deviceGroupCode,
        garden_label: input.gardenLabel || device.name || deviceGroupCode,
        phone: input.phone || null,
        submitted_date: toPrismaDateOnly(submittedDate),
        due_date: dueDate ? toPrismaDateOnly(dueDate) : null,
        due_dates: dueDates.length
          ? (dueDates as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        due_date_change_count: countsAsDueDateChange
          ? dueDateChangeCount + 1
          : dueDateChangeCount,
        items: items as unknown as Prisma.InputJsonValue,
      },
      where: { id },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function deleteFormOneRecord(
  id: string,
  options: { allowedDeviceGroupCode?: string } = {},
) {
  if (isBuildTime()) {
    return false;
  }

  await ensureOperationalSchema();

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.form_one_records.findUnique({
      select: { device_group_code: true },
      where: { id },
    });
    if (!existing) {
      return false;
    }

    const allowedGroup = normalizeDeviceGroupCode(options.allowedDeviceGroupCode);
    if (allowedGroup && existing.device_group_code !== allowedGroup) {
      return false;
    }

    await transaction.form_one_records.delete({ where: { id } });
    return true;
  });
}

export async function requestFormOneCompletion(
  id: string,
  options: { requestedBy?: string; allowedDeviceGroupCode?: string } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  await ensureOperationalSchema();

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.form_one_records.findUnique({
      where: { id },
    });
    if (!existing) {
      return null;
    }

    const allowedGroup = normalizeDeviceGroupCode(options.allowedDeviceGroupCode);
    if (allowedGroup && existing.device_group_code !== allowedGroup) {
      return null;
    }
    if (normalizeFormOneStatus(existing.status) === "completed") {
      return mapPrismaFormOneRecord(existing);
    }

    const now = new Date();
    await transaction.form_one_notifications.updateMany({
      data: { read_at: now },
      where: {
        record_id: id,
        type: "completion_request",
        read_at: null,
      },
    });

    const record = await transaction.form_one_records.update({
      data: {
        status: "completion_requested",
        completion_requested_at: now,
        completion_requested_by: options.requestedBy ?? null,
        completed_at: null,
        completed_by: null,
      },
      where: { id },
    });

    await transaction.form_one_notifications.create({
      data: {
        id: makeId("formonenotification"),
        record_id: id,
        type: "completion_request",
        recipient_device_group_code: existing.device_group_code,
        created_by: options.requestedBy ?? null,
      },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function respondToFormOneCompletion(
  id: string,
  input: {
    action: "approve" | "reject";
    comment?: string;
  },
  options: { userId?: string; allowedDeviceGroupCode?: string } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  await ensureOperationalSchema();
  const comment = String(input.comment || "").trim();
  if (input.action === "reject" && !comment) {
    return null;
  }

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.form_one_records.findUnique({
      where: { id },
    });
    if (!existing) {
      return null;
    }

    const allowedGroup = normalizeDeviceGroupCode(options.allowedDeviceGroupCode);
    if (allowedGroup && existing.device_group_code !== allowedGroup) {
      return null;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    await transaction.form_one_notifications.updateMany({
      data: { read_at: now },
      where: {
        record_id: id,
        type: "completion_request",
        read_at: null,
      },
    });

    if (input.action === "approve") {
      const record = await transaction.form_one_records.update({
        data: {
          status: "completed",
          completed_at: now,
          completed_by: options.userId ?? null,
        },
        where: { id },
      });
      return mapPrismaFormOneRecord(record);
    }

    const rejectionComments = [
      ...normalizeFormOneRejectionComments(existing.rejection_comments),
      {
        id: makeId("formonecomment"),
        comment,
        sentAt: existing.completion_requested_at
          ? toDateTimeString(existing.completion_requested_at)
          : undefined,
        rejectedAt: nowIso,
        rejectedBy: options.userId,
      },
    ];
    const recipientUserId =
      existing.completion_requested_by || existing.created_by || null;

    const record = await transaction.form_one_records.update({
      data: {
        status: "in_progress",
        rejection_comments:
          rejectionComments as unknown as Prisma.InputJsonValue,
      },
      where: { id },
    });

    if (recipientUserId) {
      await transaction.form_one_notifications.create({
        data: {
          id: makeId("formonenotification"),
          record_id: id,
          type: "rejection",
          recipient_user_id: recipientUserId,
          comment_text: comment,
          created_by: options.userId ?? null,
        },
      });
    } else {
      await transaction.form_one_notifications.create({
        data: {
          id: makeId("formonenotification"),
          record_id: id,
          type: "rejection",
          recipient_role: OUTSOURCING_ROLE_NAME,
          comment_text: comment,
          created_by: options.userId ?? null,
        },
      });
    }

    return mapPrismaFormOneRecord(record);
  });
}

export async function updateFormOneRejectionComment(
  recordId: string,
  commentId: string,
  comment: string,
  options: { allowedDeviceGroupCode?: string } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  const normalizedComment = comment.trim();
  if (!normalizedComment) {
    return null;
  }

  await ensureOperationalSchema();

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.form_one_records.findUnique({
      where: { id: recordId },
    });
    if (!existing) {
      return null;
    }

    const allowedGroup = normalizeDeviceGroupCode(options.allowedDeviceGroupCode);
    if (allowedGroup && existing.device_group_code !== allowedGroup) {
      return null;
    }

    let updated = false;
    const rejectionComments = normalizeFormOneRejectionComments(
      existing.rejection_comments,
    ).map((item) => {
      if (item.id !== commentId) {
        return item;
      }

      updated = true;
      return { ...item, comment: normalizedComment };
    });

    if (!updated) {
      return null;
    }

    const record = await transaction.form_one_records.update({
      data: {
        rejection_comments:
          rejectionComments as unknown as Prisma.InputJsonValue,
      },
      where: { id: recordId },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function getFormOneNotifications(
  user: Pick<SessionUser, "id" | "role" | "deviceGroupCode"> | null,
): Promise<FormOneNotification[]> {
  if (!user || isBuildTime()) {
    return [];
  }

  await ensureOperationalSchema();
  const scopedGroup =
    user.role === GARDEN_ROLE_NAME
      ? normalizeDeviceGroupCode(user.deviceGroupCode)
      : "";
  const rows = await queryRows<FormOneNotificationRow>(
    `
      select
        n.id as notification_id,
        n.record_id as notification_record_id,
        n.type as notification_type,
        n.comment_text as notification_comment_text,
        n.read_at as notification_read_at,
        n.created_at as notification_created_at,
        r.id,
        r.device_id,
        r.device_group_code,
        r.garden_label,
        r.phone,
        r.submitted_date,
        r.due_date,
        r.due_dates,
        r.due_date_change_count,
        r.status,
        r.completion_requested_at,
        r.completion_requested_by,
        r.completed_at,
        r.completed_by,
        r.rejection_comments,
        r.items,
        r.created_by,
        r.created_at,
        r.updated_at
      from form_one_notifications n
      join form_one_records r on r.id = n.record_id
      where n.read_at is null
        and (
          n.recipient_user_id = ?
          or n.recipient_role = ?
          or (? <> '' and n.recipient_device_group_code = ?)
        )
      order by n.created_at desc
      limit 50
    `,
    [user.id, user.role, scopedGroup, scopedGroup],
  );

  return (rows ?? []).map((row) => ({
    id: row.notification_id,
    recordId: row.notification_record_id,
    type: normalizeFormOneNotificationType(row.notification_type),
    comment: row.notification_comment_text ?? undefined,
    readAt: row.notification_read_at
      ? toDateTimeString(row.notification_read_at)
      : undefined,
    createdAt: toDateTimeString(row.notification_created_at),
    record: mapPrismaFormOneRecord(row),
  }));
}

export async function markFormOneNotificationRead(
  notificationId: string,
  user: Pick<SessionUser, "id" | "role" | "deviceGroupCode"> | null,
) {
  if (!user || isBuildTime()) {
    return false;
  }

  await ensureOperationalSchema();
  const scopedGroup =
    user.role === GARDEN_ROLE_NAME
      ? normalizeDeviceGroupCode(user.deviceGroupCode)
      : "";
  const updated = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `
        update form_one_notifications
        set read_at = ?
        where id = ?
          and read_at is null
          and (
            recipient_user_id = ?
            or recipient_role = ?
            or (? <> '' and recipient_device_group_code = ?)
          )
      `,
      [toSqlDateTime(new Date()), notificationId, user.id, user.role, scopedGroup, scopedGroup],
    );
    return result.affectedRows > 0;
  });

  return updated ?? false;
}

function mapProblemReportRow(row: ProblemReportRow): ProblemReport {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    deviceId: row.device_id,
    deviceGroupCode: row.device_group_code,
    title: row.title,
    issue: row.issue,
    phone: row.phone ?? undefined,
    status: row.status,
    priority: row.priority,
    tags: normalizeTaskTags(row.tags),
    assigneeIds: csv(row.assignee_ids),
    dueDate: toDateString(row.due_date),
    createdBy: row.created_by ?? undefined,
    createdAt: toDateTimeString(row.created_at),
    updatedAt: toDateTimeString(row.updated_at),
  };
}

function mapPrismaFormOneRecord(row: FormOneRecordRow): FormOneRecord {
  const dueDate = row.due_date ? toDateString(row.due_date) : undefined;
  const dueDates = normalizeFormOneDueDates(row.due_dates);
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceGroupCode: row.device_group_code,
    gardenLabel: row.garden_label,
    phone: row.phone ?? undefined,
    submittedDate: toDateString(row.submitted_date),
    dueDate,
    dueDates:
      dueDates.length || !dueDate
        ? dueDates
        : [
            {
              id: makeStableId("formonedue", `${row.id}:${dueDate}`),
              date: dueDate,
              changedAt: "",
            },
          ],
    dueDateChangeCount: Number(row.due_date_change_count) || 0,
    status: normalizeFormOneStatus(row.status),
    completionRequestedAt: row.completion_requested_at
      ? toDateTimeString(row.completion_requested_at)
      : undefined,
    completionRequestedBy: row.completion_requested_by ?? undefined,
    completedAt: row.completed_at
      ? toDateTimeString(row.completed_at)
      : undefined,
    completedBy: row.completed_by ?? undefined,
    rejectionComments: normalizeFormOneRejectionComments(
      row.rejection_comments,
    ),
    items: normalizeFormOneRecordItems(row.items),
    createdBy: row.created_by ?? undefined,
    createdAt: toDateTimeString(row.created_at),
    updatedAt: toDateTimeString(row.updated_at),
  };
}

function normalizeFormOneRecordItems(items: unknown): FormOneRecordItem[] {
  const parsedItems = parseJsonArray(items);
  return parsedItems
    .map((item) => {
      const value =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};
      const serviceLabel = String(value.serviceLabel || "").trim();
      const customServiceLabel = String(value.customServiceLabel || "").trim();

      return {
        modelId: String(value.modelId || "").trim(),
        modelLabel: String(value.modelLabel || "").trim(),
        serviceId: String(value.serviceId || "").trim(),
        serviceLabel: serviceLabel || customServiceLabel,
        customServiceLabel: customServiceLabel || undefined,
        quantity: Math.max(1, Number(value.quantity) || 1),
      };
    })
    .filter((item) => item.modelLabel && item.serviceLabel);
}

function normalizeFormOneStatus(value: unknown): FormOneStatus {
  return value === "completion_requested" || value === "completed"
    ? value
    : "in_progress";
}

function normalizeFormOneNotificationType(
  value: unknown,
): FormOneNotificationType {
  return value === "rejection" ? "rejection" : "completion_request";
}

function normalizeFormOneDueDates(value: unknown): FormOneDueDateEntry[] {
  return parseJsonArray(value)
    .map((item): FormOneDueDateEntry | null => {
      const source =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};
      const date = normalizeOptionalDateInput(String(source.date || ""));
      if (!date) {
        return null;
      }

      const changedBy = source.changedBy
        ? String(source.changedBy)
        : source.changed_by
          ? String(source.changed_by)
          : undefined;
      return {
        id: String(source.id || makeStableId("formonedue", date)),
        date,
        changedAt: String(source.changedAt || source.changed_at || ""),
        ...(changedBy ? { changedBy } : {}),
      };
    })
    .filter((item): item is FormOneDueDateEntry => Boolean(item));
}

function normalizeFormOneRejectionComments(
  value: unknown,
): FormOneRejectionComment[] {
  return parseJsonArray(value)
    .map((item): FormOneRejectionComment | null => {
      const source =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};
      const comment = String(source.comment || "").trim();
      const rejectedAt = String(source.rejectedAt || source.rejected_at || "");
      if (!comment || !rejectedAt) {
        return null;
      }

      const sentAt =
        source.sentAt || source.sent_at
          ? String(source.sentAt || source.sent_at)
          : undefined;
      const rejectedBy =
        source.rejectedBy || source.rejected_by
          ? String(source.rejectedBy || source.rejected_by)
          : undefined;
      return {
        id: String(source.id || makeStableId("formonecomment", rejectedAt)),
        comment,
        rejectedAt,
        ...(sentAt ? { sentAt } : {}),
        ...(rejectedBy ? { rejectedBy } : {}),
      };
    })
    .filter((item): item is FormOneRejectionComment => Boolean(item));
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDateInput(value: string) {
  const normalized = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : getTbilisiDateKey();
}

function normalizeOptionalDateInput(value?: string | null) {
  const normalized = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function toPrismaDateOnly(value: string) {
  const normalized = normalizeDateInput(value);
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function normalizeUserIds(userIds: string[]) {
  return [...new Set(userIds.map((id) => id.trim()))].filter(Boolean);
}

function shouldSyncProblemReportToTask(assigneeIds: string[]) {
  return assigneeIds.length > 0;
}

async function getDeviceIdentity(connection: PoolConnection, deviceId: string) {
  const [deviceRows] = await connection.query<RowDataPacket[]>(
    "select id, code, name from devices where id = ? limit 1",
    [deviceId],
  );
  const row = deviceRows[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
  };
}

async function replaceProblemReportAssignees(
  connection: PoolConnection,
  problemReportId: string,
  assigneeIds: string[],
) {
  await connection.query(
    "delete from problem_report_assignees where problem_report_id = ?",
    [problemReportId],
  );

  if (assigneeIds.length) {
    await connection.query(
      `
        insert ignore into problem_report_assignees (problem_report_id, user_id)
        values ${assigneeIds.map(() => "(?, ?)").join(", ")}
      `,
      assigneeIds.flatMap((userId) => [problemReportId, userId]),
    );
  }
}

async function upsertTaskForProblemReport(
  connection: PoolConnection,
  input: Omit<Task, "id" | "createdAt" | "problemReportId" | "startsAt"> & {
    taskId: string;
    createdBy?: string;
  },
) {
  await connection.query<ResultSetHeader>(
    `
      insert into tasks
        (id, title, issue, comment_text, phone, device_id, status, priority, tags, due_date, created_by)
      values (?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?)
      on duplicate key update
        title = values(title),
        issue = values(issue),
        comment_text = values(comment_text),
        phone = values(phone),
        device_id = values(device_id),
        status = values(status),
        priority = values(priority),
        tags = values(tags),
        due_date = values(due_date)
    `,
    [
      input.taskId,
      input.title,
      input.issue,
      input.comment?.trim() || null,
      input.phone ?? null,
      input.deviceId,
      input.status,
      input.priority,
      JSON.stringify(input.tags),
      input.dueDate,
      input.createdBy ?? null,
    ],
  );

  await connection.query("delete from task_assignees where task_id = ?", [
    input.taskId,
  ]);

  if (input.assigneeIds.length) {
    await connection.query(
      `
        insert ignore into task_assignees (task_id, user_id)
        values ${input.assigneeIds.map(() => "(?, ?)").join(", ")}
      `,
      input.assigneeIds.flatMap((userId) => [input.taskId, userId]),
    );
  }
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<Task | null> {
  const updated = await withConnection(async (connection) => {
    await connection.query("update tasks set status = ? where id = ?", [
      status,
      id,
    ]);
    const tasks = await getTasks();
    return tasks.find((task) => task.id === id) ?? null;
  });

  if (updated !== null) {
    return updated;
  }

  const task = mockTasks.find((item) => item.id === id);
  return task ? { ...task, status } : null;
}
