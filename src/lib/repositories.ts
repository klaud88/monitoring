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
  AuditLogEntry,
  AuditLogsResult,
  Device,
  DeviceStatus,
  FormOneDueDateEntry,
  FormOneEditReviewStatus,
  FormOneNotification,
  FormOneNotificationType,
  FormOnePendingEdit,
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
  ProblemCategory,
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
import { getAssignableTaskUsers } from "./task-assignees";
import { getGardenKey } from "./device-associations";
import { TBILISI_BOUNDS, clampLatLng, type LatLng } from "./geo";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role_name: string;
  initials: string;
  color: string;
  device_group_code: string | null;
  phone?: string | null;
  password_hash: string;
  must_change_password: boolean | number;
  twofa_enabled?: boolean | number;
  twofa_secret?: string | null;
  permissions: string | null;
  garden_codes?: string | null;
  deleted_at?: DatabaseDate | null;
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
  deleted_at?: DatabaseDate | null;
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
  deleted_at: DatabaseDate | null;
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
  has_cleared_history?: boolean | number | string;
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
const DEFAULT_BIOSTAR_SYNC_FAILURE_BACKOFF_MS = 5 * 60 * 1000;
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
    label: "პრობლემის დაფიქსირება: ნახვა",
    roles: ["admin", "dispatcher", GARDEN_ROLE_NAME],
  },
  {
    code: "problem_reports.create",
    label: "პრობლემის დაფიქსირება: დამატება",
    roles: ["admin", "dispatcher", GARDEN_ROLE_NAME],
  },
  {
    code: "problem_reports.edit",
    label: "პრობლემის დაფიქსირება: რედაქტირება",
    roles: ["admin", "dispatcher"],
  },
  {
    code: "problem_reports.delete",
    label: "პრობლემის დაფიქსირება: წაშლა",
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
    roles: ["admin"],
  },
  {
    code: "form_one.delete",
    label: "ფორმა ერთი: წაშლა",
    roles: ["admin"],
  },
  {
    code: "form_one.flag",
    label: "ფორმა ერთი: დახარვეზება",
    roles: ["admin"],
  },
];
const TASK_TAG_PERMISSIONS: {
  code: PermissionKey;
  label: string;
  roles: string[];
  /** When the permission first appears, also grant it to every role that
      already holds this one, so nobody loses what they could do before. */
  inheritFrom?: PermissionKey;
}[] = [
  {
    code: "tasks.tag_create",
    label: "დავალებები: ახალი ტეგის დამატება",
    roles: ["admin", "dispatcher"],
  },
  {
    code: "tasks.tag_delete",
    label: "დავალებები: ტეგის წაშლა",
    roles: ["admin"],
  },
  {
    code: "problem_reports.tag_create",
    label: "პრობლემის დაფიქსირება: ახალი ტეგის დამატება",
    roles: ["admin", "dispatcher"],
  },
  {
    code: "problem_reports.tag_delete",
    label: "პრობლემის დაფიქსირება: ტეგის წაშლა",
    roles: ["admin"],
  },
  // Renaming used to ride on the delete permission.
  {
    code: "tasks.tag_edit",
    label: "დავალებები: ტეგის რედაქტირება",
    roles: ["admin"],
    inheritFrom: "tasks.tag_delete",
  },
  {
    code: "problem_reports.tag_edit",
    label: "პრობლემის დაფიქსირება: ტეგის რედაქტირება",
    roles: ["admin"],
    inheritFrom: "problem_reports.tag_delete",
  },
  // Device and garden tags used to need only devices.edit.
  {
    code: "devices.tag_create",
    label: "მოწყობილობები: ახალი ტეგის დამატება",
    roles: ["admin"],
    inheritFrom: "devices.edit",
  },
  {
    code: "devices.tag_edit",
    label: "მოწყობილობები: ტეგის რედაქტირება",
    roles: ["admin"],
    inheritFrom: "devices.edit",
  },
  {
    code: "devices.tag_delete",
    label: "მოწყობილობები: ტეგის წაშლა",
    roles: ["admin"],
    inheritFrom: "devices.edit",
  },
];
const OFFLINE_MONITOR_PERMISSIONS: {
  code: PermissionKey;
  label: string;
  roles: string[];
}[] = [
  {
    code: "offline_records.alerts",
    label: "Offline მონიტორინგი: შეტყობინებები",
    roles: ["admin", "technician"],
  },
];

const ACCESS_PERMISSIONS = [
  ...PROBLEM_REPORT_PERMISSIONS,
  ...FORM_ONE_PERMISSIONS,
  ...TASK_TAG_PERMISSIONS,
  ...OFFLINE_MONITOR_PERMISSIONS,
];
let lastBiostarSyncAt = 0;
let nextBiostarSyncAllowedAt = 0;
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
  is_info: boolean | number;
  info_auto_done_days: number | null;
  info_auto_done_at: DatabaseDate | null;
  starts_at: DatabaseDate | null;
  due_date: DatabaseDate;
  created_at: DatabaseDate;
  completed_at: DatabaseDate | null;
  problem_report_id: string | null;
  assignee_ids: string | null;
  deleted_at: DatabaseDate | null;
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
  category_id: string | null;
  task_comment?: string | null;
  task_tags?: unknown;
  deleted_at: DatabaseDate | null;
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
  is_flagged: boolean | number | null;
  flag_comment: string | null;
  flagged_at: DatabaseDate | null;
  flagged_by: string | null;
  flagged_by_name: string | null;
  edit_review_status: FormOneEditReviewStatus | string | null;
  pending_edit: unknown;
  edit_requested_at: DatabaseDate | null;
  edit_requested_by: string | null;
  edit_requested_by_name: string | null;
  edit_review_comment: string | null;
  items: unknown;
  completed_items: unknown;
  created_by: string | null;
  created_at: DatabaseDate;
  updated_at: DatabaseDate;
  deleted_at?: DatabaseDate | null;
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

/** Garden scope check: null/undefined = every garden (see garden-scope.ts). */
function isGardenAllowed(
  allowed: readonly string[] | null | undefined,
  gardenCode: string | null | undefined,
) {
  return !allowed || allowed.includes(String(gardenCode ?? ""));
}

const toDateTimeString = (value: DatabaseDate) =>
  value instanceof Date ? value.toISOString() : value;

/*
 * A datetime read back as ISO ("…T09:30:00.000Z") is rejected by a strict
 * sql_mode, so it goes back as a Date: with the pool's timezone "Z" mysql2
 * writes it as the same wall clock it was read from.
 */
/*
 * tasks.completed_at follows the status: stamped when a task becomes done,
 * cleared when it leaves done, kept while it stays done. `next` is the SQL
 * for the new status; the fragment must precede `status = …` in the SET,
 * because MySQL assigns left to right and this reads the old status.
 */
const completedAtAssignment = (next: string) => `
  completed_at = case
    when ${next} <> 'done' then null
    when status = 'done' then completed_at
    else current_timestamp
  end`;

const toDateTimeParam = (value?: string) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

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

const getSyncFailureBackoffMs = () => {
  const configured = Number(process.env.BIOSTAR2_SYNC_FAILURE_BACKOFF_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_BIOSTAR_SYNC_FAILURE_BACKOFF_MS;
};

export async function syncBiostarDevices({
  force = false,
}: { force?: boolean } = {}) {
  if (!hasBiostarConfig() || isBuildTime()) {
    return { synced: 0, syncedAt: new Date().toISOString() };
  }

  const now = Date.now();
  if (!force && nextBiostarSyncAllowedAt && now < nextBiostarSyncAllowedAt) {
    return {
      synced: 0,
      syncedAt: new Date(lastBiostarSyncAt || now).toISOString(),
    };
  }

  if (!force && lastBiostarSyncAt && now - lastBiostarSyncAt < getSyncTtlMs()) {
    return { synced: 0, syncedAt: new Date(lastBiostarSyncAt).toISOString() };
  }

  if (!biostarSyncPromise) {
    biostarSyncPromise = runBiostarDeviceSync()
      .catch((error) => {
        nextBiostarSyncAllowedAt = Date.now() + getSyncFailureBackoffMs();
        throw error;
      })
      .finally(() => {
        biostarSyncPromise = null;
      });
  }

  return biostarSyncPromise;
}

async function runBiostarDeviceSync() {
  await ensureOperationalSchema();
  const biostarDevices = await fetchBiostarDevices();
  const syncedAt = new Date();
  nextBiostarSyncAllowedAt = 0;

  if (!biostarDevices.length) {
    lastBiostarSyncAt = syncedAt.getTime();
    await recordSyncRun(syncedAt);
    return { synced: 0, syncedAt: syncedAt.toISOString() };
  }

  const synced = await withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        for (const device of biostarDevices) {
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
          );
      }

      // New devices from BioStar join their garden's region straight away.
      await applyGardenRegions(connection).catch((error) => {
        console.error("[biostar-sync] garden regions not applied", error);
      });
      await connection.commit();
      return biostarDevices.length;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  lastBiostarSyncAt = syncedAt.getTime();
  if (synced !== null) {
    await recordSyncRun(syncedAt);
  }
  return { synced: synced ?? 0, syncedAt: syncedAt.toISOString() };
}

