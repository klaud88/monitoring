"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Save,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type {
  AppRole,
  PageKey,
  PermissionAction,
  PermissionKey,
} from "@/lib/types";

const defaultActions: { key: PermissionAction; label: string }[] = [
  { key: "view", label: "ნახვა" },
  { key: "create", label: "დამატება" },
  { key: "edit", label: "შეცვლა" },
  { key: "delete", label: "წაშლა" },
];

const problemReportActions: { key: PermissionAction; label: string }[] = [
  ...defaultActions,
  { key: "assign", label: "მომხმარებლები" },
  { key: "tag", label: "ტეგები" },
  { key: "status", label: "სტატუსები" },
];

const pages: {
  key: PageKey;
  label: string;
  actions?: { key: PermissionAction; label: string }[];
}[] = [
  { key: "dashboard", label: "რუკა" },
  { key: "devices", label: "X-Stations" },
  { key: "regions", label: "რაიონები" },
  { key: "tasks", label: "ტასკები" },
  {
    key: "problem_reports",
    label: "პრობლემების რეგისტრაცია",
    actions: problemReportActions,
  },
  { key: "offline_records", label: "Offline აღრიცხვა" },
  { key: "users", label: "მომხმარებლები" },
  { key: "analytics", label: "ანალიტიკა" },
  { key: "permissions", label: "უფლებები" },
];

export function PermissionsManager({
  roles,
  canEdit,
}: {
  roles: AppRole[];
  canEdit: boolean;
}) {
  const [roleList, setRoleList] = useState(roles);
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedRole = useMemo(
    () => roleList.find((role) => role.id === selectedRoleId) || roleList[0],
    [selectedRoleId, roleList],
  );
  const selectedPermissions = selectedRole?.permissions ?? [];

  async function togglePermission(permission: PermissionKey) {
    if (!selectedRole || !canEdit || saving) {
      return;
    }

    const existing = selectedRole.permissions;
    const nextPermissions = existing.includes(permission)
      ? existing.filter((item) => item !== permission)
      : [...existing, permission];

    setRoleList((current) =>
      current.map((role) =>
        role.id === selectedRole.id
          ? { ...role, permissions: nextPermissions }
          : role,
      ),
    );
    setSaving(true);
    setError("");

    const response = await fetch(`/api/roles/${selectedRole.id}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: nextPermissions }),
    });

    setSaving(false);
    if (!response.ok) {
      setError("უფლებების შენახვა ვერ მოხერხდა.");
      setRoleList((current) =>
        current.map((role) =>
          role.id === selectedRole.id
            ? { ...role, permissions: existing }
            : role,
        ),
      );
      return;
    }

    const data = (await response.json()) as { role: AppRole };
    setRoleList((current) =>
      current.map((role) => (role.id === data.role.id ? data.role : role)),
    );
  }

  return (
    <div className="permissions-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">ადმინისტრირება</p>
          <h1>როლების უფლებები</h1>
          <p>უფლებები ენიჭება როლს და ავტომატურად ვრცელდება ამ როლის ყველა მომხმარებელზე.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <ShieldCheck size={18} />
            <span>{roleList.length}</span>
            <small>როლი</small>
          </div>
          <div className="metric">
            <LockKeyhole size={18} />
            <span>{selectedPermissions.length}</span>
            <small>უფლება</small>
          </div>
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      <section className="content-grid permissions-grid">
        <aside className="surface user-list-panel">
          <div className="section-title">
            <h2>როლები</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="permission-user-list">
            {roleList.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`permission-user ${role.id === selectedRoleId ? "active" : ""}`}
                onClick={() => setSelectedRoleId(role.id)}
              >
                <span className="role-icon">
                  <ShieldCheck size={17} />
                </span>
                <span>
                  <strong>{role.label}</strong>
                  <small>{role.permissions.length} უფლება</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="surface permission-matrix-panel">
          <div className="section-title">
            <h2>{selectedRole?.label}</h2>
            <button className="ghost-button" type="button" disabled>
              <Save size={16} />
              <span>{saving ? "ინახება..." : canEdit ? "ავტოშენახვა" : "მხოლოდ ნახვა"}</span>
            </button>
          </div>

          <div className="permission-matrix">
            <div className="permission-row head">
              <span>სექცია</span>
              <span>უფლებები</span>
              <span>მენიუში</span>
            </div>
            {pages.map((page) => {
              const actions = page.actions ?? defaultActions;
              const canView = selectedPermissions.includes(
                `${page.key}.view` as PermissionKey,
              );
              return (
                <div key={page.key} className="permission-row">
                  <strong>{page.label}</strong>
                  <div className="permission-action-list">
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
                          disabled={!canEdit || saving}
                        >
                          {enabled ? (
                            <ToggleRight size={28} />
                          ) : (
                            <ToggleLeft size={28} />
                          )}
                          <span>{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
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
