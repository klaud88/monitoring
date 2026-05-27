use biostar_status_ops;

insert into roles (id, name, label) values
  ('role-admin', 'admin', 'ადმინისტრატორი'),
  ('role-dispatcher', 'dispatcher', 'დისპეტჩერი'),
  ('role-technician', 'technician', 'ტექნიკოსი'),
  ('role-viewer', 'viewer', 'მხოლოდ ნახვა')
on duplicate key update label = values(label);

insert into permissions (id, code, label, page_key, action_key) values
  ('perm-dashboard-view', 'dashboard.view', 'რუკის ნახვა', 'dashboard', 'view'),
  ('perm-dashboard-create', 'dashboard.create', 'რუკაზე დამატება', 'dashboard', 'create'),
  ('perm-dashboard-edit', 'dashboard.edit', 'რუკის ცვლილება', 'dashboard', 'edit'),
  ('perm-dashboard-delete', 'dashboard.delete', 'რუკიდან წაშლა', 'dashboard', 'delete'),
  ('perm-tasks-view', 'tasks.view', 'ტასკების ნახვა', 'tasks', 'view'),
  ('perm-tasks-create', 'tasks.create', 'ტასკის დამატება', 'tasks', 'create'),
  ('perm-tasks-edit', 'tasks.edit', 'ტასკის შეცვლა', 'tasks', 'edit'),
  ('perm-tasks-delete', 'tasks.delete', 'ტასკის წაშლა', 'tasks', 'delete'),
  ('perm-regions-view', 'regions.view', 'რეგიონების ნახვა', 'regions', 'view'),
  ('perm-regions-create', 'regions.create', 'რეგიონის დამატება', 'regions', 'create'),
  ('perm-regions-edit', 'regions.edit', 'რეგიონის შეცვლა', 'regions', 'edit'),
  ('perm-regions-delete', 'regions.delete', 'რეგიონის წაშლა', 'regions', 'delete'),
  ('perm-users-view', 'users.view', 'მომხმარებლების ნახვა', 'users', 'view'),
  ('perm-users-create', 'users.create', 'მომხმარებლის დამატება', 'users', 'create'),
  ('perm-users-edit', 'users.edit', 'მომხმარებლის შეცვლა', 'users', 'edit'),
  ('perm-users-delete', 'users.delete', 'მომხმარებლის წაშლა', 'users', 'delete'),
  ('perm-permissions-view', 'permissions.view', 'უფლებების ნახვა', 'permissions', 'view'),
  ('perm-permissions-create', 'permissions.create', 'უფლების დამატება', 'permissions', 'create'),
  ('perm-permissions-edit', 'permissions.edit', 'უფლების შეცვლა', 'permissions', 'edit'),
  ('perm-permissions-delete', 'permissions.delete', 'უფლების წაშლა', 'permissions', 'delete'),
  ('perm-analytics-view', 'analytics.view', 'ანალიტიკის ნახვა', 'analytics', 'view'),
  ('perm-analytics-create', 'analytics.create', 'ანალიტიკის დამატება', 'analytics', 'create'),
  ('perm-analytics-edit', 'analytics.edit', 'ანალიტიკის შეცვლა', 'analytics', 'edit'),
  ('perm-analytics-delete', 'analytics.delete', 'ანალიტიკის წაშლა', 'analytics', 'delete')
on duplicate key update label = values(label);

insert ignore into role_permissions (role_id, permission_id)
select 'role-admin', id from permissions;

insert ignore into role_permissions (role_id, permission_id)
select 'role-dispatcher', id from permissions
where code in ('dashboard.view', 'tasks.view', 'tasks.create', 'tasks.edit', 'regions.view', 'analytics.view');

insert ignore into role_permissions (role_id, permission_id)
select 'role-technician', id from permissions
where code in ('dashboard.view', 'tasks.view', 'tasks.edit', 'regions.view', 'analytics.view');

insert ignore into role_permissions (role_id, permission_id)
select 'role-viewer', id from permissions
where code in ('dashboard.view', 'tasks.view', 'analytics.view');

insert into users (id, role_id, name, email, password_hash, initials, color) values
  ('u-admin', 'role-admin', 'ნინო ბერიძე', 'admin@local.ge', 'dev:admin123', 'NB', '#2563eb'),
  ('u-giorgi', 'role-technician', 'გიორგი კაპანაძე', 'giorgi@local.ge', 'dev:admin123', 'GK', '#16a34a'),
  ('u-maka', 'role-dispatcher', 'მაკა წერეთელი', 'maka@local.ge', 'dev:admin123', 'MT', '#f97316'),
  ('u-levan', 'role-technician', 'ლევან მაისურაძე', 'levan@local.ge', 'dev:admin123', 'LM', '#7c3aed'),
  ('u-ana', 'role-viewer', 'ანა გოცირიძე', 'ana@local.ge', 'dev:admin123', 'AG', '#0f766e')
on duplicate key update name = values(name), role_id = values(role_id), color = values(color);

insert into regions (id, name, color) values
  ('region-vake', 'ვაკე-საბურთალო', '#2563eb'),
  ('region-mtatsminda', 'მთაწმინდა-კრწანისი', '#0f766e'),
  ('region-isani', 'ისანი-სამგორი', '#f97316'),
  ('region-didube', 'დიდუბე-ჩუღურეთი', '#7c3aed'),
  ('region-gldani', 'გლდანი-ნაძალადევი', '#dc2626'),
  ('region-didgori', 'დიდგორი', '#64748b')