async function ensureOperationalSchema() {
  if (isBuildTime()) {
    return;
  }

  if (!operationalSchemaPromise) {
    operationalSchemaPromise = withConnection(async (connection) => {
      // Seed the task-visibility permission rows so they exist to grant even
      // before any role is saved through the Permissions UI.
      for (const key of [
        "tasks.view_all",
        "tasks.info",
        "tasks.assignable",
      ]) {
        const [pageKey, actionKey] = key.split(".");
        await connection.query(
          `insert ignore into permissions (id, code, label, page_key, action_key)
           values (?, ?, ?, ?, ?)`,
          [makeStableId("perm", key), key, key, pageKey, actionKey],
        );
      }
      // One-time: dispatcher/technician keep full task visibility when the
      // new scoping permissions ship, so their workflow doesn't change —
      // every other role (including new ones) defaults to seeing only its
      // own assigned tasks, per the task-visibility feature's design. Gated
      // by a migration marker (not a bare "insert ignore if missing") so an
      // admin who later removes this via the Permissions page stays removed
      // — otherwise the grant would silently reappear on every server
      // restart/redeploy, since ensureOperationalSchema() re-runs then.
      await connection.query(`
        create table if not exists app_migrations (
          id varchar(64) primary key,
          applied_at timestamp not null default current_timestamp
        )
      `);
      const [seedRows] = await connection.query<RowDataPacket[]>(
        `select 1 from app_migrations where id = 'tasks_view_all_seed_v1' limit 1`,
      );
      if (seedRows.length === 0) {
        for (const roleName of ["dispatcher", "technician"]) {
          await connection.query(
            `insert ignore into role_permissions (role_id, permission_id)
             select r.id, p.id from roles r, permissions p
             where r.name = ? and p.code = 'tasks.view_all'`,
            [roleName],
          );
        }
        await connection.query(
          `insert ignore into app_migrations (id) values ('tasks_view_all_seed_v1')`,
        );
      }
      // One-time: who can be a task/problem-report assignee used to be the
      // hardcoded admin/dispatcher/technician role list in
      // src/lib/task-assignees.ts — now it's the tasks.assignable
      // permission instead, seeded onto exactly those same three roles so
      // assignment behavior doesn't change. Marker-gated for the same
      // reason as tasks_view_all_seed_v1: an admin's later removal of this
      // via the Permissions page must stick across restarts.
      const [assignableSeedRows] = await connection.query<RowDataPacket[]>(
        `select 1 from app_migrations where id = 'tasks_assignable_seed_v1' limit 1`,
      );
      if (assignableSeedRows.length === 0) {
        for (const roleName of ["admin", "dispatcher", "technician"]) {
          await connection.query(
            `insert ignore into role_permissions (role_id, permission_id)
             select r.id, p.id from roles r, permissions p
             where r.name = ? and p.code = 'tasks.assignable'`,
            [roleName],
          );
        }
        await connection.query(
          `insert ignore into app_migrations (id) values ('tasks_assignable_seed_v1')`,
        );
      }
      // One-time: the catalog now lists only functions that gate something
      // real (see permission-catalog.ts). Each new key goes to the roles that
      // could already do that thing through the key that used to gate it, and
      // the keys that gated nothing are dropped.
      const [catalogRows] = await connection.query<RowDataPacket[]>(
        `select 1 from app_migrations where id = 'feature_catalog_v1' limit 1`,
      );
      if (catalogRows.length === 0) {
        const grants: [string, string][] = [
          ["dashboard.location_edit", "devices.edit"],
          ["dashboard.task_create", "tasks.create"],
          ["dashboard.refresh", "dashboard.view"],
          ["analytics.export", "analytics.view"],
          ["offline_records.delete", "offline_records.edit"],
        ];
        for (const [key, from] of grants) {
          const [pageKey, actionKey] = key.split(".");
          await connection.query(
            `insert ignore into permissions (id, code, label, page_key, action_key)
             values (?, ?, ?, ?, ?)`,
            [makeStableId("perm", key), key, key, pageKey, actionKey],
          );
          await connection.query(
            `insert ignore into role_permissions (role_id, permission_id)
             select rp.role_id, target.id
             from role_permissions rp
             join permissions source on source.id = rp.permission_id
             join permissions target on target.code = ?
             where source.code = ?`,
            [key, from],
          );
        }
        const dropped = [
          "dashboard.create",
          "dashboard.edit",
          "dashboard.delete",
          "analytics.create",
          "analytics.edit",
          "analytics.delete",
          "tasks.view_assigned",
        ];
        await connection.query(
          `delete rp from role_permissions rp
           join permissions p on p.id = rp.permission_id
           where p.code in (?)`,
          [dropped],
        );
        await connection.query(
          `insert ignore into app_migrations (id) values ('feature_catalog_v1')`,
        );
      }
      // Drop FK on audit_logs.user_id so unknown/deleted user IDs are accepted
      const [auditFkRows] = await connection.query<RowDataPacket[]>(
        `select 1 from information_schema.TABLE_CONSTRAINTS
         where TABLE_SCHEMA = database() and TABLE_NAME = 'audit_logs'
           and CONSTRAINT_NAME = 'fk_audit_logs_user' and CONSTRAINT_TYPE = 'FOREIGN KEY'
         limit 1`,
      );
      if (auditFkRows.length > 0) {
        await connection.query(
          "alter table audit_logs drop foreign key fk_audit_logs_user",
        );
      }
      await connection.query(
        "alter table devices modify status enum('online', 'offline', 'error') not null default 'online'",
      );
      await connection.query(
        "alter table status_events modify status enum('online', 'offline', 'error') not null",
      );
      await connection.query(
        "alter table tasks modify priority enum('low', 'normal', 'high', 'urgent') not null default 'normal'",
      );
      await addColumnIfMissing(
        connection,
        await getTableColumns(connection, "tags"),
        "tags",
        "deleted_at",
        "deleted_at timestamp null",
      );
      const regionColumns = await getTableColumns(connection, "regions");
      await addColumnIfMissing(
        connection,
        regionColumns,
        "regions",
        "deleted_at",
        "deleted_at timestamp null",
      );
      const deviceColumns = await getTableColumns(connection, "devices");
      // Soft delete: nothing is ever removed from the database (logic.md §5).
      await addColumnIfMissing(
        connection,
        deviceColumns,
        "devices",
        "deleted_at",
        "deleted_at timestamp null",
      );
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
      await addColumnIfMissing(
        connection,
        taskColumns,
        "tasks",
        "is_info",
        "is_info boolean not null default false after tags",
      );
      await addColumnIfMissing(
        connection,
        taskColumns,
        "tasks",
        "info_auto_done_days",
        "info_auto_done_days int null after is_info",
      );
      await addColumnIfMissing(
        connection,
        taskColumns,
        "tasks",
        "info_auto_done_at",
        "info_auto_done_at datetime null after info_auto_done_days",
      );
      // Soft delete: a deleted task (and its linked report) can be restored.
      await addColumnIfMissing(
        connection,
        taskColumns,
        "tasks",
        "deleted_at",
        "deleted_at timestamp null",
      );
      // When the task was closed — the task statistics measure from it.
      if (
        await addColumnIfMissing(
          connection,
          taskColumns,
          "tasks",
          "completed_at",
          "completed_at timestamp null after due_date",
        )
      ) {
        await backfillTaskCompletedAt(connection);
      }
      const userColumns = await getTableColumns(connection, "users");
      // A deleted user is is_active = false; this records when.
      await addColumnIfMissing(
        connection,
        userColumns,
        "users",
        "deleted_at",
        "deleted_at timestamp null",
      );
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
        "phone",
        "phone varchar(80) null after email",
      );
      await addColumnIfMissing(
        connection,
        userColumns,
        "users",
        "must_change_password",
        "must_change_password boolean not null default false after is_active",
      );
      await addColumnIfMissing(
        connection,
        userColumns,
        "users",
        "twofa_enabled",
        "twofa_enabled boolean not null default false after must_change_password",
      );
      await addColumnIfMissing(
        connection,
        userColumns,
        "users",
        "twofa_secret",
        "twofa_secret varchar(64) null after twofa_enabled",
      );
      await addColumnIfMissing(
        connection,
        userColumns,
        "users",
        "twofa_backup_codes",
        "twofa_backup_codes json null after twofa_secret",
      );
      await addColumnIfMissing(
        connection,
        userColumns,
        "users",
        "twofa_enrolled_at",
        "twofa_enrolled_at timestamp null after twofa_backup_codes",
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
      // "Clear history" hides periods instead of deleting them; the counters
      // it resets are kept here so "restore history" can add them back.
      await addColumnIfMissing(
        connection,
        monitoredColumns,
        "monitored_devices",
        "cleared_offline_count",
        "cleared_offline_count int not null default 0",
      );
      await addColumnIfMissing(
        connection,
        monitoredColumns,
        "monitored_devices",
        "cleared_last_offline_at",
        "cleared_last_offline_at datetime null",
      );
      await addColumnIfMissing(
        connection,
        await getTableColumns(connection, "monitored_device_offline_periods"),
        "monitored_device_offline_periods",
        "cleared_at",
        "cleared_at timestamp null",
      );
      // Removing a device from the X-Station frequency hides its rows.
      await addColumnIfMissing(
        connection,
        await getTableColumns(connection, "offline_snapshot_devices"),
        "offline_snapshot_devices",
        "removed_at",
        "removed_at timestamp null",
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
      // Soft delete: a deleted Form 1 stays (with its notifications), hidden.
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "deleted_at",
        "deleted_at timestamp null",
      );
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
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "is_flagged",
        "is_flagged tinyint(1) not null default 0 after rejection_comments",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "flag_comment",
        "flag_comment text null after is_flagged",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "flagged_at",
        "flagged_at datetime null after flag_comment",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "flagged_by",
        "flagged_by varchar(64) null after flagged_at",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "flagged_by_name",
        "flagged_by_name varchar(160) null after flagged_by",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "edit_review_status",
        "edit_review_status enum('none', 'pending', 'rejected') not null default 'none' after flagged_by_name",
      );
      await connection.query(
        "alter table form_one_records modify edit_review_status enum('none', 'pending', 'rejected') not null default 'none'",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "pending_edit",
        "pending_edit json null after edit_review_status",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "edit_requested_at",
        "edit_requested_at datetime null after pending_edit",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "edit_requested_by",
        "edit_requested_by varchar(64) null after edit_requested_at",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "edit_requested_by_name",
        "edit_requested_by_name varchar(160) null after edit_requested_by",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "edit_review_comment",
        "edit_review_comment text null after edit_requested_by_name",
      );
      await addColumnIfMissing(
        connection,
        formOneColumns,
        "form_one_records",
        "completed_items",
        "completed_items json null after items",
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
      // An optional feature must never take login down with it: if its
      // tables can't be created, log it and carry on without categories.
      try {
        await ensureProblemCategorySchema(connection);
      } catch (error) {
        console.error("[schema] problem categories unavailable", error);
      }
      try {
        await ensureGardenTagSchema(connection);
      } catch (error) {
        console.error("[schema] garden tags unavailable", error);
      }
      try {
        await ensureGardenRegionSchema(connection);
      } catch (error) {
        console.error("[schema] garden regions unavailable", error);
      }
      await ensureTaskTagCatalog(connection);
      await ensureProblemReportAccess(connection);
      await ensureUserGardens(connection);
      // One row per successful BioStar sync: which days the 5-minute check
      // actually ran (Offline calendar, deploy/logic.md).
      await connection.query(
        "create table if not exists biostar_sync_runs (synced_at datetime not null primary key)",
      );
      await ensureProblemReportTaskView(connection);
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

/**
 * One-off, when tasks.completed_at is added: a task that is already done gets
 * the time of its last move to done from the audit log — a status change in
 * `changes`, or (older rows) the first of the trailing run of rows saved with
 * status done. Without any such row, its last update stands in.
 */
async function backfillTaskCompletedAt(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(`
    select t.id, t.updated_at, al.created_at, al.metadata
    from tasks t
    left join audit_logs al
      on al.entity_type = 'task' and al.entity_id = t.id
    where t.status = 'done' and t.completed_at is null
    order by t.id, al.created_at asc
  `);

  const doneSince = new Map<string, { at: DatabaseDate; fallback: DatabaseDate }>();
  const trailingDone = new Map<string, DatabaseDate | null>();
  for (const row of rows) {
    const taskId = String(row.id);
    if (!doneSince.has(taskId)) {
      doneSince.set(taskId, { at: row.updated_at, fallback: row.updated_at });
    }
    if (!row.created_at) {
      continue;
    }
    const metadata = (parseAuditMetadata(row.metadata) ?? {}) as {
      status?: string;
      changes?: { field?: string; to?: string }[];
    };
    const statusChange = Array.isArray(metadata.changes)
      ? metadata.changes.find((change) => change?.field === "status")
      : undefined;
    const status = statusChange?.to ?? metadata.status;
    if (status === undefined) {
      continue;
    }
    if (status === "done") {
      if (statusChange || !trailingDone.get(taskId)) {
        trailingDone.set(taskId, row.created_at);
      }
    } else {
      trailingDone.set(taskId, null);
    }
  }

  for (const [taskId, entry] of doneSince) {
    await connection.query("update tasks set completed_at = ? where id = ?", [
      trailingDone.get(taskId) ?? entry.fallback,
      taskId,
    ]);
  }
}

async function addColumnIfMissing(
  connection: PoolConnection,
  columns: Set<string>,
  tableName:
    | "devices"
    | "tasks"
    | "users"
    | "monitored_devices"
    | "form_one_records"
    | "problem_reports"
    | "regions"
    | "tags"
    | "task_tags"
    | "monitored_device_offline_periods"
    | "offline_snapshot_devices",
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

/* Problem categories (admin page /admin/problem-categories): a garden
   picks one instead of typing a title, and the category's linked users and
   roles become the report's assignees automatically. */
const DEFAULT_PROBLEM_CATEGORIES = [
  "კამერები",
  "სწრებადობა",
  "ინტერნეტი",
  "UPS",
  "პროგრამების ინსტალაცია",
];

/* Columns that reference another table must share its charset and
   collation, or MySQL rejects the foreign key (ER_FK_INCOMPATIBLE_COLUMNS).
   Older tables can differ from the server default, so read the real one. */
async function getColumnCharset(
  connection: PoolConnection,
  tableName: string,
  columnName: string,
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `
      select character_set_name, collation_name
      from information_schema.columns
      where table_schema = database() and table_name = ? and column_name = ?
      limit 1
    `,
    [tableName, columnName],
  );
  const charset = String(rows[0]?.character_set_name ?? rows[0]?.CHARACTER_SET_NAME ?? "");
  const collation = String(rows[0]?.collation_name ?? rows[0]?.COLLATION_NAME ?? "");
  const safe = /^[a-z0-9_]+$/;
  return safe.test(charset) && safe.test(collation) ? { charset, collation } : null;
}

function charsetClause(target: { charset: string; collation: string } | null) {
  return target ? `character set ${target.charset} collate ${target.collation}` : "";
}

async function ensureProblemCategorySchema(connection: PoolConnection) {
  const userIdCharset = await getColumnCharset(connection, "users", "id");
  const roleIdCharset = await getColumnCharset(connection, "roles", "id");
  const tableDefaults = userIdCharset
    ? `default charset=${userIdCharset.charset} collate=${userIdCharset.collation}`
    : "";

  await connection.query(`
    create table if not exists problem_categories (
      id varchar(64) primary key,
      title varchar(160) not null,
      is_active boolean not null default true,
      sort_order int not null default 0,
      deleted_at timestamp null,
      created_by varchar(64) null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp,
      index idx_problem_categories_state (deleted_at, is_active, sort_order)
    ) ${tableDefaults}
  `);
  // The table may already exist with another collation (e.g. from a failed
  // earlier start), so the link columns follow whatever it really has.
  const categoryIdCharset = await getColumnCharset(connection, "problem_categories", "id");

  await connection.query(`
    create table if not exists problem_category_users (
      category_id varchar(64) ${charsetClause(categoryIdCharset)} not null,
      user_id varchar(64) ${charsetClause(userIdCharset)} not null,
      primary key (category_id, user_id),
      constraint fk_problem_category_users_category foreign key (category_id) references problem_categories(id) on delete cascade,
      constraint fk_problem_category_users_user foreign key (user_id) references users(id) on delete cascade,
      index fk_problem_category_users_user (user_id)
    ) ${tableDefaults}
  `);
  await connection.query(`
    create table if not exists problem_category_roles (
      category_id varchar(64) ${charsetClause(categoryIdCharset)} not null,
      role_id varchar(64) ${charsetClause(roleIdCharset)} not null,
      primary key (category_id, role_id),
      constraint fk_problem_category_roles_category foreign key (category_id) references problem_categories(id) on delete cascade,
      constraint fk_problem_category_roles_role foreign key (role_id) references roles(id) on delete cascade,
      index fk_problem_category_roles_role (role_id)
    ) ${tableDefaults}
  `);

  const reportColumns = await getTableColumns(connection, "problem_reports");
  await addColumnIfMissing(
    connection,
    reportColumns,
    "problem_reports",
    "category_id",
    "category_id varchar(64) null after task_id",
  );
  await addColumnIfMissing(
    connection,
    reportColumns,
    "problem_reports",
    "deleted_at",
    "deleted_at timestamp null",
  );

  // One-time starter list, marker-gated so a category an admin deletes
  // doesn't come back on the next restart.
  await connection.query(`
    create table if not exists app_migrations (
      id varchar(64) primary key,
      applied_at timestamp not null default current_timestamp
    )
  `);
  const [seedRows] = await connection.query<RowDataPacket[]>(
    "select 1 from app_migrations where id = 'problem_categories_seed_v1' limit 1",
  );
  if (seedRows.length === 0) {
    for (const [index, title] of DEFAULT_PROBLEM_CATEGORIES.entries()) {
      await connection.query(
        "insert ignore into problem_categories (id, title, sort_order) values (?, ?, ?)",
        [makeStableId("pcat", title), title, index],
      );
    }
    await connection.query(
      "insert ignore into app_migrations (id) values ('problem_categories_seed_v1')",
    );
  }
}

/* A garden (the "1" in devices "1-1", "1-2") carries its own tags from the
   device tag catalog (`tags`), shown next to the garden on the devices page. */
async function ensureGardenTagSchema(connection: PoolConnection) {
  const tagIdCharset = await getColumnCharset(connection, "tags", "id");
  await connection.query(`
    create table if not exists garden_tags (
      garden_key varchar(80) not null,
      tag_id varchar(64) ${charsetClause(tagIdCharset)} not null,
      primary key (garden_key, tag_id),
      constraint fk_garden_tags_tag foreign key (tag_id) references tags(id) on delete cascade,
      index fk_garden_tags_tag (tag_id)
    ) ${tagIdCharset ? `default charset=${tagIdCharset.charset} collate=${tagIdCharset.collation}` : ""}
  `);

  // One-time: tags now live on gardens only. Every device tag moves to its
  // garden (no duplicates) and is then removed from the device.
  const [movedRows] = await connection.query<RowDataPacket[]>(
    "select 1 from app_migrations where id = 'device_tags_to_garden_v1' limit 1",
  );
  if (movedRows.length) {
    return;
  }
  const [links] = await connection.query<RowDataPacket[]>(
    "select d.name, dt.tag_id from device_tags dt join devices d on d.id = dt.device_id",
  );
  for (const link of links) {
    const gardenKey = getGardenKey(String(link.name)).slice(0, 80);
    if (gardenKey) {
      await connection.query(
        "insert ignore into garden_tags (garden_key, tag_id) values (?, ?)",
        [gardenKey, link.tag_id],
      );
    }
  }
  await connection.query("delete from device_tags");
  await connection.query(
    "insert ignore into app_migrations (id) values ('device_tags_to_garden_v1')",
  );
}

/* The region belongs to the garden ("5" for devices 5-1, 5-2); every device
   copies it into devices.region_id, so everything that reads a device's
   region (map, analytics, filters) sees its garden's region. */
async function ensureGardenRegionSchema(connection: PoolConnection) {
  const regionIdCharset = await getColumnCharset(connection, "regions", "id");
  await connection.query(`
    create table if not exists garden_regions (
      garden_key varchar(80) primary key,
      region_id varchar(64) ${charsetClause(regionIdCharset)} not null,
      constraint fk_garden_regions_region foreign key (region_id) references regions(id) on delete cascade,
      index fk_garden_regions_region (region_id)
    ) ${regionIdCharset ? `default charset=${regionIdCharset.charset} collate=${regionIdCharset.collation}` : ""}
  `);

  // One-time: each garden takes the region most of its devices already
  // had (ignoring devices with none), then all its devices are aligned.
  const [seedRows] = await connection.query<RowDataPacket[]>(
    "select 1 from app_migrations where id = 'garden_regions_seed_v1' limit 1",
  );
  if (seedRows.length) {
    return;
  }

  const [devices] = await connection.query<RowDataPacket[]>(
    "select name, region_id from devices where region_id is not null",
  );
  const counts = new Map<string, Map<string, number>>();
  for (const device of devices) {
    const key = getGardenKey(String(device.name));
    if (!key) {
      continue;
    }
    const regionCounts = counts.get(key) ?? new Map<string, number>();
    const regionId = String(device.region_id);
    regionCounts.set(regionId, (regionCounts.get(regionId) ?? 0) + 1);
    counts.set(key, regionCounts);
  }
  for (const [gardenKey, regionCounts] of counts) {
    const [regionId] = [...regionCounts].sort((a, b) => b[1] - a[1])[0];
    await connection.query(
      "insert ignore into garden_regions (garden_key, region_id) values (?, ?)",
      [gardenKey.slice(0, 80), regionId],
    );
  }
  await applyGardenRegions(connection);
  await connection.query(
    "insert ignore into app_migrations (id) values ('garden_regions_seed_v1')",
  );
}

/**
 * Copies each garden's region onto its devices (all gardens, or one).
 * Devices of a garden without a region become unassigned.
 */
async function applyGardenRegions(connection: PoolConnection, gardenKey?: string) {
  const [gardenRows] = await connection.query<RowDataPacket[]>(
    "select garden_key, region_id from garden_regions",
  );
  const regionByGarden = new Map(
    gardenRows.map((row) => [String(row.garden_key), String(row.region_id)]),
  );
  const [devices] = await connection.query<RowDataPacket[]>(
    "select id, name, region_id from devices",
  );

  for (const device of devices) {
    const key = getGardenKey(String(device.name));
    if (gardenKey !== undefined && key !== gardenKey) {
      continue;
    }
    const target = regionByGarden.get(key) ?? null;
    const current = device.region_id ? String(device.region_id) : null;
    if (target !== current) {
      await connection.query("update devices set region_id = ? where id = ?", [
        target,
        device.id,
      ]);
    }
  }
}

/** The region id a device named `deviceName` gets from its garden;
    undefined when garden regions aren't available (old behaviour). */
async function getGardenRegionId(connection: PoolConnection, deviceName: string) {
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "select region_id from garden_regions where garden_key = ? limit 1",
      [getGardenKey(deviceName)],
    );
    return rows[0]?.region_id ? String(rows[0].region_id) : null;
  } catch {
    return undefined;
  }
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

  /* Default roles are granted only when a permission first appears. After
     that the Permissions page owns role_permissions, so a restart or deploy
     never re-enables what an admin switched off. */
  for (const permission of ACCESS_PERMISSIONS) {
    const [pageKey, actionKey] = permission.code.split(".");
    const [inserted] = await connection.query<ResultSetHeader>(
      `
        insert ignore into permissions (id, code, label, page_key, action_key)
        values (?, ?, ?, ?, ?)
      `,
      [
        makeStableId("perm", permission.code),
        permission.code,
        permission.label,
        pageKey,
        actionKey,
      ],
    );
    await connection.query<ResultSetHeader>(
      `
        update permissions
        set label = ?, page_key = ?, action_key = ?
        where code = ?
      `,
      [permission.label, pageKey, actionKey, permission.code],
    );

    const inheritFrom =
      "inheritFrom" in permission ? permission.inheritFrom : undefined;
    if (inserted.affectedRows === 1 && inheritFrom) {
      await connection.query<ResultSetHeader>(
        `
          insert ignore into role_permissions (role_id, permission_id)
          select rp.role_id, newp.id
          from role_permissions rp
          join permissions oldp on oldp.id = rp.permission_id and oldp.code = ?
          join permissions newp on newp.code = ?
        `,
        [inheritFrom, permission.code],
      );
    }

    if (inserted.affectedRows === 1 && permission.roles.length) {
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

  // Soft delete: a deleted tag stays here (and on its tasks), only hidden.
  await addColumnIfMissing(
    connection,
    await getTableColumns(connection, "task_tags"),
    "task_tags",
    "deleted_at",
    "deleted_at timestamp null",
  );

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

/*
 * A user's gardens (garden code = getDeviceGroupCode of the garden's
 * devices). Problem reports and form one show a linked user only those
 * gardens; see garden-scope.ts.
 */
async function ensureUserGardens(connection: PoolConnection) {
  // user_id is compared with users.id, so it must share its collation or
  // MySQL refuses the join (ER_CANT_AGGREGATE_2COLLATIONS).
  const userIdCharset = await getColumnCharset(connection, "users", "id");
  await connection.query(`
    create table if not exists user_gardens (
      user_id varchar(64) not null,
      garden_code varchar(80) not null,
      primary key (user_id, garden_code),
      key idx_user_gardens_code (garden_code)
    ) ${userIdCharset ? `default charset=${userIdCharset.charset} collate=${userIdCharset.collation}` : ""}
  `);
  // A table created before this fix took the server default; convert it.
  const gardenUserCharset = await getColumnCharset(connection, "user_gardens", "user_id");
  if (userIdCharset && gardenUserCharset?.collation !== userIdCharset.collation) {
    await connection.query(
      `alter table user_gardens convert to character set ${userIdCharset.charset} collate ${userIdCharset.collation}`,
    );
  }

  // One-time: each garden account keeps its own garden as a link, and every
  // existing role except "garden" keeps seeing all gardens when its users
  // have none linked. New roles start without it (only linked gardens).
  const [rows] = await connection.query<RowDataPacket[]>(
    `select 1 from app_migrations where id = 'user_gardens_v1' limit 1`,
  );
  if (rows.length) {
    return;
  }
  await connection.query(
    `insert ignore into user_gardens (user_id, garden_code)
     select id, device_group_code from users
     where is_active = true and device_group_code is not null and device_group_code <> ''`,
  );
  for (const key of ["problem_reports.all_gardens", "form_one.all_gardens"]) {
    const [pageKey, actionKey] = key.split(".");
    await connection.query(
      `insert ignore into permissions (id, code, label, page_key, action_key)
       values (?, ?, ?, ?, ?)`,
      [makeStableId("perm", key), key, key, pageKey, actionKey],
    );
    await connection.query(
      `insert ignore into role_permissions (role_id, permission_id)
       select r.id, p.id from roles r, permissions p
       where r.name <> ? and p.code = ?`,
      [GARDEN_ROLE_NAME, key],
    );
  }
  await connection.query(
    `insert ignore into app_migrations (id) values ('user_gardens_v1')`,
  );
}

/*
 * One-time: whoever already sees problem reports also sees the linked task's
 * tags and comment, so the new switches change nothing until an admin turns
 * them off. New roles start without them.
 */
async function ensureProblemReportTaskView(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `select 1 from app_migrations where id = 'problem_report_task_view_v1' limit 1`,
  );
  if (rows.length) {
    return;
  }
  for (const key of ["problem_reports.task_tags", "problem_reports.task_comment"]) {
    const [pageKey, actionKey] = key.split(".");
    await connection.query(
      `insert ignore into permissions (id, code, label, page_key, action_key)
       values (?, ?, ?, ?, ?)`,
      [makeStableId("perm", key), key, key, pageKey, actionKey],
    );
    await connection.query(
      `insert ignore into role_permissions (role_id, permission_id)
       select rp.role_id, target.id
       from role_permissions rp
       join permissions source on source.id = rp.permission_id
       join permissions target on target.code = ?
       where source.code = 'problem_reports.view'`,
      [key],
    );
  }
  await connection.query(
    `insert ignore into app_migrations (id) values ('problem_report_task_view_v1')`,
  );
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
    "select code, name from devices where is_excluded = false and deleted_at is null order by code",
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
    await connection.query(
      `insert ignore into user_gardens (user_id, garden_code)
       select id, ? from users where email = ?`,
      [groupCode, email],
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
        u.twofa_enabled,
        u.twofa_secret,
        (
          select group_concat(ug.garden_code order by length(ug.garden_code), ug.garden_code separator ',')
          from user_gardens ug
          where ug.user_id = u.id
        ) as garden_codes,
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
    // mockUsers (including its fixed, publicly-visible admin credential) is
    // meant only for `next build`'s static generation, when no real DB is
    // reachable — never as a live login fallback. A transient DB hiccup at
    // runtime must fail the lookup, not silently authenticate against a
    // hardcoded account.
    if (!isBuildTime()) {
      console.warn("[auth] DB unavailable during login lookup by email; refusing to fall back to mock data.");
      return null;
    }
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
    twoFactorEnabled: Boolean(row.twofa_enabled),
    twoFactorSecret: row.twofa_secret ?? undefined,
    gardenCodes: csv(row.garden_codes),
    permissions: csv(row.permissions) as PermissionKey[],
  };
}

/**
 * Every identifier getUserByLogin accepts for an active user, in the
 * portal's key format: a lower-cased email.
 */
export async function getLoginIdentifiers(): Promise<string[] | null> {
  await ensureOperationalSchema();
  const rows = await queryRows<{ email: string | null }>(
    "select email from users where is_active = true",
  );
  if (!rows) {
    return null;
  }

  const identifiers = new Set<string>();
  for (const row of rows) {
    const email = String(row.email || "").trim().toLowerCase();
    if (email) {
      identifiers.add(email);
    }
  }
  return [...identifiers];
}

/** Accounts sign in by email only; X-Station codes are no longer accepted. */
export async function getUserByLogin(identifier: string): Promise<AppUser | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized.includes("@")) {
    return null;
  }
  return getUserByEmail(normalized);
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

export async function getUsers({
  includeDeleted = false,
}: {
  /** Deleted (deactivated) users too — the users page's "deleted" filter. */
  includeDeleted?: boolean;
} = {}): Promise<SessionUser[]> {
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
        u.phone,
        u.must_change_password,
        (
          select group_concat(ug.garden_code order by length(ug.garden_code), ug.garden_code separator ',')
          from user_gardens ug
          where ug.user_id = u.id
        ) as garden_codes,
        group_concat(distinct p.code order by p.code separator ',') as permissions,
        -- Users deleted before deleted_at existed fall back to updated_at.
        if(u.is_active, null, coalesce(u.deleted_at, u.updated_at)) as deleted_at
      from users u
      join roles r on r.id = u.role_id
      left join role_permissions rp on rp.role_id = r.id
      left join permissions p on p.id = rp.permission_id
      ${includeDeleted ? "" : "where u.is_active = true"}
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
    phone: row.phone ?? undefined,
    mustChangePassword: Boolean(row.must_change_password),
    gardenCodes: csv(row.garden_codes),
    permissions: csv(row.permissions) as PermissionKey[],
    deletedAt: row.deleted_at ? toDateTimeString(row.deleted_at) : undefined,
  }));
}

