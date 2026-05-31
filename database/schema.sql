create database if not exists biostar_status_ops
  character set utf8mb4
  collate utf8mb4_unicode_ci;

use biostar_status_ops;

create table if not exists roles (
  id varchar(64) primary key,
  name varchar(80) not null unique,
  label varchar(120) not null
);

create table if not exists permissions (
  id varchar(64) primary key,
  code varchar(120) not null unique,
  label varchar(160) not null,
  page_key varchar(80) not null,
  action_key varchar(80) not null
);

create table if not exists role_permissions (
  role_id varchar(64) not null,
  permission_id varchar(64) not null,
  primary key (role_id, permission_id),
  constraint fk_role_permissions_role foreign key (role_id) references roles(id) on delete cascade,
  constraint fk_role_permissions_permission foreign key (permission_id) references permissions(id) on delete cascade
);

create table if not exists users (
  id varchar(64) primary key,
  role_id varchar(64) not null,
  name varchar(160) not null,
  email varchar(180) not null unique,
  password_hash varchar(255) not null,
  initials varchar(12) not null,
  color varchar(24) not null,
  is_active boolean not null default true,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  constraint fk_users_role foreign key (role_id) references roles(id)
);

create table if not exists regions (
  id varchar(64) primary key,
  name varchar(160) not null unique,
  color varchar(24) not null
);

create table if not exists tags (
  id varchar(64) primary key,
  name varchar(120) not null unique,
  color varchar(24) not null
);

create table if not exists devices (
  id varchar(64) primary key,
  code varchar(80) not null unique,
  name varchar(180) not null,
  status enum('online', 'offline', 'error') not null default 'online',
  region_id varchar(64) null,
  position_x decimal(5,2) not null default 50.00,
  position_y decimal(5,2) not null default 50.00,
  last_seen_at datetime not null,
  biostar_payload json null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  constraint fk_devices_region foreign key (region_id) references regions(id) on delete set null
);

create table if not exists device_tags (
  device_id varchar(64) not null,
  tag_id varchar(64) not null,
  primary key (device_id, tag_id),
  constraint fk_device_tags_device foreign key (device_id) references devices(id) on delete cascade,
  constraint fk_device_tags_tag foreign key (tag_id) references tags(id) on delete cascade
);

create table if not exists associated_devices (
  id varchar(64) primary key,
  device_id varchar(64) not null,
  name varchar(180) not null,
  biostar_device_id varchar(120) null,
  constraint fk_associated_devices_device foreign key (device_id) references devices(id) on delete cascade
);

create table if not exists device_issues (
  id varchar(64) primary key,
  device_id varchar(64) not null,
  title varchar(220) not null,
  description text not null,
  status enum('open', 'planned', 'resolved') not null default 'open',
  reported_at datetime not null,
  planned_at datetime null,
  resolved_at datetime null,
  owner_user_id varchar(64) null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  constraint fk_device_issues_device foreign key (device_id) references devices(id) on delete cascade,
  constraint fk_device_issues_owner foreign key (owner_user_id) references users(id) on delete set null
);

create table if not exists status_events (
  id varchar(64) primary key,
  device_id varchar(64) not null,
  status enum('online', 'offline', 'error') not null,
  happened_at datetime not null,
  duration_minutes int null,
  raw_payload json null,
  constraint fk_status_events_device foreign key (device_id) references devices(id) on delete cascade,
  index idx_status_events_device_time (device_id, happened_at),
  index idx_status_events_time_status (happened_at, status)
);

create table if not exists offline_snapshots (
  id varchar(64) primary key,
  snapshot_date date not null unique,
  captured_at datetime not null,
  created_at timestamp not null default current_timestamp,
  index idx_offline_snapshots_date (snapshot_date)
);

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
);

create table if not exists monitored_devices (
  device_id varchar(64) primary key,
  enabled_at datetime not null,
  enabled_date date not null,
  is_active boolean not null default true,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  constraint fk_monitored_devices_device foreign key (device_id) references devices(id) on delete cascade,
  index idx_monitored_devices_active_date (is_active, enabled_date)
);

create table if not exists tasks (
  id varchar(64) primary key,
  title varchar(220) not null,
  issue text not null,
  device_id varchar(64) not null,
  status enum('planned', 'in_progress', 'blocked', 'done') not null default 'planned',
  priority enum('low', 'normal', 'high', 'urgent') not null default 'normal',
  starts_at datetime null,
  due_date date not null,
  created_by varchar(64) null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  constraint fk_tasks_device foreign key (device_id) references devices(id) on delete cascade,
  constraint fk_tasks_created_by foreign key (created_by) references users(id) on delete set null,
  index idx_tasks_device_status (device_id, status)
);

create table if not exists task_assignees (
  task_id varchar(64) not null,
  user_id varchar(64) not null,
  primary key (task_id, user_id),
  constraint fk_task_assignees_task foreign key (task_id) references tasks(id) on delete cascade,
  constraint fk_task_assignees_user foreign key (user_id) references users(id) on delete cascade
);

create table if not exists audit_logs (
  id varchar(96) primary key,
  user_id varchar(64) not null,
  action varchar(120) not null,
  entity_type varchar(80) not null,
  entity_id varchar(96) null,
  metadata json null,
  ip_address varchar(80) null,
  user_agent varchar(255) null,
  created_at timestamp not null default current_timestamp,
  constraint fk_audit_logs_user foreign key (user_id) references users(id) on delete cascade,
  index idx_audit_logs_user_time (user_id, created_at),
  index idx_audit_logs_entity (entity_type, entity_id)
);
