"use client";

import { useMemo, useState } from "react";
import {
  Edit3,
  Mail,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import type { AppRole, SessionUser } from "@/lib/types";

const fallbackRoleOptions: AppRole[] = [
  { id: "role-admin", name: "admin", label: "ადმინისტრატორი", permissions: [] },
  { id: "role-dispatcher", name: "dispatcher", label: "დისპეტჩერი", permissions: [] },
  { id: "role-technician", name: "technician", label: "ტექნიკოსი", permissions: [] },
  { id: "role-viewer", name: "viewer", label: "მხოლოდ ნახვა", permissions: [] },
  { id: "role-garden", name: "garden", label: "ბაღი", permissions: [] },
];

const legacyRoleLabels: Record<string, string> = {
  admin: "ადმინისტრატორი",
  dispatcher: "დისპეტჩერი",
  technician: "ტექნიკოსი",
  viewer: "მხოლოდ ნახვა",
  garden: "ბაღი",
};

type UserPermissions = {
  create: boolean;
  edit: boolean;
  delete: boolean;
};

type UserDraft = {
  name: string;
  email: string;
  role: string;
  initials: string;
  color: string;
  password: string;
};

function buildEmptyDraft(role: string): UserDraft {
  return {
    name: "",
    email: "",
    role,
    initials: "",
    color: "#2563eb",
    password: "",
  };
}

export function UsersManager({
  initialUsers,
  roles,
  permissions,
}: {
  initialUsers: SessionUser[];
  roles: AppRole[];
  permissions: UserPermissions;
}) {
  const roleOptions = roles.length ? roles : fallbackRoleOptions;
  const defaultRole =
    roleOptions.find((role) => role.name === "technician")?.name ??
    roleOptions[0]?.name ??
    "technician";
  const emptyDraft = useMemo(() => buildEmptyDraft(defaultRole), [defaultRole]);
  const roleLabels = useMemo(() => {
    const labels = new Map<string, string>();
    roleOptions.forEach((role) => labels.set(role.name, role.label));
    Object.entries(legacyRoleLabels).forEach(([name, label]) => {
      if (!labels.has(name)) {
        labels.set(name, label);
      }
    });
    return labels;
  }, [roleOptions]);
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<UserDraft>(() => buildEmptyDraft(defaultRole));
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<UserDraft>(() => buildEmptyDraft(defaultRole));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter(
      (user) =>
        !normalized ||
        user.name.toLowerCase().includes(normalized) ||
        user.email.toLowerCase().includes(normalized) ||
        user.role.toLowerCase().includes(normalized),
    );
  }, [query, users]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.create) {
      return;
    }

    const payload = normalizeDraft(draft);
    if (!payload.name || !payload.email || !payload.password) {
      setError("სახელი, ელფოსტა და პაროლი აუცილებელია.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!response.ok) {
      setError("მომხმარებლის დამატება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { user: SessionUser };
    setUsers((current) => [data.user, ...current]);
    setDraft(emptyDraft);
  }

  function startEdit(user: SessionUser) {
    setEditingUserId(user.id);
    setEditDraft({
      name: user.name,
      email: user.email,
      role: user.role,
      initials: user.initials,
      color: user.color,
      password: "",
    });
    setError("");
  }

  async function saveEdit(userId: string) {
    if (!permissions.edit) {
      return;
    }

    const payload = normalizeDraft(editDraft);
    if (!payload.name || !payload.email) {
      setError("სახელი და ელფოსტა აუცილებელია.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!response.ok) {
      setError("მომხმარებლის რედაქტირება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { user: SessionUser };
    setUsers((current) =>
      current.map((user) => (user.id === userId ? data.user : user)),
    );
    setEditingUserId(null);
  }

  async function removeUser(userId: string) {
    if (!permissions.delete) {
      return;
    }

    const confirmed = await confirm();
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/users/${userId}`, {
      method: "DELETE",
    });
    setSaving(false);

    if (!response.ok) {
      setError("მომხმარებლის წაშლა ვერ მოხერხდა.");
      return;
    }

    setUsers((current) => current.filter((user) => user.id !== userId));
  }

  return (
    <div className="users-page">
      {confirmationDialog}
      <section className="page-header">
        <div>
          <p className="eyebrow">ადმინისტრირება</p>
          <h1>მომხმარებლები</h1>
          <p>მომხმარებლების დამატება, რედაქტირება, წაშლა და როლების მინიჭება.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <Users size={18} />
            <span>{users.length}</span>
            <small>მომხმარებელი</small>
          </div>
          <div className="metric">
            <ShieldCheck size={18} />
            <span>{users.filter((user) => user.role === "admin").length}</span>
            <small>ადმინი</small>
          </div>
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      <section className="content-grid user-admin-grid">
        {permissions.create ? (
          <form className="surface admin-form user-create-form" onSubmit={createUser}>
            <div className="section-title">
              <h2>ახალი მომხმარებელი</h2>
              <Plus size={20} />
            </div>
            <label>
              <span>სახელი და გვარი</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </label>
            <label>
              <span>ელფოსტა</span>
              <input
                type="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </label>
            <div className="form-row">
              <label>
                <span>როლი</span>
                <RoleSelect
                  value={draft.role}
                  onChange={(role) =>
                    setDraft((current) => ({ ...current, role }))
                  }
                  roles={roleOptions}
                />
              </label>
              <label>
                <span>ინიციალები</span>
                <input
                  value={draft.initials}
                  maxLength={3}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      initials: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>ფერი</span>
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, color: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>პაროლი</span>
                <input
                  type="password"
                  value={draft.password}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>
            <button className="primary-button" type="submit" disabled={saving}>
              <Plus size={18} />
              <span>მომხმარებლის დამატება</span>
            </button>
          </form>
        ) : null}

        <section className="surface user-admin-list">
          <div className="table-toolbar">
            <div className="search-field">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ძებნა სახელით, ელფოსტით ან როლით"
              />
            </div>
          </div>

          <div className="user-table">
            {filteredUsers.map((user) =>
              editingUserId === user.id ? (
                <article key={user.id} className="user-row editing">
                  <span className="avatar" style={{ backgroundColor: editDraft.color }}>
                    {editDraft.initials || buildInitials(editDraft.name)}
                  </span>
                  <div className="edit-grid">
                    <input
                      value={editDraft.name}
                      onChange={(event) =>
                        setEditDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                    <input
                      type="email"
                      value={editDraft.email}
                      onChange={(event) =>
                        setEditDraft((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                    <RoleSelect
                      value={editDraft.role}
                      onChange={(role) =>
                        setEditDraft((current) => ({ ...current, role }))
                      }
                      roles={roleOptions}
                    />
                    <input
                      value={editDraft.initials}
                      maxLength={3}
                      onChange={(event) =>
                        setEditDraft((current) => ({
                          ...current,
                          initials: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                    <input
                      type="color"
                      value={editDraft.color}
                      onChange={(event) =>
                        setEditDraft((current) => ({
                          ...current,
                          color: event.target.value,
                        }))
                      }
                    />
                    <input
                      type="password"
                      value={editDraft.password}
                      placeholder="ახალი პაროლი სურვილისამებრ"
                      onChange={(event) =>
                        setEditDraft((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="row-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => saveEdit(user.id)}
                      disabled={saving}
                    >
                      <Save size={16} />
                      <span>შენახვა</span>
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setEditingUserId(null)}
                    >
                      <X size={16} />
                      <span>გაუქმება</span>
                    </button>
                  </div>
                </article>
              ) : (
                <article key={user.id} className="user-row">
                  <span className="avatar" style={{ backgroundColor: user.color }}>
                    {user.initials}
                  </span>
                  <div>
                    <strong>{user.name}</strong>
                    <span>
                      <Mail size={14} />
                      {user.email}
                    </span>
                  </div>
                  <span className="role-pill">
                    <UserRound size={14} />
                    {roleLabels.get(user.role) ?? user.role}
                  </span>
                  <span className="count-pill">{user.permissions.length} უფლება</span>
                  <div className="row-actions">
                    {permissions.edit ? (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="რედაქტირება"
                        title="რედაქტირება"
                        onClick={() => startEdit(user)}
                      >
                        <Edit3 size={17} />
                      </button>
                    ) : null}
                    {permissions.delete ? (
                      <button
                        className="icon-button danger"
                        type="button"
                        aria-label="წაშლა"
                        title="წაშლა"
                        onClick={() => removeUser(user.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    ) : null}
                  </div>
                </article>
              ),
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
  roles,
}: {
  value: string;
  onChange: (role: string) => void;
  roles: AppRole[];
}) {
  const hasCurrentValue = roles.some((role) => role.name === value);

  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {!hasCurrentValue && value ? (
        <option value={value}>{value}</option>
      ) : null}
      {roles.map((role) => (
        <option key={role.id} value={role.name}>
          {role.label}
        </option>
      ))}
    </select>
  );
}

function normalizeDraft(draft: UserDraft) {
  return {
    name: draft.name.trim(),
    email: draft.email.trim().toLowerCase(),
    role: draft.role,
    initials: (draft.initials.trim() || buildInitials(draft.name)).toUpperCase(),
    color: draft.color,
    password: draft.password,
  };
}

function buildInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