export async function getUserById(
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<SessionUser | null> {
  const users = await getUsers({ includeDeleted });
  return users.find((user) => user.id === id) ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  role: string;
  initials: string;
  color: string;
  phone?: string;
  passwordHash: string;
  gardenCodes?: string[];
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
        insert into users (id, role_id, name, email, phone, password_hash, initials, color, must_change_password)
        values (?, ?, ?, ?, ?, ?, ?, ?, true)
      `,
      [
        id,
        roleId,
        input.name,
        input.email,
        input.phone || null,
        input.passwordHash,
        input.initials,
        input.color,
      ],
    );
    await replaceUserGardens(connection, id, input.gardenCodes ?? []);

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
      phone: input.phone,
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
    phone?: string;
    passwordHash?: string;
    /** Replaces the user's gardens; undefined leaves them as they are. */
    gardenCodes?: string[];
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
          set role_id = ?, name = ?, email = ?, phone = ?, password_hash = ?, initials = ?, color = ?, must_change_password = true
          where id = ? and is_active = true
        `,
        [
          roleId,
          input.name,
          input.email,
          input.phone || null,
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
          set role_id = ?, name = ?, email = ?, phone = ?, initials = ?, color = ?
          where id = ? and is_active = true
        `,
        [roleId, input.name, input.email, input.phone || null, input.initials, input.color, id],
      );
    }
    if (input.gardenCodes) {
      await replaceUserGardens(connection, id, input.gardenCodes);
    }

    return getUserById(id);
  });

  return updated ?? null;
}

/** The gardens a user is linked to (user_gardens), replaced as a set. */
async function replaceUserGardens(
  connection: PoolConnection,
  userId: string,
  gardenCodes: string[],
) {
  await connection.query("delete from user_gardens where user_id = ?", [userId]);
  const codes = [...new Set(gardenCodes.map((code) => code.trim()).filter(Boolean))];
  if (codes.length) {
    await connection.query(
      "insert into user_gardens (user_id, garden_code) values ?",
      [codes.map((code) => [userId, code])],
    );
  }
}

/** Every garden code that has at least one device, for validating links. */
export async function getGardenCodes(): Promise<string[]> {
  const devices = await getDevices();
  return [...new Set(devices.map((device) => getDeviceGroupCode(device)).filter(Boolean))];
}

export async function deleteUser(id: string) {
  const deleted = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      "update users set is_active = false, deleted_at = current_timestamp where id = ? and is_active = true",
      [id],
    );
    return result.affectedRows > 0;
  });

  return deleted ?? false;
}

/* The account is kept (deactivated) on delete, so it can come back as it was. */
export async function restoreUser(id: string) {
  await ensureOperationalSchema();
  const restored = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      "update users set is_active = true, deleted_at = null where id = ? and is_active = false",
      [id],
    );
    return result.affectedRows > 0;
  });

  return restored ?? false;
}

export async function hasDeletedUserWithEmail(email: string) {
  const rows = await queryRows<{ id: string }>(
    "select id from users where email = ? and is_active = false limit 1",
    [email],
  );
  return Boolean(rows?.length);
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

export type TwoFactorRecord = {
  enabled: boolean;
  secret: string | null;
  backupCodeHashes: string[];
};

export async function getTwoFactorRecord(userId: string): Promise<TwoFactorRecord | null> {
  await ensureOperationalSchema();

  const rows = await queryRows<{
    twofa_enabled: boolean | number;
    twofa_secret: string | null;
    twofa_backup_codes: unknown;
  }>(
    `
      select twofa_enabled, twofa_secret, twofa_backup_codes
      from users
      where id = ? and is_active = true
      limit 1
    `,
    [userId],
  );

  const row = rows?.[0];
  if (!row) {
    return null;
  }

  return {
    enabled: Boolean(row.twofa_enabled),
    secret: row.twofa_secret ?? null,
    backupCodeHashes: parseJsonArray(row.twofa_backup_codes) as string[],
  };
}

// Stores a freshly generated secret without turning 2FA on yet — it only
// becomes active once confirmTwoFactorEnrollment verifies a live code
// against it. Re-running this (e.g. the user backs out and starts over)
// simply overwrites the still-unconfirmed secret.
export async function startTwoFactorEnrollment(userId: string, secret: string): Promise<boolean> {
  const updated = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `
        update users
        set twofa_secret = ?, twofa_enabled = false, twofa_backup_codes = null
        where id = ? and is_active = true
      `,
      [secret, userId],
    );
    return result.affectedRows > 0;
  });

  return updated ?? false;
}

export async function confirmTwoFactorEnrollment(
  userId: string,
  backupCodeHashes: string[],
): Promise<boolean> {
  const updated = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `
        update users
        set twofa_enabled = true, twofa_backup_codes = cast(? as json), twofa_enrolled_at = now()
        where id = ? and is_active = true
      `,
      [JSON.stringify(backupCodeHashes), userId],
    );
    return result.affectedRows > 0;
  });

  return updated ?? false;
}

export async function disableTwoFactor(userId: string): Promise<boolean> {
  const updated = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `
        update users
        set twofa_enabled = false, twofa_secret = null, twofa_backup_codes = null, twofa_enrolled_at = null
        where id = ? and is_active = true
      `,
      [userId],
    );
    return result.affectedRows > 0;
  });

  return updated ?? false;
}

/** Removes one used backup code from the stored list so it can't be replayed. */
export async function consumeBackupCode(userId: string, usedHash: string): Promise<boolean> {
  const updated = await withConnection(async (connection) => {
    const [rows] = await connection.query<RowDataPacket[]>(
      `select twofa_backup_codes from users where id = ? limit 1`,
      [userId],
    );
    const current = parseJsonArray(rows[0]?.twofa_backup_codes) as string[];
    const remaining = current.filter((hash) => hash !== usedHash);

    const [result] = await connection.query<ResultSetHeader>(
      `update users set twofa_backup_codes = cast(? as json) where id = ?`,
      [JSON.stringify(remaining), userId],
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
      "dashboard.refresh",
      "dashboard.location_edit",
      "dashboard.task_create",
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
      "form_one.flag",
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
      "analytics.export",
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

/** Human label for a role code (roles.name); falls back to the code. */
export async function getRoleLabel(name: string): Promise<string> {
  const rows = await queryRows<{ label: string }>(
    "select label from roles where name = ? limit 1",
    [name],
  ).catch(() => null);
  return rows?.[0]?.label || name;
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

export async function getDevices({
  includeDeleted = false,
}: {
  /** Deleted devices too — to show a deleted garden's name on its tasks. */
  includeDeleted?: boolean;
} = {}): Promise<Device[]> {
  if (isBuildTime()) {
    return mockDevices;
  }

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
        group_concat(distinct ad.name order by ad.name separator ',') as associated_devices,
        d.deleted_at
      from devices d
      left join regions r on r.id = d.region_id and r.deleted_at is null
      left join device_tags dt on dt.device_id = d.id
      left join tags t on t.id = dt.tag_id and t.deleted_at is null
      left join associated_devices ad on ad.device_id = d.id
      ${includeDeleted ? "" : "where d.deleted_at is null"}
      group by d.id, r.name
      order by d.code
    `,
  );

  if (!rows) {
    return mockDevices;
  }

  // Tags live on gardens; each device shows its garden's tags.
  const gardenTagRows = await queryRows<{ garden_key: string; name: string }>(
    "select gt.garden_key, t.name from garden_tags gt join tags t on t.id = gt.tag_id and t.deleted_at is null",
  ).catch(() => null);
  const tagsByGarden = new Map<string, string[]>();
  for (const row of gardenTagRows ?? []) {
    tagsByGarden.set(row.garden_key, [...(tagsByGarden.get(row.garden_key) ?? []), row.name]);
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
    tags: [
      ...new Set([
        ...(tagsByGarden.get(getGardenKey(row.name)) ?? []),
        ...csv(row.tags),
      ]),
    ].sort((a, b) => a.localeCompare(b, "ka")),
    position: clampLatLng({
      lat: Number(row.latitude),
      lng: Number(row.longitude),
    }),
    lastSeenAt: toDateTimeString(row.last_seen_at),
    associatedDevices: csv(row.associated_devices),
    problems: [],
    statusEvents: eventsByDevice.get(row.id) ?? [],
    deletedAt: row.deleted_at ? toDateTimeString(row.deleted_at) : undefined,
  }));
}

