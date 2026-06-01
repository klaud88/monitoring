import type { ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { fetchBiostarDevices, hasBiostarConfig } from "./biostar";
import { mockDevices, mockTasks, mockUsers } from "./mock-data";
import type {
  AppUser,
  AppRole,
  Device,
  DeviceStatus,
  MonitoredDevice,
  OfflineSnapshot,
  PermissionKey,
  Region,
  SessionUser,
  StatusEvent,
  Task,
  TaskStatus,
} from "./types";
import { regions as fallbackRegionNames } from "./catalog";
import { queryRows, withConnection } from "./db";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role_name: string;
  initials: string;
  color: string;
  password_hash: string;
  permissions: string | null;
};

type RoleRow = {
  id: string;
  name: string;
  label: string;
  permissions: string | null;
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
  position_x: number;
  position_y: number;
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
  enabled_at: DatabaseDate;
  enabled_date: DatabaseDate;
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
let lastBiostarSyncAt = 0;
let biostarSyncPromise: Promise<{ synced: number; syncedAt: string }> | null =
  null;
let operationalSchemaPromise: Promise<void> | null = null;

type TaskRow = {
  id: string;
  title: string;
  issue: string;
  device_id: string;
  status: TaskStatus;
  priority: Task["priority"];
  starts_at: DatabaseDate | null;
  due_date: DatabaseDate;
  created_at: DatabaseDate;
  assignee_ids: string | null;
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

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const makeStableId = (prefix: string, value: string) => {
  const normalized = Buffer.from(value).toString("hex").slice(0, 36);
  return `${prefix}-${normalized || Date.now().toString(16)}`;
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
  if (!operationalSchemaPromise) {
    operationalSchemaPromise = withConnection(async (connection) => {
      await connection.query(
        "alter table devices modify status enum('online', 'offline', 'error') not null default 'online'",
      );
      await connection.query(
        "alter table status_events modify status enum('online', 'offline', 'error') not null",
      );
      const [deviceColumns] = await connection.query(
        `
          select column_name
          from information_schema.columns
          where table_schema = database()
            and table_name = 'devices'
            and column_name = 'is_excluded'
        `,
      );
      if (!(deviceColumns as { column_name: string }[]).length) {
        await connection.query(
          "alter table devices add column is_excluded boolean not null default false after biostar_payload",
        );
      }
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
          created_at timestamp not null default current_timestamp,
          updated_at timestamp not null default current_timestamp on update current_timestamp,
          constraint fk_monitored_devices_device foreign key (device_id) references devices(id) on delete cascade,
          index idx_monitored_devices_active_date (is_active, enabled_date)
        )
      `);
    })
      .then(() => undefined)
      .catch((error) => {
        operationalSchemaPromise = null;
        throw error;
      });
  }

  await operationalSchemaPromise;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const rows = await queryRows<UserRow>(
    `
      select
        u.id,
        u.name,
        u.email,
        r.name as role_name,
        u.initials,
        u.color,
        u.password_hash,
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
    passwordHash: row.password_hash,
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
    permissions: user.permissions,
  };
}

export async function getUsers(): Promise<SessionUser[]> {
  const rows = await queryRows<UserRow>(
    `
      select
        u.id,
        u.name,
        u.email,
        r.name as role_name,
        u.initials,
        u.color,
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
        insert into users (id, role_id, name, email, password_hash, initials, color)
        values (?, ?, ?, ?, ?, ?, ?)
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
          set role_id = ?, name = ?, email = ?, password_hash = ?, initials = ?, color = ?
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

const fallbackRoles: AppRole[] = [
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
      "regions.view",
      "offline_records.view",
      "offline_records.edit",
      "analytics.view",
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
      "regions.view",
      "offline_records.view",
      "analytics.view",
    ],
  },
];

export async function getRoles(): Promise<AppRole[]> {
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
      order by field(r.name, 'admin', 'dispatcher', 'technician', 'viewer'), r.name
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

export async function updateRolePermissions(
  roleId: string,
  permissions: PermissionKey[],
) {
  const uniquePermissions = [...new Set(permissions)];
  const updated = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
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
        d.position_x,
        d.position_y,
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
    position: { x: Number(row.position_x), y: Number(row.position_y) },
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

export async function createDevice(input: {
  code: string;
  name: string;
  status: DeviceStatus;
  isExcluded?: boolean;
  region?: string | null;
  position: { x: number; y: number };
  tags: string[];
}): Promise<Device> {
  const id = makeId("dev");
  const now = new Date().toISOString();
  const inserted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const regionId = await getRegionIdByName(connection, input.region);
      await connection.query<ResultSetHeader>(
        `
          insert into devices
            (id, code, name, status, is_excluded, region_id, position_x, position_y, last_seen_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          input.code,
          input.name,
          input.status,
          Boolean(input.isExcluded),
          regionId,
          input.position.x,
          input.position.y,
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
      position: input.position,
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
    position: { x: number; y: number };
    tags: string[];
  },
): Promise<Device | null> {
  const updated = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const regionId = await getRegionIdByName(connection, input.region);
      const [result] = await connection.query<ResultSetHeader>(
        `
          update devices
          set
            code = ?,
            name = ?,
            status = ?,
            is_excluded = ?,
            region_id = ?,
            position_x = ?,
            position_y = ?
          where id = ?
        `,
        [
          input.code,
          input.name,
          input.status,
          input.isExcluded,
          regionId,
          input.position.x,
          input.position.y,
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

export async function getMonitoredDevices(): Promise<MonitoredDevice[]> {
  if (isBuildTime()) {
    return [];
  }

  await ensureOperationalSchema();

  const rows = await queryRows<MonitoredDeviceRow>(
    `
      select md.device_id, md.enabled_at, md.enabled_date
      from monitored_devices md
      join devices d on d.id = md.device_id and d.is_excluded = false
      where md.is_active = true
      order by md.enabled_date desc, md.device_id
    `,
  );

  if (!rows) {
    return [];
  }

  return rows.map((row) => ({
    deviceId: row.device_id,
    enabledAt: toDateTimeString(row.enabled_at),
    enabledDate: toDateString(row.enabled_date),
  }));
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
        "select id from devices where id in (?) and is_excluded = false",
        [uniqueDeviceIds],
      );
      const activeDeviceIds = (deviceRows as { id: string }[]).map(
        (device) => device.id,
      );
      if (!activeDeviceIds.length) {
        return;
      }

      await connection.query<ResultSetHeader>(
        `
          insert into monitored_devices (device_id, enabled_at, enabled_date, is_active)
          values ${activeDeviceIds.map(() => "(?, ?, ?, true)").join(", ")}
          on duplicate key update
            enabled_at = values(enabled_at),
            enabled_date = values(enabled_date),
            is_active = true,
            updated_at = current_timestamp
        `,
        activeDeviceIds.flatMap((deviceId) => [
          deviceId,
          enabledAt,
          enabledDate,
        ]),
      );
      return;
    }

    await connection.query<ResultSetHeader>(
      "update monitored_devices set is_active = false where device_id in (?)",
      [uniqueDeviceIds],
    );
  });

  return getMonitoredDevices();
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
  const rows = await queryRows<TaskRow>(
    `
      select
        t.id,
        t.title,
        t.issue,
        t.device_id,
        t.status,
        t.priority,
        t.starts_at,
        t.due_date,
        t.created_at,
        group_concat(ta.user_id order by ta.user_id separator ',') as assignee_ids
      from tasks t
      left join task_assignees ta on ta.task_id = t.id
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
    deviceId: row.device_id,
    status: row.status,
    priority: row.priority,
    startsAt: row.starts_at ? toDateTimeString(row.starts_at) : undefined,
    dueDate: toDateString(row.due_date),
    createdAt: toDateTimeString(row.created_at),
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
  };

  const inserted = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query<ResultSetHeader>(
        `
          insert into tasks (id, title, issue, device_id, status, priority, starts_at, due_date)
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          task.id,
          task.title,
          task.issue,
          task.deviceId,
          task.status,
          task.priority,
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
  const updated = await withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [result] = await connection.query<ResultSetHeader>(
        `
          update tasks
          set
            title = ?,
            issue = ?,
            device_id = ?,
            status = ?,
            priority = ?,
            starts_at = ?,
            due_date = ?
          where id = ?
        `,
        [
          input.title,
          input.issue,
          input.deviceId,
          input.status,
          input.priority,
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
  return task ? { ...task, ...input } : null;
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