on duplicate key update color = values(color);

insert into tags (id, name, color) values
  ('tag-power-problem', 'ელ.პრობლემა', '#f97316'),
  ('tag-cameras', 'კამერები', '#7c3aed'),
  ('tag-ups', 'UPS', '#0f766e'),
  ('tag-offline', 'offline', '#dc2626')
on duplicate key update color = values(color);

insert into devices (id, code, name, status, region_id, position_x, position_y, last_seen_at) values
  ('dev-101', 'TB-101', 'ვაკე - ჭავჭავაძე', 'offline', 'region-vake', 31.00, 48.00, '2026-05-27 16:35:00'),
  ('dev-118', 'TB-118', 'საბურთალო - უნივერსიტეტი', 'online', 'region-vake', 42.00, 37.00, '2026-05-27 21:02:00'),
  ('dev-203', 'TB-203', 'რუსთაველი - ოპერა', 'online', 'region-mtatsminda', 51.00, 49.00, '2026-05-27 21:05:00'),
  ('dev-244', 'TB-244', 'ავლაბარი - მეტრო', 'offline', 'region-isani', 62.00, 56.00, '2026-05-27 14:50:00'),
  ('dev-305', 'TB-305', 'დიდუბე - სადგური', 'online', 'region-didube', 45.00, 29.00, '2026-05-27 21:01:00'),
  ('dev-330', 'TB-330', 'ჩუღურეთი - აღმაშენებელი', 'online', 'region-didube', 55.00, 38.00, '2026-05-27 21:04:00'),
  ('dev-401', 'TB-401', 'გლდანი - სავაჭრო ცენტრი', 'offline', 'region-gldani', 61.00, 22.00, '2026-05-27 18:05:00'),
  ('dev-520', 'TB-520', 'ტაბახმელა - საწყობი', 'online', 'region-didgori', 35.00, 68.00, '2026-05-27 20:58:00')
on duplicate key update status = values(status), region_id = values(region_id), last_seen_at = values(last_seen_at);

insert ignore into device_tags (device_id, tag_id) values
  ('dev-101', 'tag-offline'), ('dev-101', 'tag-power-problem'),
  ('dev-118', 'tag-offline'),
  ('dev-203', 'tag-cameras'),
  ('dev-244', 'tag-offline'), ('dev-244', 'tag-ups'), ('dev-244', 'tag-power-problem'),
  ('dev-305', 'tag-offline'),
  ('dev-330', 'tag-cameras'),
  ('dev-401', 'tag-offline'), ('dev-401', 'tag-ups'), ('dev-401', 'tag-power-problem'),
  ('dev-520', 'tag-offline');

insert ignore into associated_devices (id, device_id, name, biostar_device_id) values
  ('ad-101-1', 'dev-101', 'BioEntry W2', 'bs2-101-1'),
  ('ad-101-2', 'dev-101', 'DM-20 Door Module', 'bs2-101-2'),
  ('ad-244-1', 'dev-244', 'BioStation 3', 'bs2-244-1'),
  ('ad-244-2', 'dev-244', 'UPS Sensor', 'bs2-244-2'),
  ('ad-401-1', 'dev-401', 'BioStation A2', 'bs2-401-1'),
  ('ad-401-2', 'dev-401', 'UPS Sensor', 'bs2-401-2');

insert ignore into tasks (id, title, issue, device_id, status, priority, starts_at, due_date, created_by) values
  ('task-1', 'TB-101 ქსელის აღდგენა', 'კონტროლერის ქსელთან კავშირის აღდგენა და პორტის ტესტი.', 'dev-101', 'planned', 'urgent', '2026-05-28 09:30:00', '2026-05-28', 'u-admin'),
  ('task-2', 'TB-244 UPS შემოწმება', 'ძაბვის ჩავარდნის წყაროს პოვნა და UPS battery test.', 'dev-244', 'in_progress', 'high', '2026-05-27 19:30:00', '2026-05-27', 'u-admin'),
  ('task-3', 'TB-401 ელკვების დიაგნოსტიკა', 'კვების ხაზის შემოწმება, დამიწების და UPS-ის შეცვლის საჭიროების შეფასება.', 'dev-401', 'planned', 'high', '2026-05-28 13:00:00', '2026-05-28', 'u-admin'),
  ('task-4', 'TB-118 firmware ფანჯარა', 'FaceStation F2 firmware update და BioStar2 sync verification.', 'dev-118', 'planned', 'normal', '2026-05-29 02:00:00', '2026-05-29', 'u-admin');

insert ignore into task_assignees (task_id, user_id) values
  ('task-1', 'u-giorgi'), ('task-1', 'u-maka'),
  ('task-2', 'u-maka'),
  ('task-3', 'u-levan'),
  ('task-4', 'u-levan'), ('task-4', 'u-giorgi');

insert ignore into status_events (id, device_id, status, happened_at, duration_minutes) values
  ('e-101-1', 'dev-101', 'offline', '2026-05-27 16:35:00', 245),
  ('e-101-2', 'dev-101', 'offline', '2026-04-12 08:10:00', 58),
  ('e-244-1', 'dev-244', 'offline', '2026-05-27 14:50:00', 350),
  ('e-244-2', 'dev-244', 'offline', '2026-05-03 09:16:00', 88),
  ('e-401-1', 'dev-401', 'offline', '2026-05-27 18:05:00', 170),
  ('e-401-2', 'dev-401', 'offline', '2026-05-24 07:05:00', 70);