export async function getRegions({
  includeDeleted = false,
}: { includeDeleted?: boolean } = {}): Promise<Region[]> {
  await ensureOperationalSchema();
  const rows = await queryRows<RegionRow>(
    `select id, name, color, deleted_at from regions
     ${includeDeleted ? "" : "where deleted_at is null"}
     order by name`,
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
    deletedAt: row.deleted_at ? toDateTimeString(row.deleted_at) : undefined,
  }));
}

export async function getTaskTagNames(): Promise<string[]> {
  if (isBuildTime()) {
    return [...taskTagCatalog];
  }

  await ensureOperationalSchema();

  const rows = await queryRows<TaskTagRow>(
    "select name from task_tags where deleted_at is null order by name",
  );

  if (!rows) {
    return [...fallbackTaskTagNames];
  }

  return rows.map((row) => row.name);
}

/** Deleted task tags — listed for restoring, hidden everywhere else. */
export async function getDeletedTaskTagNames(): Promise<string[]> {
  if (isBuildTime()) {
    return [];
  }
  await ensureOperationalSchema();
  const rows = await queryRows<TaskTagRow>(
    "select name from task_tags where deleted_at is not null order by name",
  );
  return (rows ?? []).map((row) => row.name);
}

async function getDeletedTaskTagSet(connection?: PoolConnection) {
  if (connection) {
    const [rows] = await connection.query<RowDataPacket[]>(
      "select name from task_tags where deleted_at is not null",
    );
    return new Set(rows.map((row) => String(row.name)));
  }
  return new Set(await getDeletedTaskTagNames());
}

/** A task/report keeps the deleted tags it carried (hidden while deleted),
 *  so an edit doesn't drop them and restoring the tag brings them back. */
