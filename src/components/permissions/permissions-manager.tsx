"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Save, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { recordAudit } from "@/lib/client-audit";
import type { AppUser, PageKey, PermissionAction, PermissionKey } from "@/lib/types";

const pages: { key: PageKey; label: string }[] = [
  { key: "dashboard", label: "რუკა" },
  { key: "tasks", label: "ტასკები" },
  { key: "regions", label: "რეგიონები" },
  { key: "users", label: "მომხმარებლები" },
  { key: "analytics", label: "ანალიტიკა" },
  { key: "permissions", label: "უფლებები" }
];

const actions: { key: PermissionAction; label: string }[] = [
  { key: "view", label: "ნახვა" },
  { key: "create", label: "დამატება" },
  { key: "edit", label: "შეცვლა" },
  { key: "delete", label: "წაშლა" }
];

export function PermissionsManager({ users }: { users: AppUser[] }) {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || "");
  const [permissionsByUser, setPermissionsByUser] = useState(
    Object.fromEntries(users.map((user) => [user.id, user.permissions])) as Record<string, PermissionKey[]>
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || users[0],
    [selectedUserId, users]
  );
  const selectedPermissions = selectedUser ? permissionsByUser[selectedUser.id] ?? [] : [];

  function togglePermission(permission: PermissionKey) {
    if (!selectedUser) {
      return;
    }

    setPermissionsByUser((current) => {
      const existing = current[selectedUser.id] ?? [];
      const next = existing.includes(permission)
        ? existing.filter((item) => item !== permission)
        : [...existing, permission];

      recordAudit("permission.toggle", "user", selectedUser.id, { permission, enabled: next.includes(permission) });
      return { ...current, [selectedUser.id]: next };
    });
  }

  return (
    <div className="permissions-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">ადმინისტრირება</p>
          <h1>მომხმარებლების უფლებები</h1>
          <p>ტაბების დამალვა ხდება მაშინ, როცა მომხმარებელს შესაბამისი ნახვის უფლება არ აქვს.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <ShieldCheck size={18} />
            <span>{users.length}</span>
            <small>მომხმარებელი</small>
          </div>
          <div className="metric">
            <LockKeyhole size={18} />
            <span>{selectedPermissions.length}</span>
            <small>უფლება</small>
          </div>
        </div>
      </section>

      <section className="content-grid permissions-grid">
        <aside className="surface user-list-panel">
          <div className="section-title">
            <h2>მომხმარებლები</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="permission-user-list">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`permission-user ${user.id === selectedUserId ? "active" : ""}`}
                onClick={() => setSelectedUserId(user.id)}
              >
                <span className="avatar" style={{ backgroundColor: user.color }}>
                  {user.initials}
                </span>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.role}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="surface permission-matrix-panel">
          <div className="section-title">
            <h2>{selectedUser?.name}</h2>
            <button className="ghost-button" type="button" onClick={() => recordAudit("permission.save", "user", selectedUser?.id)}>
              <Save size={16} />
              <span>შენახულია</span>
            </button>
          </div>

          <div className="permission-matrix">
            <div className="permission-row head">
              <span>ტაბი</span>
              {actions.map((action) => (
                <span key={action.key}>{action.label}</span>
              ))}
              <span>მენიუში</span>
            </div>
            {pages.map((page) => {
              const canView = selectedPermissions.includes(`${page.key}.view` as PermissionKey);
              return (
                <div key={page.key} className="permission-row">
                  <strong>{page.label}</strong>
                  {actions.map((action) => {
                    const permission = `${page.key}.${action.key}` as PermissionKey;
                    const enabled = selectedPermissions.includes(permission);
                    return (
                      <button
                        key={permission}
                        type="button"
                        className={`permission-toggle ${enabled ? "enabled" : ""}`}
                        onClick={() => togglePermission(permission)}
                        aria-label={`${page.label} ${action.label}`}
                      >
                        {enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                      </button>
                    );
                  })}
                  <span className={`visibility-pill ${canView ? "visible" : "hidden"}`}>
                    {canView ? <Eye size={15} /> : <EyeOff size={15} />}
                    {canView ? "ჩანს" : "დამალულია"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
