"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  LockKeyhole,
  Save,
  Plus,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  defaultActions,
  permissionPages,
} from "@/lib/permission-catalog";
import { isFeatureDisabled } from "@/lib/feature-flags";
import type { AppRole, PermissionKey } from "@/lib/types";

export function PermissionsManager({
  roles,
  canEdit,
  disabledFeatures = [],
}: {
  roles: AppRole[];
  canEdit: boolean;
  /* Switched off for this organisation by the platform admin: shown greyed
     out and locked. A role keeps its stored rows for them, so switching a
     feature back on restores them. */
  disabledFeatures?: string[];
}) {
  const pages = permissionPages;
  const [roleList, setRoleList] = useState(roles);
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [error, setError] = useState("");

  const selectedRole = useMemo(
    () => roleList.find((role) => role.id === selectedRoleId) || roleList[0],
    [selectedRoleId, roleList],
  );
  // Admin passes every permission check regardless of these rows
  // (hasPermission), so its switches are shown on and locked.
  const isAdminRole = selectedRole?.name === "admin";
  const selectedPermissions = selectedRole?.permissions ?? [];

  async function createRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving || creatingRole) {
      return;
    }

    const name = normalizeRoleName(newRoleName);
    const label = newRoleLabel.trim();
    if (!name || !label) {
      setError("როლის სახელი და კოდი აუცილებელია.");
      return;
    }
    if (!/^[a-z][a-z0-9_-]{0,79}$/.test(name)) {
      setError("როლის კოდი უნდა დაიწყოს ლათინური ასოთი და შეიცავდეს მხოლოდ a-z, 0-9, _ ან - სიმბოლოებს.");
      return;
    }
    if (roleList.some((role) => role.name === name)) {
      setError("ასეთი როლი უკვე არსებობს.");
      return;
    }

    setCreatingRole(true);
    setError("");
    const response = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, label }),
    });
    setCreatingRole(false);

    if (!response.ok) {
      setError(response.status === 409 ? "ასეთი როლი უკვე არსებობს." : "როლის დამატება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { role: AppRole };
    setRoleList((current) => [...current, data.role]);
    setSelectedRoleId(data.role.id);
    setNewRoleLabel("");
    setNewRoleName("");
  }

  async function togglePermission(permission: PermissionKey) {
    if (!selectedRole || !canEdit || saving || isAdminRole) {
      return;
    }

    const existing = selectedRole.permissions;
    const isCurrentlyEnabled = existing.includes(permission);

    let nextPermissions: PermissionKey[];
    if (isCurrentlyEnabled) {
      const [pageKey, actionKey] = permission.split(".");
      const page = pages.find((p) => p.key === pageKey);
      const dependents = (page?.actions ?? [])
        .filter((action) => action.dependsOn === actionKey)
        .map((action) => `${pageKey}.${action.key}` as PermissionKey);
      nextPermissions = existing.filter(
        (item) => item !== permission && !dependents.includes(item),
      );
    } else {
      nextPermissions = [...existing, permission];
    }

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
      const failure = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(
        `უფლებების შენახვა ვერ მოხერხდა.${failure?.message ? ` (${failure.message})` : ""}`,
      );
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
          <p>
            უფლებები ენიჭება როლს და ავტომატურად ვრცელდება ამ როლის ყველა
            მომხმარებელზე.
          </p>
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
          {canEdit ? (
            <form className="role-create-form" onSubmit={createRole}>
              <label className="sr-only" htmlFor="new-role-label">
                როლის სახელი
              </label>
              <input
                id="new-role-label"
                value={newRoleLabel}
                onChange={(event) => setNewRoleLabel(event.target.value)}
                placeholder="როლის სახელი"
              />
              <label className="sr-only" htmlFor="new-role-name">
                როლის კოდი
              </label>
              <input
                id="new-role-name"
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
                placeholder="role_code"
              />
              <button className="primary-button" type="submit" disabled={saving || creatingRole}>
                <Plus size={16} />
                <span>{creatingRole ? "ემატება..." : "დამატება"}</span>
              </button>
            </form>
          ) : null}
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
              <span>
                {saving
                  ? "ინახება..."
                  : canEdit
                    ? "ავტოშენახვა"
                    : "მხოლოდ ნახვა"}
              </span>
            </button>
          </div>

          {isAdminRole ? (
            <p className="permission-admin-note">
              <ShieldCheck size={16} />
              ადმინისტრატორს ყველა უფლება ავტომატურად აქვს — აქ ცვლილება არ
              მოქმედებს.
            </p>
          ) : null}

          <div className="permission-matrix">
            <div className="permission-row head">
              <span>სექცია</span>
              <span>უფლებები</span>
              <span>მენიუში</span>
            </div>
            {pages.map((page) => {
              const actions = page.actions ?? defaultActions;
              const pageOff = isFeatureDisabled(disabledFeatures, page.key);
              const canView =
                !pageOff &&
                (isAdminRole ||
                  selectedPermissions.includes(`${page.key}.view` as PermissionKey));
              return (
                <div
                  key={page.key}
                  className={`permission-row ${pageOff ? "platform-off" : ""}`}
                >
                  <strong>
                    {page.label}
                    {pageOff ? (
                      <small className="platform-off-note">
                        <Lock size={12} />
                        გამორთულია პლატფორმიდან
                      </small>
                    ) : null}
                  </strong>
                  <div className="permission-action-list">
                    {actions.map((action) => {
                      const permission =
                        `${page.key}.${action.key}` as PermissionKey;
                      const off = isFeatureDisabled(disabledFeatures, permission);
                      if (off) {
                        return (
                          <button
                            key={permission}
                            type="button"
                            className={`permission-toggle platform-off ${action.dependsOn ? "sub-permission" : ""}`}
                            aria-label={`${page.label} ${action.label}`}
                            disabled
                            title="გამორთულია პლატფორმიდან"
                          >
                            <Lock size={18} />
                            <span>{action.label}</span>
                          </button>
                        );
                      }
                      const enabled =
                        isAdminRole || selectedPermissions.includes(permission);
                      const parentPermission = action.dependsOn
                        ? (`${page.key}.${action.dependsOn}` as PermissionKey)
                        : null;
                      const parentEnabled = parentPermission
                        ? selectedPermissions.includes(parentPermission)
                        : true;
                      return (
                        <button
                          key={permission}
                          type="button"
                          className={`permission-toggle ${enabled ? "enabled" : ""} ${action.dependsOn ? "sub-permission" : ""}`}
                          onClick={() => togglePermission(permission)}
                          aria-label={`${page.label} ${action.label}`}
                          disabled={!canEdit || saving || !parentEnabled || isAdminRole}
                          title={!parentEnabled ? `საჭიროა "${actions.find(a => a.key === action.dependsOn)?.label}" ჩართვა` : undefined}
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
                  <span
                    className={`visibility-pill ${canView ? "visible" : "hidden"}`}
                  >
                    {pageOff ? (
                      <Lock size={15} />
                    ) : canView ? (
                      <Eye size={15} />
                    ) : (
                      <EyeOff size={15} />
                    )}
                    {pageOff ? "გამორთულია" : canView ? "ჩანს" : "დამალულია"}
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

function normalizeRoleName(value: string) {
  return value.trim().toLowerCase();
}