function withKeptDeletedTags(
  nextTags: string[],
  storedTags: unknown,
  deletedTags: Set<string>,
) {
  return normalizeTaskTags([
    ...nextTags,
    ...normalizeTaskTags(storedTags).filter((tag) => deletedTags.has(tag)),
  ]);
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
    "select name from tags where deleted_at is null order by name",
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

/** Deleted device tags — listed for restoring, hidden everywhere else. */
export async function getDeletedDeviceTagNames(): Promise<string[]> {
  if (isBuildTime()) {
    return [];
  }
  await ensureOperationalSchema();
  const rows = await queryRows<TaskTagRow>(
    "select name from tags where deleted_at is not null order by name",
  );
  return (rows ?? []).map((row) => row.name);
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

/* Soft delete: the tag's device and garden links stay, so restoring puts it
   back everywhere; while deleted it is hidden from every list and garden. */
export async function deleteDeviceTag(name: string) {
  const tagName = normalizeTaskTagName(name);
  if (!tagName) {
    return false;
  }
  return setDeletedAt("tags", tagName, true, "name");
}

export async function restoreDeviceTag(name: string) {
  const tagName = normalizeTaskTagName(name);
  if (!tagName) {
    return false;
  }
  return setDeletedAt("tags", tagName, false, "name");
}

/** Garden key → its tag names. Empty when the table isn't available. */
export async function getGardenTags(): Promise<Record<string, string[]>> {
  await ensureOperationalSchema();
  const rows = await queryRows<{ garden_key: string; name: string }>(
    `
      select gt.garden_key, t.name
      from garden_tags gt
      join tags t on t.id = gt.tag_id and t.deleted_at is null
      order by t.name
    `,
  ).catch((error) => {
    console.error("[garden-tags] unavailable", error);
    return null;
  });

  const result: Record<string, string[]> = {};
  for (const row of rows ?? []) {
    (result[row.garden_key] ??= []).push(row.name);
  }
  return result;
}

/** Replaces a garden's tags; names not in the device tag catalog are ignored. */
export async function setGardenTags(gardenKey: string, tagNames: string[]) {
  const key = gardenKey.trim().slice(0, 80);
  if (!key) {
    return null;
  }
  const names = [...new Set(tagNames.map(normalizeTaskTagName).filter(Boolean))];

  await ensureOperationalSchema();
  return withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      // Links to deleted tags stay, so restoring the tag brings them back.
      await connection.query(
        `delete gt from garden_tags gt join tags t on t.id = gt.tag_id
         where gt.garden_key = ? and t.deleted_at is null`,
        [key],
      );
      if (names.length) {
        await connection.query(
          `
            insert ignore into garden_tags (garden_key, tag_id)
            select ?, id from tags where name in (?) and deleted_at is null
          `,
          [key, names],
        );
      }
      const [rows] = await connection.query<RowDataPacket[]>(
        `
          select t.name from garden_tags gt
          join tags t on t.id = gt.tag_id and t.deleted_at is null
          where gt.garden_key = ? order by t.name
        `,
        [key],
      );
      await connection.commit();
      return rows.map((row) => String(row.name));
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

/**
 * Renames a device tag everywhere (devices and gardens). The row is moved
 * to the new name's stable id rather than renamed in place, so creating the
 * old name later makes a fresh tag instead of reviving this one. If the new
 * name already exists the two tags are merged.
 */
export async function renameDeviceTag(oldName: string, newName: string) {
  const from = normalizeTaskTagName(oldName);
  const to = normalizeTaskTagName(newName);
  if (!from || !to) {
    return null;
  }
  if (from === to) {
    return to;
  }

  await ensureOperationalSchema();
  return withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [oldRows] = await connection.query<RowDataPacket[]>(
        "select id, color from tags where name = ? and deleted_at is null limit 1 for update",
        [from],
      );
      const oldTag = oldRows[0];
      if (!oldTag) {
        await connection.rollback();
        return null;
      }

      const [newRows] = await connection.query<RowDataPacket[]>(
        "select id from tags where name = ? limit 1 for update",
        [to],
      );
      let newId = newRows[0]?.id ? String(newRows[0].id) : "";
      if (newId) {
        // Renaming onto a deleted tag merges into it, so it comes back.
        await connection.query("update tags set deleted_at = null where id = ?", [newId]);
      }
      if (!newId) {
        newId = makeStableId("tag", to);
        await connection.query(
          "insert into tags (id, name, color) values (?, ?, ?)",
          [newId, to, oldTag.color ?? "#64748b"],
        );
      }

      await connection.query(
        "insert ignore into device_tags (device_id, tag_id) select device_id, ? from device_tags where tag_id = ?",
        [newId, oldTag.id],
      );
      await connection.query(
        "insert ignore into garden_tags (garden_key, tag_id) select garden_key, ? from garden_tags where tag_id = ?",
        [newId, oldTag.id],
      ).catch(() => undefined);
      await connection.query("delete from tags where id = ?", [oldTag.id]);

      await connection.commit();
      return to;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

/**
 * Renames a task/problem-report tag in the catalog and in every task and
 * report that carries it (tags are stored by name in a JSON array).
 * Renaming onto an existing tag merges the two.
 */
export async function renameTaskTag(oldName: string, newName: string) {
  const from = normalizeTaskTagName(oldName);
  const to = normalizeTaskTagName(newName);
  if (!from || !to) {
    return null;
  }
  if (from === to) {
    return to;
  }

  await ensureOperationalSchema();
  return withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [result] = await connection.query<ResultSetHeader>(
        "delete from task_tags where name = ? and deleted_at is null",
        [from],
      );
      if (!result.affectedRows) {
        await connection.rollback();
        return null;
      }
      // Renaming onto a deleted tag merges into it, so it comes back.
      await connection.query(
        `insert into task_tags (id, name) values (?, ?)
         on duplicate key update deleted_at = null`,
        [makeStableId("tasktag", to), to],
      );

      for (const tableName of ["tasks", "problem_reports"] as const) {
        const [rows] = await connection.query<TaggedJsonRow[]>(
          `select id, tags from ${tableName} where tags is not null`,
        );
        for (const row of rows) {
          const tags = normalizeTaskTags(row.tags);
          if (!tags.includes(from)) {
            continue;
          }
          const nextTags = [...new Set(tags.map((tag) => (tag === from ? to : tag)))];
          await connection.query<ResultSetHeader>(
            `update ${tableName} set tags = cast(? as json) where id = ?`,
            [JSON.stringify(nextTags), row.id],
          );
        }
      }

      await connection.commit();
      return to;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

/** Garden key → region name. Empty when the table isn't available. */
export async function getGardenRegions(): Promise<Record<string, string>> {
  await ensureOperationalSchema();
  const rows = await queryRows<{ garden_key: string; name: string }>(
    `
      select gr.garden_key, r.name
      from garden_regions gr
      join regions r on r.id = gr.region_id and r.deleted_at is null
    `,
  ).catch((error) => {
    console.error("[garden-regions] unavailable", error);
    return null;
  });
  return Object.fromEntries((rows ?? []).map((row) => [row.garden_key, row.name]));
}

/** Sets (or, with null, clears) a garden's region and moves its devices. */
export async function setGardenRegion(gardenKey: string, regionName: string | null) {
  const key = gardenKey.trim().toLocaleLowerCase().slice(0, 80);
  if (!key) {
    return null;
  }

  await ensureOperationalSchema();
  return withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const regionId = regionName
        ? await getRegionIdByName(connection, regionName)
        : null;
      if (regionName && !regionId) {
        await connection.rollback();
        return null;
      }

      if (regionId) {
        await connection.query(
          `
            insert into garden_regions (garden_key, region_id) values (?, ?)
            on duplicate key update region_id = values(region_id)
          `,
          [key, regionId],
        );
      } else {
        await connection.query("delete from garden_regions where garden_key = ?", [key]);
      }
      await applyGardenRegions(connection, key);
      await connection.commit();
      return { gardenKey: key, region: regionName ? normalizeRegionName(regionName) : null };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
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

/* Soft delete: tasks and reports keep the tag (hidden while it is deleted),
   so restoring it puts it back on all of them. */
export async function deleteTaskTag(name: string) {
  const tagName = normalizeTaskTagName(name);
  if (!tagName) {
    return false;
  }

  const deleted = await setDeletedAt("task_tags", tagName, true, "name");
  fallbackTaskTagNames = fallbackTaskTagNames.filter((tag) => tag !== tagName);
  return deleted;
}

export async function restoreTaskTag(name: string) {
  const tagName = normalizeTaskTagName(name);
  if (!tagName) {
    return false;
  }
  return setDeletedAt("task_tags", tagName, false, "name");
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
      "update regions set name = ?, color = ? where id = ? and deleted_at is null",
      [input.name, input.color, id],
    );
    if (!result.affectedRows) {
      return null;
    }

    return { id, name: input.name, color: input.color };
  });

  return updated ?? null;
}

/* Soft delete. Devices and gardens keep pointing at the region, which is
   simply hidden (they read as "no region"); restoring gives it back its
   gardens. */
export async function deleteRegion(id: string) {
  return setDeletedAt("regions", id, true);
}

export async function restoreRegion(id: string) {
  return setDeletedAt("regions", id, false);
}

export async function getDeviceById(
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<Device | null> {
  const devices = await getDevices({ includeDeleted });
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
    "select id from regions where name = ? and deleted_at is null limit 1",
    [normalizedRegion],
  );
  return (rows as { id: string }[])[0]?.id ?? null;
}

/** Manual links only — the name-prefix siblings are derived, never stored. */
async function replaceAssociatedDevices(
  connection: PoolConnection,
  deviceId: string,
  names: string[],
) {
  const uniqueNames = [...new Set(names.map((name) => name.trim()))].filter(
    Boolean,
  );

  await connection.query("delete from associated_devices where device_id = ?", [
    deviceId,
  ]);

  for (const name of uniqueNames) {
    await connection.query<ResultSetHeader>(
      `
        insert into associated_devices (id, device_id, name)
        values (?, ?, ?)
        on duplicate key update name = values(name)
      `,
      [makeStableId("assoc", `${deviceId}:${name}`), deviceId, name],
    );
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
      // The garden decides the region; input.region is only a fallback
      // for databases without garden regions.
      const gardenRegionId = await getGardenRegionId(connection, input.name);
      const regionId =
        gardenRegionId !== undefined
          ? gardenRegionId
          : await getRegionIdByName(connection, input.region);
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
      // Tags belong to gardens now (garden_tags); devices carry none.
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
    /** Left undefined the stored links are untouched. */
    associatedDevices?: string[];
  },
): Promise<Device | null> {
  await ensureOperationalSchema();

  const updated = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      // Renaming into another garden moves the device to that garden's region.
      const gardenRegionId = await getGardenRegionId(connection, input.name);
      const regionId =
        gardenRegionId !== undefined
          ? gardenRegionId
          : await getRegionIdByName(connection, input.region);
      const position = clampLatLng(input.position);
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

      // Tags belong to gardens now (garden_tags); devices carry none.
      if (input.associatedDevices !== undefined) {
        await replaceAssociatedDevices(connection, id, input.associatedDevices);
      }
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

/* Soft delete: the device's tasks, reports and forms stay as they are and
   keep showing its garden name; restoring brings the device itself back. */
export async function deleteDevice(id: string) {
  return setDeletedAt("devices", id, true);
}

export async function restoreDevice(id: string) {
  return setDeletedAt("devices", id, false);
}

/** Whether a deleted row already holds this unique value (code, name...),
 *  so creating a new one would collide — the user should restore it. */
export async function hasDeletedWith(
  table: SoftDeleteTable,
  column: string,
  value: string,
) {
  const rows = await queryRows<{ id: string }>(
    `select id from ${table} where ${column} = ? and deleted_at is not null limit 1`,
    [value],
  );
  return Boolean(rows?.length);
}

type SoftDeleteTable =
  | "devices"
  | "regions"
  | "tags"
  | "task_tags"
  | "form_one_records";

/** Marks a row deleted (or restores it). Rows are never removed. */
async function setDeletedAt(
  table: SoftDeleteTable,
  id: string,
  deleted: boolean,
  idColumn = "id",
) {
  await ensureOperationalSchema();
  const result = await withConnection(async (connection) => {
    const [update] = await connection.query<ResultSetHeader>(
      deleted
        ? `update ${table} set deleted_at = current_timestamp where ${idColumn} = ? and deleted_at is null`
        : `update ${table} set deleted_at = null where ${idColumn} = ? and deleted_at is not null`,
      [id],
    );
    return update.affectedRows > 0;
  });
  return result ?? false;
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

/* ── Daily offline grading ────────────────────────────────────────────────
   What matters is whether a garden's card swipes reached the server. A
   reader that is offline keeps the swipes and sends them once it is back
   online, so a day is judged by "did it get a long enough online stretch",
   inside the hours the garden works. Rules and colours: deploy/logic.md.   */
export const OFFLINE_WINDOW_START_HOUR = 9;
export const OFFLINE_WINDOW_END_HOUR = 17;
/** Online this long without a break = the stored swipes went through. */
export const DELIVERY_ONLINE_MINUTES = 20;
/** One drop this long = the swipes came late, once it was back (renewed). */
export const LONG_OUTAGE_MINUTES = 30;
/** This many separate drops in the window = unstable link. */
export const UNSTABLE_MIN_EVENTS = 3;
/** Drops split by less than this much uptime are one drop, not two. */
const FLAP_MERGE_MINUTES = 5;
const DEFAULT_OFFLINE_LEVEL_WINDOW_DAYS = 90;
/** Sync runs older than this are pruned (they only mark covered days). */
const SYNC_RUN_RETENTION_DAYS = 120;

/**
 * missed: never online long enough in the window; late (renewed): one long
 * drop, the rest of the window online; unstable: kept dropping; ok: only
 * short drops.
 */
export type DailyOfflineLevel = "missed" | "late" | "unstable" | "ok";

/** One drop inside the working window, as Tbilisi "HH:MM". */
export type DailyOfflineDrop = {
  start: string;
  end: string;
  minutes: number;
  /** Already offline when the window opened (09:00). */
  fromBefore?: boolean;
  /** Still offline when the window closed, or (today) still offline now. */
  ongoing?: boolean;
};

export type DailyOfflineEntry = {
  deviceId: string;
  date: string;
  level: DailyOfflineLevel;
  /** Offline minutes inside the window. */
  minutes: number;
  /** Separate drops inside the window. */
  events: number;
  /** The drops themselves, in time order. */
  drops: DailyOfflineDrop[];
  /** Minutes of the window judged so far (480, or less today). */
  windowMinutes: number;
  /** Longest unbroken online stretch inside the window, in minutes. */
  longestOnline: number;
  /** Today before the window closes: missed is not final yet. */
  pending?: boolean;
};

export type DailyOfflineReport = {
  levels: DailyOfflineEntry[];
  /** Days on which the 5-minute sync ran inside the window. */
  coveredDays: string[];
  lastSyncAt?: string;
};

type OfflinePeriodRow = {
  device_id: string;
  offline_at: string;
  online_at: string | null;
};

/** "YYYY-MM-DD HH:MM:SS" of Tbilisi wall time → a comparable timestamp. */
function wallClockToMs(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) {
    return Number.NaN;
  }
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

function dayKeyFromMs(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

/** Writes one row per successful BioStar sync; marks a day as covered. */
async function recordSyncRun(syncedAt: Date) {
  await withConnection(async (connection) => {
    await connection.query(
      "insert ignore into biostar_sync_runs (synced_at) values (?)",
      [toSqlDateTime(syncedAt)],
    );
    await connection.query(
      "delete from biostar_sync_runs where synced_at < date_sub(now(), interval ? day)",
      [SYNC_RUN_RETENTION_DAYS],
    );
  }).catch(() => null);
}

type Span = { start: number; end: number };

function gradeDay(
  dayMs: number,
  offline: Span[],
  nowMs: number,
): Omit<DailyOfflineEntry, "deviceId" | "date"> {
  const windowStart = dayMs + OFFLINE_WINDOW_START_HOUR * 3600_000;
  const windowEnd = dayMs + OFFLINE_WINDOW_END_HOUR * 3600_000;
  // Today is judged on what has happened so far.
  const evalEnd = Math.min(windowEnd, nowMs);
  const open = nowMs < windowEnd;

  const drops = offline
    .map((span) => ({
      start: Math.max(span.start, windowStart),
      end: Math.min(span.end, evalEnd),
      fromBefore: span.start < windowStart,
      ongoing: span.end >= evalEnd,
    }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start);

  const online: Span[] = [];
  let cursor = windowStart;
  for (const drop of drops) {
    if (drop.start > cursor) {
      online.push({ start: cursor, end: drop.start });
    }
    cursor = Math.max(cursor, drop.end);
  }
  if (evalEnd > cursor) {
    online.push({ start: cursor, end: evalEnd });
  }

  const minutesOf = (span: Span) => (span.end - span.start) / 60_000;
  const delivery = DELIVERY_ONLINE_MINUTES;
  const longestOnline = Math.max(0, ...online.map(minutesOf));
  const minutes = drops.reduce((sum, drop) => sum + minutesOf(drop), 0);
  const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16);

  let level: DailyOfflineLevel;
  if (longestOnline < delivery) {
    level = "missed";
  } else if (drops.some((drop) => minutesOf(drop) >= LONG_OUTAGE_MINUTES)) {
    level = "late";
  } else if (drops.length >= UNSTABLE_MIN_EVENTS) {
    level = "unstable";
  } else {
    level = "ok";
  }

  return {
    level,
    minutes: Math.round(minutes),
    events: drops.length,
    drops: drops.map((drop) => ({
      start: clock(drop.start),
      end: clock(drop.end),
      minutes: Math.round(minutesOf(drop)),
      ...(drop.fromBefore ? { fromBefore: true } : {}),
      ...(drop.ongoing ? { ongoing: true } : {}),
    })),
    windowMinutes: Math.round(Math.max(0, evalEnd - windowStart) / 60_000),
    longestOnline: Math.round(longestOnline),
    ...(open && level === "missed" ? { pending: true } : {}),
  };
}

/**
 * Grades every device-day in the range that had a drop inside the working
 * window. A covered day with no entry for a device was clean (green).
 */
export async function getDailyOfflineLevels({
  from,
  to,
}: {
  from?: string;
  to?: string;
} = {}): Promise<DailyOfflineReport> {
  if (isBuildTime()) {
    return { levels: [], coveredDays: [] };
  }

  await ensureOperationalSchema();

  const toKey = to ?? getTbilisiDateKey();
  const fallbackFrom = new Date(`${toKey}T00:00:00Z`);
  fallbackFrom.setUTCDate(
    fallbackFrom.getUTCDate() - DEFAULT_OFFLINE_LEVEL_WINDOW_DAYS,
  );
  const fromKey = from ?? fallbackFrom.toISOString().slice(0, 10);

  const [rows, coverageRows, lastRows] = await Promise.all([
    queryRows<OfflinePeriodRow>(
      `
        select
          device_id,
          date_format(offline_at, '%Y-%m-%d %H:%i:%s') as offline_at,
          date_format(online_at, '%Y-%m-%d %H:%i:%s') as online_at
        from monitored_device_offline_periods
        where offline_at < date_add(?, interval 1 day)
          and (online_at is null or online_at >= ?)
          and cleared_at is null
        order by device_id, offline_at
      `,
      [toKey, fromKey],
    ),
    queryRows<{ day: string }>(
      `
        select distinct date_format(synced_at, '%Y-%m-%d') as day
        from biostar_sync_runs
        where synced_at >= ? and synced_at < date_add(?, interval 1 day)
          and hour(synced_at) >= ? and hour(synced_at) < ?
      `,
      [fromKey, toKey, OFFLINE_WINDOW_START_HOUR, OFFLINE_WINDOW_END_HOUR],
    ),
    queryRows<{ last_sync: string | null }>(
      "select date_format(max(synced_at), '%Y-%m-%d %H:%i:%s') as last_sync from biostar_sync_runs",
    ),
  ]);

  const coveredDays = (coverageRows ?? []).map((row) => row.day);
  const lastSync = lastRows?.[0]?.last_sync ?? undefined;
  const nowMs = wallClockToMs(toSqlDateTime(new Date()));
  // A period still open is cut at the last sync, not "now": if the cron
  // stopped, a device must not turn red for hours nobody checked.
  const openEndMs = lastSync ? Math.min(nowMs, wallClockToMs(lastSync)) : nowMs;

  const byDevice = new Map<string, Span[]>();
  for (const row of rows ?? []) {
    const start = wallClockToMs(row.offline_at);
    const end = row.online_at ? wallClockToMs(row.online_at) : openEndMs;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    const periods = byDevice.get(row.device_id) ?? [];
    const previous = periods[periods.length - 1];
    // Flap damping: a blink of uptime does not split one drop into two.
    if (previous && start - previous.end < FLAP_MERGE_MINUTES * 60_000) {
      previous.end = Math.max(previous.end, end);
    } else {
      periods.push({ start, end });
    }
    byDevice.set(row.device_id, periods);
  }

  const levels: DailyOfflineEntry[] = [];
  byDevice.forEach((periods, deviceId) => {
    const days = new Map<number, Span[]>();
    for (const period of periods) {
      const first = new Date(period.start);
      let cursor = Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        first.getUTCDate(),
      );
      while (cursor <= period.end) {
        const windowStart = cursor + OFFLINE_WINDOW_START_HOUR * 3600_000;
        const windowEnd = cursor + OFFLINE_WINDOW_END_HOUR * 3600_000;
        if (period.end > windowStart && period.start < windowEnd) {
          days.set(cursor, [...(days.get(cursor) ?? []), period]);
        }
        cursor += 24 * 3600_000;
      }
    }

    days.forEach((spans, dayMs) => {
      const date = dayKeyFromMs(dayMs);
      if (date < fromKey || date > toKey) {
        return;
      }
      const graded = gradeDay(dayMs, spans, nowMs);
      if (graded.events > 0) {
        levels.push({ deviceId, date, ...graded });
      }
    });
  });

  return {
    levels,
    coveredDays,
    ...(lastSync ? { lastSyncAt: lastSync } : {}),
  };
}

const DEFAULT_OFFLINE_PERIOD_RETENTION_DAYS = 365;

const getOfflinePeriodRetentionDays = () => {
  const configured = Number(process.env.OFFLINE_PERIOD_RETENTION_DAYS);
  return Number.isFinite(configured) && configured > 0
    ? Math.trunc(configured)
    : DEFAULT_OFFLINE_PERIOD_RETENTION_DAYS;
};

/**
 * Keeps a rolling window of offline history — anything older than a year is
 * dropped, so the table never grows without bound. Open periods are never
 * touched, however old, because they are still the device's current state.
 */
/** Clears a device's offline history on explicit request. The periods are
 *  hidden, not deleted, and the reset counters are kept, so
 *  restoreDeviceOfflineHistory can bring everything back. */
export async function clearDeviceOfflineHistory(deviceId: string) {
  await ensureOperationalSchema();

  await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query<ResultSetHeader>(
        `update monitored_device_offline_periods set cleared_at = current_timestamp
         where device_id = ? and cleared_at is null`,
        [deviceId],
      );
      await connection.query<ResultSetHeader>(
        `update monitored_devices
         set cleared_offline_count = cleared_offline_count + offline_count,
             cleared_last_offline_at = greatest(
               coalesce(cleared_last_offline_at, last_offline_at),
               coalesce(last_offline_at, cleared_last_offline_at)
             ),
             offline_count = 0, last_offline_at = null, updated_at = current_timestamp
         where device_id = ?`,
        [deviceId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return refreshMonitoredDeviceStatuses({ includeInactive: true });
}

/** Undoes clearDeviceOfflineHistory: the periods and counters come back. */
export async function restoreDeviceOfflineHistory(deviceId: string) {
  await ensureOperationalSchema();

  await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      // A period still open when it was cleared ends where the live one
      // (opened after the clear) begins, so the two don't overlap.
      await connection.query(
        `update monitored_device_offline_periods cleared
         join monitored_device_offline_periods live
           on live.device_id = cleared.device_id
          and live.online_at is null and live.cleared_at is null
         set cleared.online_at = live.offline_at
         where cleared.device_id = ? and cleared.cleared_at is not null
           and cleared.online_at is null`,
        [deviceId],
      );
      await connection.query<ResultSetHeader>(
        `update monitored_device_offline_periods set cleared_at = null
         where device_id = ? and cleared_at is not null`,
        [deviceId],
      );
      await connection.query<ResultSetHeader>(
        `update monitored_devices
         set offline_count = offline_count + cleared_offline_count,
             last_offline_at = greatest(
               coalesce(last_offline_at, cleared_last_offline_at),
               coalesce(cleared_last_offline_at, last_offline_at)
             ),
             cleared_offline_count = 0, cleared_last_offline_at = null,
             updated_at = current_timestamp
         where device_id = ?`,
        [deviceId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  return refreshMonitoredDeviceStatuses({ includeInactive: true });
}

export async function purgeOldOfflinePeriods(value = new Date()) {
  if (isBuildTime()) {
    return 0;
  }

  await ensureOperationalSchema();

  const cutoff = new Date(value.getTime());
  cutoff.setDate(cutoff.getDate() - getOfflinePeriodRetentionDays());
  const cutoffSql = toSqlDateTime(cutoff);

  const deleted = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `delete from monitored_device_offline_periods
       where online_at is not null and online_at < ?`,
      [cutoffSql],
    );
    return result.affectedRows;
  });

  return deleted ?? 0;
}

export async function captureDailyOfflineSnapshot(value = new Date()) {
  if (isBuildTime()) {
    return null;
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
          where status = 'offline' and is_excluded = false and deleted_at is null
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
      join devices d on d.id = osd.device_id and d.is_excluded = false and d.deleted_at is null
      where osd.snapshot_id in (?) and osd.removed_at is null
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

  // Hidden, not deleted: restoreOfflineFrequencyForDevice brings it back.
  const deleted = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `update offline_snapshot_devices set removed_at = current_timestamp
       where device_id = ? and removed_at is null`,
      [normalizedDeviceId],
    );
    return result.affectedRows > 0;
  });

  return deleted ?? false;
}

export async function restoreOfflineFrequencyForDevice(deviceId: string) {
  if (isBuildTime()) {
    return false;
  }

  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) {
    return false;
  }

  await ensureOperationalSchema();

  const restored = await withConnection(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      `update offline_snapshot_devices set removed_at = null
       where device_id = ? and removed_at is not null`,
      [normalizedDeviceId],
    );
    return result.affectedRows > 0;
  });

  return restored ?? false;
}

/** Devices taken off the X-Station frequency (restorable), newest first. */
export async function getRemovedOfflineFrequencyDevices(): Promise<
  { deviceId: string; deviceName: string; removedAt: string }[]
> {
  if (isBuildTime()) {
    return [];
  }
  await ensureOperationalSchema();
  const rows = await queryRows<{
    device_id: string;
    device_name: string;
    removed_at: DatabaseDate;
  }>(
    `select osd.device_id, max(osd.device_name) as device_name, max(osd.removed_at) as removed_at
     from offline_snapshot_devices osd
     join devices d on d.id = osd.device_id and d.deleted_at is null
     where osd.removed_at is not null
     group by osd.device_id
     order by removed_at desc`,
  );
  return (rows ?? []).map((row) => ({
    deviceId: row.device_id,
    deviceName: row.device_name,
    removedAt: toDateTimeString(row.removed_at),
  }));
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
        md.last_notification_at,
        exists (
          select 1 from monitored_device_offline_periods p
          where p.device_id = md.device_id and p.cleared_at is not null
        ) as has_cleared_history
      from monitored_devices md
      join devices d on d.id = md.device_id and d.is_excluded = false and d.deleted_at is null
      ${includeInactive ? "" : "where md.is_active = true"}
      order by md.is_active desc, md.enabled_date desc, md.device_id
    `,
  );

  if (!rows) {
    return [];
  }

  // The full history: switching monitoring off and on again must not hide it.
  // Only the explicit "clear" action hides rows (and "restore" shows them).
  const periodRows = rows.length
    ? await queryRows<MonitoredOfflinePeriodRow>(
        `
          select id, device_id, offline_at, online_at
          from monitored_device_offline_periods
          where device_id in (?) and cleared_at is null
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
  includeInactive = true,
}: {
  includeInactive?: boolean;
} = {}) {
  await ensureOperationalSchema();

  await withConnection(async (connection) => {
    const [rows] = await connection.query<RowDataPacket[]>(
      `select md.device_id, d.status
       from monitored_devices md
       join devices d on d.id = md.device_id and d.is_excluded = false and d.deleted_at is null
       where md.is_active = true`,
    );

    for (const row of rows) {
      await updateMonitoredDeviceStatus(
        connection,
        String(row.device_id),
        normalizeDeviceStatus(row.status) ?? "error",
        new Date(),
      );
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
        "select id, status from devices where id in (?) and is_excluded = false and deleted_at is null",
        [uniqueDeviceIds],
      );
      const activeDevices = deviceRows as { id: string; status: DeviceStatus }[];
      if (!activeDevices.length) {
        return;
      }
      // Periods are now the shared offline history of every device, so enabling
      // monitoring must not wipe them; the counter below restarts instead, and
      // the monitoring view reads only periods since enabled_at.
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
    hasClearedHistory: toBoolean(row.has_cleared_history ?? false),
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

/**
 * Offline periods are recorded for EVERY device, not just the monitored ones,
 * so the daily matrix can reason about duration and flapping. The open-period
 * row is the state, which makes this idempotent under concurrent polls: a
 * second "still offline" poll finds an open row and inserts nothing.
 */
async function recordDeviceOfflinePeriod(
  connection: PoolConnection,
  deviceId: string,
  status: DeviceStatus,
  happenedAt: Date,
) {
  const happenedAtSql = toSqlDateTime(happenedAt);

  if (status === "offline") {
    const [openRows] = await connection.query<RowDataPacket[]>(
      `select id from monitored_device_offline_periods
       where device_id = ? and online_at is null and cleared_at is null
       limit 1`,
      [deviceId],
    );

    if (!openRows.length) {
      await connection.query<ResultSetHeader>(
        `insert into monitored_device_offline_periods (id, device_id, offline_at)
         values (?, ?, ?)`,
        [makeId("offline-period"), deviceId, happenedAtSql],
      );
    }
    return;
  }

  // Back online (or error): close whatever period is still open.
  await connection.query(
    `update monitored_device_offline_periods
     set online_at = ?
     where device_id = ? and online_at is null`,
    [happenedAtSql, deviceId],
  );
}

async function updateMonitoredDeviceStatus(
  connection: PoolConnection,
  deviceId: string,
  status: DeviceStatus,
  happenedAt: Date,
) {
  const happenedAtSql = toSqlDateTime(happenedAt);

  await recordDeviceOfflinePeriod(connection, deviceId, status, happenedAt);

  if (status === "offline") {
    // Atomic: only increment if NOT already offline — prevents double-counting under concurrent polls.
    await connection.query<ResultSetHeader>(
      `update monitored_devices
       set offline_count = offline_count + 1,
           last_status = 'offline',
           last_offline_at = ?,
           last_notification_at = ?,
           updated_at = current_timestamp
       where device_id = ?
         and is_active = true
         and (last_status is null or last_status != 'offline')`,
      [happenedAtSql, happenedAtSql, deviceId],
    );
    return;
  }

  // Online/error: atomically update only if status actually changed.
  await connection.query<ResultSetHeader>(
    `update monitored_devices
     set last_status = ?, updated_at = current_timestamp
     where device_id = ? and is_active = true and (last_status is null or last_status != ?)`,
    [status, deviceId, status],
  );
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

/** 1–365 whole days for an INFO task to close itself; anything else, or a
    task that isn't INFO, means "no automatic completion". */
export function normalizeInfoAutoDoneDays(value: unknown, info: boolean) {
  if (!info || value === null || value === undefined || value === "") {
    return undefined;
  }
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : undefined;
}

let lastInfoAutoDoneSweepAt = 0;

/* INFO tasks with a day count move to "done" once their time is up. Run
   lazily from the task and report readers (at most once a minute), so no
   cron job is needed; a linked problem report follows its task. */
async function completeExpiredInfoTasks() {
  if (isBuildTime() || Date.now() - lastInfoAutoDoneSweepAt < 60_000) {
    return;
  }
  lastInfoAutoDoneSweepAt = Date.now();

  await withConnection(async (connection) => {
    await connection.query(`
      update problem_reports pr
      join tasks t on t.id = pr.task_id
      set pr.status = 'done'
      where t.is_info = true
        and t.info_auto_done_at is not null
        and t.info_auto_done_at <= now()
        and t.status <> 'done'
        and pr.status <> 'done'
    `);
    await connection.query(`
      update tasks
      set completed_at = current_timestamp, status = 'done'
      where is_info = true
        and info_auto_done_at is not null
        and info_auto_done_at <= now()
        and status <> 'done'
    `);
  }).catch((error) => {
    console.error("[tasks] INFO auto-completion failed", error);
  });
}

export async function getTasks(
  {
    assigneeUserId,
    includeInfoTasks = false,
    includeDeleted = false,
  }: {
    assigneeUserId?: string;
    includeInfoTasks?: boolean;
    /** Soft-deleted tasks too (the tasks page's "deleted" filter). */
    includeDeleted?: boolean;
  } = {},
): Promise<Task[]> {
  await ensureOperationalSchema();
  await completeExpiredInfoTasks();

  // A straight "and ta.user_id = ?" on the display join below would turn the
  // left join into an effective inner join and make group_concat drop every
  // co-assignee, corrupting assigneeIds — so scoping is a separate EXISTS
  // check on the task itself, independent of the join used to list assignees.
  const scopeFilter = assigneeUserId
    ? `
      and (
        exists (
          select 1 from task_assignees scope_ta
          where scope_ta.task_id = t.id and scope_ta.user_id = ?
        )
        ${includeInfoTasks ? "or t.is_info = true" : ""}
      )
    `
    : "";
  const params = assigneeUserId ? [assigneeUserId] : [];

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
        t.is_info,
        t.info_auto_done_days,
        t.info_auto_done_at,
        t.starts_at,
        t.due_date,
        t.created_at,
        t.completed_at,
        t.deleted_at,
        pr.id as problem_report_id,
        group_concat(ta.user_id order by ta.user_id separator ',') as assignee_ids
      from tasks t
      left join task_assignees ta on ta.task_id = t.id
      left join problem_reports pr on pr.task_id = t.id
      where (
          pr.id is null
          or exists (
            select 1
            from task_assignees ready_ta
            where ready_ta.task_id = t.id
            limit 1
          )
        )
        ${includeDeleted ? "" : "and t.deleted_at is null"}
        ${scopeFilter}
      group by t.id
      order by t.created_at desc
    `,
    params,
  );

  if (!rows) {
    return assigneeUserId
      ? mockTasks.filter(
          (task) =>
            task.assigneeIds.includes(assigneeUserId) ||
            (includeInfoTasks && task.info),
        )
      : mockTasks;
  }

  const deletedTags = await getDeletedTaskTagSet();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    issue: row.issue,
    comment: row.comment_text ?? undefined,
    phone: row.phone ?? undefined,
    deviceId: row.device_id,
    status: row.status,
    priority: row.priority,
    tags: normalizeTaskTags(row.tags).filter((tag) => !deletedTags.has(tag)),
    info: Boolean(row.is_info),
    infoAutoDoneDays: row.info_auto_done_days ?? undefined,
    infoAutoDoneAt: row.info_auto_done_at
      ? toDateTimeString(row.info_auto_done_at)
      : undefined,
    startsAt: row.starts_at ? toDateTimeString(row.starts_at) : undefined,
    dueDate: toDateString(row.due_date),
    createdAt: toDateTimeString(row.created_at),
    completedAt: row.completed_at ? toDateTimeString(row.completed_at) : undefined,
    problemReportId: row.problem_report_id ?? undefined,
    assigneeIds: csv(row.assignee_ids),
    deletedAt: row.deleted_at ? toDateTimeString(row.deleted_at) : undefined,
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
          insert into tasks (id, title, issue, comment_text, phone, device_id, status, priority, tags, is_info, info_auto_done_days, info_auto_done_at, starts_at, due_date, completed_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?, if(? is null, null, date_add(now(), interval ? day)), ?, ?, if(? = 'done', current_timestamp, null))
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
          Boolean(task.info),
          task.infoAutoDoneDays ?? null,
          task.infoAutoDoneDays ?? null,
          task.infoAutoDoneDays ?? 0,
          toDateTimeParam(task.startsAt),
          task.dueDate,
          task.status,
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
      const [storedRows] = await connection.query<RowDataPacket[]>(
        "select tags from tasks where id = ? limit 1 for update",
        [id],
      );
      const storedTags = withKeptDeletedTags(
        tags,
        storedRows[0]?.tags,
        await getDeletedTaskTagSet(connection),
      );
      const [result] = await connection.query<ResultSetHeader>(
        `
          update tasks
          set
            title = ?,
            issue = ?,
            comment_text = ?,
            phone = ?,
            device_id = ?,
            ${completedAtAssignment("?")},
            status = ?,
            priority = ?,
            tags = cast(? as json),
            is_info = ?,
            -- Restart the countdown only when the number of days changes.
            -- Must stay before info_auto_done_days: MySQL applies SET left
            -- to right, so this still compares against the old value.
            info_auto_done_at = case
              when ? is null then null
              when info_auto_done_days <=> ? and info_auto_done_at is not null
                then info_auto_done_at
              else date_add(now(), interval ? day)
            end,
            info_auto_done_days = ?,
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
          input.status,
          input.priority,
          JSON.stringify(storedTags),
          Boolean(input.info),
          input.infoAutoDoneDays ?? null,
          input.infoAutoDoneDays ?? null,
          input.infoAutoDoneDays ?? 0,
          input.infoAutoDoneDays ?? null,
          toDateTimeParam(input.startsAt),
          input.dueDate,
          id,
        ],
      );

      if (!result.affectedRows) {
        await connection.rollback();
        return null;
      }

      /* A task made from a problem report is the same record: what the two
         share flows back, so a later report edit can't put old values back
         onto the task. Tags stay apart (the report's own vs the task's). */
      await connection.query(
        `update problem_reports
         set title = ?, issue = ?, phone = ?, status = ?, priority = ?, due_date = ?
         where task_id = ?`,
        [
          input.title,
          input.issue,
          input.phone ?? null,
          input.status,
          input.priority,
          input.dueDate,
          id,
        ],
      );
      // Not when emptied: a report without assignees drops its task.
      if (input.assigneeIds.length) {
        const [reportRows] = await connection.query<RowDataPacket[]>(
          "select id from problem_reports where task_id = ? limit 1",
          [id],
        );
        const reportId = reportRows[0]?.id as string | undefined;
        if (reportId) {
          await connection.query(
            "delete from problem_report_assignees where problem_report_id = ?",
            [reportId],
          );
          await connection.query(
            "insert ignore into problem_report_assignees (problem_report_id, user_id) values ?",
            [input.assigneeIds.map((userId) => [reportId, userId])],
          );
        }
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

/* Soft delete. A task and the problem report it was made from are one
   record, so deleting either side hides both, and restoring brings both back. */
export async function deleteTask(id: string) {
  return setTaskPairDeleted({ taskId: id }, true);
}

export async function restoreTask(id: string) {
  return setTaskPairDeleted({ taskId: id }, false);
}

export async function deleteProblemReport(id: string) {
  return setTaskPairDeleted({ reportId: id }, true);
}

export async function restoreProblemReport(id: string) {
  return setTaskPairDeleted({ reportId: id }, false);
}

type TaskPairResult = {
  ok: boolean;
  taskId?: string;
  problemReportId?: string;
};

async function setTaskPairDeleted(
  target: { taskId: string } | { reportId: string },
  deleted: boolean,
): Promise<TaskPairResult> {
  await ensureOperationalSchema();

  const result = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      let taskId: string | undefined;
      let reportId: string | undefined;
      if ("taskId" in target) {
        const [taskRows] = await connection.query<RowDataPacket[]>(
          "select id from tasks where id = ? limit 1 for update",
          [target.taskId],
        );
        taskId = taskRows[0]?.id as string | undefined;
        const [reportRows] = await connection.query<RowDataPacket[]>(
          "select id from problem_reports where task_id = ? limit 1 for update",
          [target.taskId],
        );
        reportId = reportRows[0]?.id as string | undefined;
      } else {
        const [reportRows] = await connection.query<RowDataPacket[]>(
          "select id, task_id from problem_reports where id = ? limit 1 for update",
          [target.reportId],
        );
        reportId = reportRows[0]?.id as string | undefined;
        taskId = (reportRows[0]?.task_id as string | null) || undefined;
      }

      const primaryId = "taskId" in target ? taskId : reportId;
      if (!primaryId) {
        await connection.rollback();
        return { ok: false };
      }

      const value = deleted ? "current_timestamp" : "null";
      const stateFilter = deleted
        ? "deleted_at is null"
        : "deleted_at is not null";
      if (taskId) {
        await connection.query(
          `update tasks set deleted_at = ${value} where id = ? and ${stateFilter}`,
          [taskId],
        );
      }
      if (reportId) {
        await connection.query(
          `update problem_reports set deleted_at = ${value} where id = ? and ${stateFilter}`,
          [reportId],
        );
      }

      await connection.commit();
      return { ok: true, taskId, problemReportId: reportId };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  if (result !== null) {
    return result;
  }

  return "taskId" in target
    ? { ok: mockTasks.some((task) => task.id === target.taskId), taskId: target.taskId }
    : { ok: false };
}

export async function getProblemReports({
  gardenCodes,
  includeDeleted = false,
}: {
  /** Limit to these gardens; null/undefined = every garden (garden-scope.ts). */
  gardenCodes?: string[] | null;
  /** Soft-deleted reports too (the reports page's "deleted" filter). */
  includeDeleted?: boolean;
} = {}): Promise<ProblemReport[]> {
  await ensureOperationalSchema();
  await completeExpiredInfoTasks();

  const filters: string[] = includeDeleted ? [] : ["pr.deleted_at is null"];
  const params: unknown[] = [];

  if (gardenCodes) {
    if (!gardenCodes.length) {
      return [];
    }
    filters.push("pr.device_group_code in (?)");
    params.push(gardenCodes);
  }

  const rows = await queryRows<ProblemReportRow>(
    `
      select
        pr.id,
        pr.task_id,
        pr.category_id,
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
        pr.deleted_at,
        -- What the technician wrote on the linked task (problem-report-view.ts
        -- decides who may see it).
        (select t.comment_text from tasks t where t.id = pr.task_id) as task_comment,
        (select t.tags from tasks t where t.id = pr.task_id) as task_tags,
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

  const deletedTags = await getDeletedTaskTagSet();
  return rows.map((row) => {
    const report = mapProblemReportRow(row);
    return {
      ...report,
      tags: report.tags.filter((tag) => !deletedTags.has(tag)),
      taskTags: report.taskTags?.filter((tag) => !deletedTags.has(tag)),
    };
  });
}

export async function getProblemReportById(
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
) {
  const reports = await getProblemReports({ includeDeleted });
  return reports.find((report) => report.id === id) ?? null;
}

export async function createProblemReport(
  input: Omit<
    ProblemReport,
    "id" | "taskId" | "deviceGroupCode" | "createdAt" | "updatedAt"
  >,
  options: { createdBy?: string; allowedGardenCodes?: string[] | null } = {},
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
    deviceGroupCode: normalizeDeviceGroupCode(options.allowedGardenCodes?.[0]),
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
      const allowedGardens = options.allowedGardenCodes;
      if (!isGardenAllowed(allowedGardens, deviceGroupCode)) {
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
            (id, task_id, category_id, device_id, device_group_code, title, issue, phone, status, priority, tags, due_date, created_by)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?)
        `,
        [
          reportId,
          syncTask ? taskId : null,
          input.categoryId ?? null,
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
  options: { allowedGardenCodes?: string[] | null } = {},
): Promise<ProblemReport | null> {
  await ensureOperationalSchema();

  const tags = normalizeTaskTags(input.tags);
  const assigneeIds = normalizeUserIds(input.assigneeIds);
  const dueDate = input.dueDate || getTbilisiDateKey();
  const updatedId = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [existingRows] = await connection.query<RowDataPacket[]>(
        "select task_id, device_group_code, created_by, tags from problem_reports where id = ? limit 1 for update",
        [id],
      );
      const existing = existingRows[0] as
        | {
            task_id?: string | null;
            device_group_code?: string;
            created_by?: string | null;
            tags?: unknown;
          }
        | undefined;
      if (!existing) {
        await connection.rollback();
        return null;
      }

      const allowedGardens = options.allowedGardenCodes;
      if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
        await connection.rollback();
        return null;
      }

      const device = await getDeviceIdentity(connection, input.deviceId);
      if (!device) {
        await connection.rollback();
        return null;
      }

      const deviceGroupCode = getDeviceGroupCode(device);
      if (!isGardenAllowed(allowedGardens, deviceGroupCode)) {
        await connection.rollback();
        return null;
      }

      const taskId = existing.task_id || makeId("task");
      const syncTask = shouldSyncProblemReportToTask(assigneeIds);
      const storedReportTags = withKeptDeletedTags(
        tags,
        existing.tags,
        await getDeletedTaskTagSet(connection),
      );
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
          previousReportTags: normalizeTaskTags(existing.tags),
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
          JSON.stringify(storedReportTags),
          dueDate,
          id,
        ],
      );

      await replaceProblemReportAssignees(connection, id, assigneeIds);
      // A report without assignees drops its task: kept as a deleted task
      // (restorable from the tasks page), never removed from the database.
      if (!syncTask && existing.task_id) {
        await connection.query<ResultSetHeader>(
          "update tasks set deleted_at = current_timestamp where id = ? and deleted_at is null",
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

export async function getFormOneRecords({
  gardenCodes,
  includeDeleted = false,
}: {
  /** Limit to these gardens; null/undefined = every garden (garden-scope.ts). */
  gardenCodes?: string[] | null;
  /** Soft-deleted records too (the Form 1 page's "deleted" filter). */
  includeDeleted?: boolean;
} = {}): Promise<FormOneRecord[]> {
  if (isBuildTime() || gardenCodes?.length === 0) {
    return [];
  }

  await ensureOperationalSchema();

  const rows = await prisma.form_one_records.findMany({
    orderBy: { created_at: "desc" },
    where: {
      ...(gardenCodes ? { device_group_code: { in: gardenCodes } } : {}),
      ...(includeDeleted ? {} : { deleted_at: null }),
    },
  });

  return rows.map(mapPrismaFormOneRecord);
}

export async function getFormOneRecordById(
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
) {
  if (isBuildTime()) {
    return null;
  }

  await ensureOperationalSchema();

  const record = await prisma.form_one_records.findUnique({
    where: { id },
  });
  if (!record || (record.deleted_at && !includeDeleted)) {
    return null;
  }
  return mapPrismaFormOneRecord(record);
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
  options: { createdBy?: string; allowedGardenCodes?: string[] | null } = {},
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
    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, deviceGroupCode)) {
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

    await transaction.form_one_notifications.create({
      data: {
        id: makeId("formonenotification"),
        record_id: recordId,
        type: "new_record",
        recipient_role: OUTSOURCING_ROLE_NAME,
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
  options: { allowedGardenCodes?: string[] | null; updatedBy?: string } = {},
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
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
    if (!isGardenAllowed(allowedGardens, deviceGroupCode)) {
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

export async function requestFormOneEditReview(
  id: string,
  input: {
    deviceId: string;
    gardenLabel: string;
    phone?: string;
    submittedDate: string;
    dueDate?: string;
    items: FormOneRecordItem[];
  },
  options: {
    requestedBy?: string;
    requestedByName?: string;
    allowedGardenCodes?: string[] | null;
  } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  const items = normalizeFormOneRecordItems(input.items);
  const submittedDate = normalizeDateInput(input.submittedDate);
  const dueDate = normalizeOptionalDateInput(input.dueDate);
  if (!items.length) {
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
      return null;
    }
    if (
      normalizeFormOneEditReviewStatus(existing.edit_review_status) !== "none"
    ) {
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
    if (!isGardenAllowed(allowedGardens, deviceGroupCode)) {
      return null;
    }

    const pendingEdit: FormOnePendingEdit = {
      deviceId: input.deviceId,
      gardenLabel: input.gardenLabel || device.name || deviceGroupCode,
      ...(input.phone ? { phone: input.phone } : {}),
      submittedDate,
      ...(dueDate ? { dueDate } : {}),
      items,
    };

    const record = await transaction.form_one_records.update({
      data: {
        edit_review_status: "pending",
        pending_edit: pendingEdit as unknown as Prisma.InputJsonValue,
        edit_requested_at: new Date(),
        edit_requested_by: options.requestedBy ?? null,
        edit_requested_by_name: options.requestedByName ?? null,
        edit_review_comment: null,
      },
      where: { id },
    });

    await transaction.form_one_notifications.create({
      data: {
        id: makeId("formonenotification"),
        record_id: id,
        type: "edit_request",
        recipient_device_group_code: existing.device_group_code,
        created_by: options.requestedBy ?? null,
      },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function respondToFormOneEditReview(
  id: string,
  input: { action: "approve" | "reject"; comment?: string },
  options: { userId?: string; allowedGardenCodes?: string[] | null } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  const comment = String(input.comment || "").trim();
  if (input.action === "reject" && !comment) {
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
      return null;
    }
    if (
      normalizeFormOneEditReviewStatus(existing.edit_review_status) !==
      "pending"
    ) {
      return null;
    }

    const pendingEdit = normalizeFormOnePendingEdit(existing.pending_edit);
    if (!pendingEdit) {
      return null;
    }

    await transaction.form_one_notifications.updateMany({
      data: { read_at: new Date() },
      where: {
        record_id: id,
        type: "edit_request",
        read_at: null,
      },
    });

    if (input.action === "reject") {
      const record = await transaction.form_one_records.update({
        data: {
          edit_review_status: "rejected",
          edit_review_comment: comment,
        },
        where: { id },
      });

      if (existing.edit_requested_by) {
        await transaction.form_one_notifications.create({
          data: {
            id: makeId("formonenotification"),
            record_id: id,
            type: "edit_rejection",
            recipient_user_id: existing.edit_requested_by,
            comment_text: comment,
            created_by: options.userId ?? null,
          },
        });
      }

      return mapPrismaFormOneRecord(record);
    }

    const device = await transaction.devices.findUnique({
      select: { code: true, id: true, name: true },
      where: { id: pendingEdit.deviceId },
    });
    if (!device) {
      return null;
    }

    const deviceGroupCode = getDeviceGroupCode(device);
    const submittedDate = normalizeDateInput(pendingEdit.submittedDate);
    const dueDate = normalizeOptionalDateInput(pendingEdit.dueDate);

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
                  changedBy: existing.edit_requested_by ?? undefined,
                },
              ]
            : []),
        ]
      : dueDateHistoryBase;

    const record = await transaction.form_one_records.update({
      data: {
        device_id: pendingEdit.deviceId,
        device_group_code: deviceGroupCode,
        garden_label: pendingEdit.gardenLabel || device.name || deviceGroupCode,
        phone: pendingEdit.phone || null,
        submitted_date: toPrismaDateOnly(submittedDate),
        due_date: dueDate ? toPrismaDateOnly(dueDate) : null,
        due_dates: dueDates.length
          ? (dueDates as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        due_date_change_count: countsAsDueDateChange
          ? dueDateChangeCount + 1
          : dueDateChangeCount,
        items: pendingEdit.items as unknown as Prisma.InputJsonValue,
        edit_review_status: "none",
        pending_edit: Prisma.JsonNull,
        edit_requested_at: null,
        edit_requested_by: null,
        edit_requested_by_name: null,
        edit_review_comment: null,
      },
      where: { id },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function resendFormOneEditReview(
  id: string,
  options: {
    requestedBy?: string;
    requestedByName?: string;
    allowedGardenCodes?: string[] | null;
  } = {},
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
      return null;
    }
    if (
      normalizeFormOneEditReviewStatus(existing.edit_review_status) !==
      "rejected"
    ) {
      return null;
    }

    await transaction.form_one_notifications.updateMany({
      data: { read_at: new Date() },
      where: {
        record_id: id,
        type: "edit_rejection",
        read_at: null,
      },
    });

    const record = await transaction.form_one_records.update({
      data: {
        edit_review_status: "pending",
        edit_requested_at: new Date(),
        edit_requested_by: options.requestedBy ?? existing.edit_requested_by,
        edit_requested_by_name:
          options.requestedByName ?? existing.edit_requested_by_name,
        edit_review_comment: null,
      },
      where: { id },
    });

    await transaction.form_one_notifications.create({
      data: {
        id: makeId("formonenotification"),
        record_id: id,
        type: "edit_request",
        recipient_device_group_code: existing.device_group_code,
        created_by: options.requestedBy ?? null,
      },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function cancelFormOneEditReview(
  id: string,
  options: { allowedGardenCodes?: string[] | null } = {},
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
      return null;
    }
    if (
      normalizeFormOneEditReviewStatus(existing.edit_review_status) !==
      "rejected"
    ) {
      return null;
    }

    await transaction.form_one_notifications.updateMany({
      data: { read_at: new Date() },
      where: {
        record_id: id,
        type: "edit_rejection",
        read_at: null,
      },
    });

    const record = await transaction.form_one_records.update({
      data: {
        edit_review_status: "none",
        pending_edit: Prisma.JsonNull,
        edit_requested_at: null,
        edit_requested_by: null,
        edit_requested_by_name: null,
        edit_review_comment: null,
      },
      where: { id },
    });

    return mapPrismaFormOneRecord(record);
  });
}

/* Soft delete: the record and its notifications stay, only hidden. */
export async function deleteFormOneRecord(
  id: string,
  options: { allowedGardenCodes?: string[] | null } = {},
) {
  return setFormOneDeleted(id, true, options);
}

export async function restoreFormOneRecord(
  id: string,
  options: { allowedGardenCodes?: string[] | null } = {},
) {
  return setFormOneDeleted(id, false, options);
}

async function setFormOneDeleted(
  id: string,
  deleted: boolean,
  options: { allowedGardenCodes?: string[] | null },
) {
  if (isBuildTime()) {
    return false;
  }

  await ensureOperationalSchema();

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.form_one_records.findUnique({
      select: { device_group_code: true, deleted_at: true },
      where: { id },
    });
    if (!existing || Boolean(existing.deleted_at) === deleted) {
      return false;
    }

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
      return false;
    }

    await transaction.form_one_records.update({
      where: { id },
      data: { deleted_at: deleted ? new Date() : null },
    });
    return true;
  });
}

export async function requestFormOneCompletion(
  id: string,
  input: { completedItems: FormOneRecordItem[] },
  options: { requestedBy?: string; allowedGardenCodes?: string[] | null } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  const completedItems = normalizeFormOneRecordItems(input.completedItems);
  if (!completedItems.length) {
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
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
        completed_items: completedItems as unknown as Prisma.InputJsonValue,
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
  options: { userId?: string; allowedGardenCodes?: string[] | null } = {},
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
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

export async function flagFormOneRecord(
  id: string,
  input: { comment: string },
  options: {
    userId?: string;
    userName?: string;
    allowedGardenCodes?: string[] | null;
  } = {},
): Promise<FormOneRecord | null> {
  if (isBuildTime()) {
    return null;
  }

  const comment = String(input.comment || "").trim();
  if (!comment) {
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
      return null;
    }

    const record = await transaction.form_one_records.update({
      data: {
        is_flagged: true,
        flag_comment: comment,
        flagged_at: new Date(),
        flagged_by: options.userId ?? null,
        flagged_by_name: options.userName ?? null,
      },
      where: { id },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function unflagFormOneRecord(
  id: string,
  options: { allowedGardenCodes?: string[] | null } = {},
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
      return null;
    }

    const record = await transaction.form_one_records.update({
      data: {
        is_flagged: false,
        flag_comment: null,
        flagged_at: null,
        flagged_by: null,
        flagged_by_name: null,
      },
      where: { id },
    });

    return mapPrismaFormOneRecord(record);
  });
}

export async function updateFormOneRejectionComment(
  recordId: string,
  commentId: string,
  comment: string,
  options: { allowedGardenCodes?: string[] | null } = {},
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

    const allowedGardens = options.allowedGardenCodes;
    if (!isGardenAllowed(allowedGardens, existing.device_group_code)) {
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
  user: Pick<SessionUser, "id" | "role" | "gardenCodes"> | null,
): Promise<FormOneNotification[]> {
  if (!user || isBuildTime()) {
    return [];
  }

  await ensureOperationalSchema();
  // Garden accounts also get the notifications addressed to their gardens.
  const scopedGardens =
    user.role === GARDEN_ROLE_NAME && user.gardenCodes?.length
      ? user.gardenCodes
      : [""];
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
        r.is_flagged,
        r.flag_comment,
        r.flagged_at,
        r.flagged_by,
        r.flagged_by_name,
        r.edit_review_status,
        r.pending_edit,
        r.edit_requested_at,
        r.edit_requested_by,
        r.edit_requested_by_name,
        r.edit_review_comment,
        r.items,
        r.completed_items,
        r.created_by,
        r.created_at,
        r.updated_at
      from form_one_notifications n
      join form_one_records r on r.id = n.record_id and r.deleted_at is null
      where n.read_at is null
        and (
          n.recipient_user_id = ?
          or n.recipient_role = ?
          or (n.recipient_device_group_code <> '' and n.recipient_device_group_code in (?))
        )
      order by n.created_at desc
      limit 50
    `,
    [user.id, user.role, scopedGardens],
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
  user: Pick<SessionUser, "id" | "role" | "gardenCodes"> | null,
) {
  if (!user || isBuildTime()) {
    return false;
  }

  await ensureOperationalSchema();
  // Garden accounts also get the notifications addressed to their gardens.
  const scopedGardens =
    user.role === GARDEN_ROLE_NAME && user.gardenCodes?.length
      ? user.gardenCodes
      : [""];
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
            or (recipient_device_group_code <> '' and recipient_device_group_code in (?))
          )
      `,
      [toSqlDateTime(new Date()), notificationId, user.id, user.role, scopedGardens],
    );
    return result.affectedRows > 0;
  });

  return updated ?? false;
}

function mapProblemReportRow(row: ProblemReportRow): ProblemReport {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    categoryId: row.category_id ?? undefined,
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
    taskComment: row.task_comment?.trim() || undefined,
    taskTags: row.task_id ? normalizeTaskTags(row.task_tags) : undefined,
    deletedAt: row.deleted_at ? toDateTimeString(row.deleted_at) : undefined,
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
    isFlagged: toBoolean(row.is_flagged),
    flagComment: row.flag_comment ?? undefined,
    flaggedAt: row.flagged_at ? toDateTimeString(row.flagged_at) : undefined,
    flaggedBy: row.flagged_by ?? undefined,
    flaggedByName: row.flagged_by_name ?? undefined,
    editReviewStatus: normalizeFormOneEditReviewStatus(row.edit_review_status),
    pendingEdit: normalizeFormOnePendingEdit(row.pending_edit),
    editRequestedAt: row.edit_requested_at
      ? toDateTimeString(row.edit_requested_at)
      : undefined,
    editRequestedBy: row.edit_requested_by ?? undefined,
    editRequestedByName: row.edit_requested_by_name ?? undefined,
    editReviewComment: row.edit_review_comment ?? undefined,
    items: normalizeFormOneRecordItems(row.items),
    completedItems: normalizeFormOneRecordItems(row.completed_items),
    createdBy: row.created_by ?? undefined,
    createdAt: toDateTimeString(row.created_at),
    updatedAt: toDateTimeString(row.updated_at),
    deletedAt: row.deleted_at ? toDateTimeString(row.deleted_at) : undefined,
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

function normalizeFormOneEditReviewStatus(
  value: unknown,
): FormOneEditReviewStatus {
  return value === "pending" || value === "rejected" ? value : "none";
}

function normalizeFormOnePendingEdit(
  value: unknown,
): FormOnePendingEdit | undefined {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  if (!source) {
    return undefined;
  }

  const deviceId = String(source.deviceId || "").trim();
  const items = normalizeFormOneRecordItems(source.items);
  if (!deviceId || !items.length) {
    return undefined;
  }

  const phone = String(source.phone || "").trim();
  const dueDate = String(source.dueDate || "").trim();

  return {
    deviceId,
    gardenLabel: String(source.gardenLabel || "").trim(),
    ...(phone ? { phone } : {}),
    submittedDate: String(source.submittedDate || "").trim(),
    ...(dueDate ? { dueDate } : {}),
    items,
  };
}

function normalizeFormOneNotificationType(
  value: unknown,
): FormOneNotificationType {
  if (value === "rejection") return "rejection";
  if (value === "new_record") return "new_record";
  if (value === "edit_request") return "edit_request";
  if (value === "edit_rejection") return "edit_rejection";
  return "completion_request";
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
    /** The report's tags before this edit, so tags removed there leave the task too. */
    previousReportTags?: string[];
  },
) {
  // The technician's side of an existing task stays: its comment is never
  // overwritten, and its own tags stay. Tags follow the report: added there →
  // added here, removed there → removed here.
  const [existingRows] = await connection.query<RowDataPacket[]>(
    "select tags from tasks where id = ? limit 1",
    [input.taskId],
  );
  // A deleted tag isn't shown on the report, so its absence there isn't a
  // removal — the task keeps it.
  const deletedTags = await getDeletedTaskTagSet(connection);
  const removedFromReport = new Set(
    (input.previousReportTags ?? []).filter(
      (tag) => !input.tags.includes(tag) && !deletedTags.has(tag),
    ),
  );
  const tags = existingRows.length
    ? normalizeTaskTags([
        ...normalizeTaskTags(existingRows[0].tags).filter(
          (tag) => !removedFromReport.has(tag),
        ),
        ...input.tags,
      ])
    : input.tags;

  await connection.query<ResultSetHeader>(
    `
      insert into tasks
        (id, title, issue, comment_text, phone, device_id, status, priority, tags, due_date, created_by, completed_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?, if(? = 'done', current_timestamp, null))
      on duplicate key update
        title = values(title),
        issue = values(issue),
        phone = values(phone),
        device_id = values(device_id),
        ${completedAtAssignment("values(status)")},
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
      JSON.stringify(tags),
      input.dueDate,
      input.createdBy ?? null,
      input.status,
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

export type EntityAuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  userId: string;
  userName?: string;
  userRole?: string;
  metadata?: unknown;
};

/**
 * Every audit row for one entity, oldest first. Returns an empty list when the
 * database is unavailable, so callers fall back to the record's own timestamps.
 */
export async function getEntityAuditTrail(
  entityType: string,
  entityId: string,
): Promise<EntityAuditEntry[]> {
  const rows = await queryRows<RowDataPacket>(
    `
      select
        al.id, al.user_id, al.action, al.metadata, al.created_at,
        u.name as user_name, r.name as user_role
      from audit_logs al
      left join users u on u.id = al.user_id
      left join roles r on r.id = u.role_id
      where al.entity_type = ? and al.entity_id = ?
      order by al.created_at asc
      limit 200
    `,
    [entityType, entityId],
  );

  if (!rows) {
    return [];
  }

  return (rows as RowDataPacket[]).map((row) => ({
    id: String(row.id),
    action: String(row.action),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    userId: String(row.user_id),
    userName: row.user_name ? String(row.user_name) : undefined,
    userRole: row.user_role ? String(row.user_role) : undefined,
    metadata: parseAuditMetadata(row.metadata),
  }));
}

/** mysql2 returns a JSON column either parsed or as text, depending on setup. */
function parseAuditMetadata(value: unknown): unknown {
  if (typeof value !== "string") {
    return value ?? undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export async function getAuditLogs(opts: {
  page?: number;
  pageSize?: number;
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
}): Promise<AuditLogsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.action) {
    conditions.push("al.action like ?");
    params.push(`%${opts.action}%`);
  }
  if (opts.entityType) {
    conditions.push("al.entity_type = ?");
    params.push(opts.entityType);
  }
  if (opts.userId) {
    conditions.push("al.user_id = ?");
    params.push(opts.userId);
  }
  if (opts.from) {
    conditions.push("al.created_at >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push("al.created_at <= ?");
    params.push(`${opts.to} 23:59:59`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const countRows = await queryRows<RowDataPacket>(
    `select count(*) as total from audit_logs al ${where}`,
    params,
  );
  const total = Number(((countRows ?? [])[0] as RowDataPacket | undefined)?.total ?? 0);

  const rows = await queryRows<RowDataPacket>(
    `
      select
        al.id, al.user_id, al.action, al.entity_type, al.entity_id,
        al.metadata, al.ip_address, al.user_agent,
        al.created_at,
        u.name as user_name, u.email as user_email, r.name as user_role
      from audit_logs al
      left join users u on u.id = al.user_id
      left join roles r on r.id = u.role_id
      ${where}
      order by al.created_at desc
      limit ? offset ?
    `,
    [...params, pageSize, offset],
  );

  const entries: AuditLogEntry[] = (rows as RowDataPacket[]).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
    userName: String(row.user_name ?? "—"),
    userEmail: String(row.user_email ?? "—"),
    userRole: String(row.user_role ?? "—"),
    ipAddress: row.ip_address ? String(row.ip_address) : undefined,
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
  }));

  return { entries, total, page, pageSize };
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<Task | null> {
  const updated = await withConnection(async (connection) => {
    await connection.query(
      `update tasks set ${completedAtAssignment("?")}, status = ? where id = ?`,
      [status, status, id],
    );
    await connection.query(
      "update problem_reports set status = ? where task_id = ?",
      [status, id],
    );
    const tasks = await getTasks();
    return tasks.find((task) => task.id === id) ?? null;
  });

  if (updated !== null) {
    return updated;
  }

  const task = mockTasks.find((item) => item.id === id);
  return task ? { ...task, status } : null;
}

type ProblemCategoryRow = {
  id: string;
  title: string;
  is_active: boolean | number;
  sort_order: number;
  deleted_at: DatabaseDate | null;
};

/**
 * Problem categories with their links. resolvedUserIds is who a new report
 * in that category is assigned to: linked users plus the current members
 * of linked roles, limited to task-assignable users — so a role link keeps
 * following the role as people join or leave it.
 */
export async function getProblemCategories({
  includeDeleted = false,
  activeOnly = false,
}: { includeDeleted?: boolean; activeOnly?: boolean } = {}): Promise<ProblemCategory[]> {
  await ensureOperationalSchema();

  const filters = [
    includeDeleted ? "" : "deleted_at is null",
    activeOnly ? "is_active = true" : "",
  ].filter(Boolean);
  const loaded = await Promise.all([
    queryRows<ProblemCategoryRow>(
      `
        select id, title, is_active, sort_order, deleted_at
        from problem_categories
        ${filters.length ? `where ${filters.join(" and ")}` : ""}
        order by sort_order, created_at
      `,
    ),
    queryRows<{ category_id: string; user_id: string }>(
      "select category_id, user_id from problem_category_users",
    ),
    queryRows<{ category_id: string; role_id: string }>(
      "select category_id, role_id from problem_category_roles",
    ),
    getUsers(),
    getRoles(),
  ]).catch((error) => {
    // e.g. ER_NO_SUCH_TABLE when the category tables couldn't be created;
    // the report form then falls back to a typed title.
    console.error("[problem-categories] unavailable", error);
    return null;
  });
  if (!loaded?.[0]) {
    return [];
  }
  const [rows, userLinks, roleLinks, users, roles] = loaded;

  const assignable = getAssignableTaskUsers(users);
  const assignableIds = new Set(assignable.map((user) => user.id));
  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
  const groupBy = <T extends { category_id: string }>(
    links: T[] | null,
    pick: (link: T) => string,
  ) => {
    const grouped = new Map<string, string[]>();
    for (const link of links ?? []) {
      grouped.set(link.category_id, [...(grouped.get(link.category_id) ?? []), pick(link)]);
    }
    return grouped;
  };
  const usersByCategory = groupBy(userLinks, (link) => link.user_id);
  const rolesByCategory = groupBy(roleLinks, (link) => link.role_id);

  return rows.map((row) => {
    const userIds = usersByCategory.get(row.id) ?? [];
    const roleIds = rolesByCategory.get(row.id) ?? [];
    const roleNames = new Set(
      roleIds.map((roleId) => roleNameById.get(roleId)).filter(Boolean),
    );
    const resolved = new Set(userIds.filter((userId) => assignableIds.has(userId)));
    for (const user of assignable) {
      if (roleNames.has(user.role)) {
        resolved.add(user.id);
      }
    }

    return {
      id: row.id,
      title: row.title,
      isActive: toBoolean(row.is_active),
      deletedAt: row.deleted_at ? toDateTimeString(row.deleted_at) : undefined,
      sortOrder: Number(row.sort_order) || 0,
      userIds,
      roleIds,
      resolvedUserIds: [...resolved],
    };
  });
}

/** An active, non-deleted category, or null — used when a report is filed. */
export async function getActiveProblemCategory(id: string) {
  if (!id) {
    return null;
  }
  const categories = await getProblemCategories({ activeOnly: true });
  return categories.find((category) => category.id === id) ?? null;
}

export async function saveProblemCategory(
  input: {
    id?: string;
    title?: string;
    userIds?: string[];
    roleIds?: string[];
    isActive?: boolean;
    deleted?: boolean;
  },
  options: { createdBy?: string } = {},
): Promise<ProblemCategory | null> {
  await ensureOperationalSchema();

  const savedId = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      let id = input.id;
      if (id) {
        const [existing] = await connection.query<RowDataPacket[]>(
          "select id from problem_categories where id = ? limit 1 for update",
          [id],
        );
        if (!existing.length) {
          await connection.rollback();
          return null;
        }
      } else {
        id = makeId("pcat");
        const [orderRows] = await connection.query<RowDataPacket[]>(
          "select coalesce(max(sort_order), -1) + 1 as next_order from problem_categories",
        );
        await connection.query(
          "insert into problem_categories (id, title, sort_order, created_by) values (?, ?, ?, ?)",
          [id, input.title ?? "", Number(orderRows[0]?.next_order) || 0, options.createdBy ?? null],
        );
      }

      const updates: string[] = [];
      const params: unknown[] = [];
      if (input.id && input.title !== undefined) {
        updates.push("title = ?");
        params.push(input.title);
      }
      if (input.isActive !== undefined) {
        updates.push("is_active = ?");
        params.push(input.isActive);
      }
      if (input.deleted !== undefined) {
        updates.push(input.deleted ? "deleted_at = current_timestamp" : "deleted_at = null");
      }
      if (updates.length) {
        await connection.query(
          `update problem_categories set ${updates.join(", ")} where id = ?`,
          [...params, id],
        );
      }

      if (input.userIds) {
        await connection.query("delete from problem_category_users where category_id = ?", [id]);
        if (input.userIds.length) {
          await connection.query(
            `insert ignore into problem_category_users (category_id, user_id)
             select ?, id from users where id in (?)`,
            [id, input.userIds],
          );
        }
      }
      if (input.roleIds) {
        await connection.query("delete from problem_category_roles where category_id = ?", [id]);
        if (input.roleIds.length) {
          await connection.query(
            `insert ignore into problem_category_roles (category_id, role_id)
             select ?, id from roles where id in (?)`,
            [id, input.roleIds],
          );
        }
      }

      await connection.commit();
      return id;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

  if (!savedId) {
    return null;
  }
  const categories = await getProblemCategories({ includeDeleted: true });
  return categories.find((category) => category.id === savedId) ?? null;
}

// Kick off schema migration as soon as this module is first imported so the
// 200-400ms DDL cost is paid in the background, not blocking the first request.
if (!isBuildTime()) {
  void ensureOperationalSchema();
}
