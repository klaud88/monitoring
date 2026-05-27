import type { ResultSetHeader } from "mysql2";
import { mockDevices, mockTasks, mockUsers } from "./mock-data";
import type { AppUser, Device, PermissionKey, Task, TaskStatus } from "./types";
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

type DeviceRow = {
  id: string;
  code: string;
  name: string;
  status: "online" | "offline";
  region: string;
  position_x: number;
  position_y: number;
  last_seen_at: string;
  tags: string | null;
  associated_devices: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  issue: string;
  device_id: string;
  status: TaskStatus;
  priority: Task["priority"];
  starts_at: string | null;
  due_date: string;
  created_at: string;
  assignee_ids: string | null;
};

const csv = (value: string | null | undefined) =>
  value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];

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
      where u.email = ?
      group by u.id, r.name
      limit 1
    `,
    [email]
  );

  if (!rows) {
    return mockUsers.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
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
    permissions: csv(row.permissions) as PermissionKey[]
  };
}

export async function getUsers(): Promise<AppUser[]> {
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
      where u.is_active = true
      group by u.id, r.name
      order by u.name
    `
  );

  if (!rows) {
    return mockUsers;
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role_name,
    initials: row.initials,
    color: row.color,
    passwordHash: row.password_hash,
    permissions: csv(row.permissions) as PermissionKey[]
  }));
}

export async function getDevices(): Promise<Device[]> {
  const rows = await queryRows<DeviceRow>(
    `
      select
        d.id,
        d.code,
        d.name,
        d.status,
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
    `
  );

  if (!rows) {
    return mockDevices;
  }

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    region: row.region,
    tags: csv(row.tags),
    position: { x: Number(row.position_x), y: Number(row.position_y) },
    lastSeenAt: row.last_seen_at,
    associatedDevices: csv(row.associated_devices),
    problems: [],
    statusEvents: []
  }));
}

export async function getDeviceById(id: string): Promise<Device | null> {
  const devices = await getDevices();
  return devices.find((device) => device.id === id) ?? null;
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
    `
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
    startsAt: row.starts_at ?? undefined,
    dueDate: row.due_date,
    createdAt: row.created_at,
    assigneeIds: csv(row.assignee_ids)
  }));
}

export async function createTask(input: Omit<Task, "id" | "createdAt">): Promise<Task> {
  const id = `task-${Date.now()}`;
  const task: Task = {
    id,
    createdAt: new Date().toISOString(),
    ...input
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
          task.dueDate
        ]
      );

      if (task.assigneeIds.length) {
        await connection.query(
          `
            insert into task_assignees (task_id, user_id)
            values ${task.assigneeIds.map(() => "(?, ?)").join(", ")}
          `,
          task.assigneeIds.flatMap((userId) => [task.id, userId])
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

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
  const updated = await withConnection(async (connection) => {
    await connection.query("update tasks set status = ? where id = ?", [status, id]);
    const tasks = await getTasks();
    return tasks.find((task) => task.id === id) ?? null;
  });

  if (updated !== null) {
    return updated;
  }

  const task = mockTasks.find((item) => item.id === id);
  return task ? { ...task, status } : null;
}
