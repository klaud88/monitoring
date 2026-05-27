"use client";

import { useMemo, useState } from "react";
import { Mail, Plus, Search, ShieldCheck, UserRound, Users } from "lucide-react";
import { recordAudit } from "@/lib/client-audit";
import type { AppUser, PermissionKey } from "@/lib/types";

const roleLabels: Record<string, string> = {
  admin: "ადმინისტრატორი",
  dispatcher: "დისპეტჩერი",
  technician: "ტექნიკოსი",
  viewer: "მხოლოდ ნახვა"
};

const rolePermissions: Record<string, PermissionKey[]> = {
  admin: [
    "dashboard.view",
    "dashboard.create",
    "dashboard.edit",
    "dashboard.delete",
    "tasks.view",
    "tasks.create",
    "tasks.edit",
    "tasks.delete",
    "regions.view",
    "regions.create",
    "regions.edit",
    "regions.delete",
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
    "analytics.delete"
  ],
  dispatcher: ["dashboard.view", "tasks.view", "tasks.create", "tasks.edit", "regions.view", "analytics.view"],
  technician: ["dashboard.view", "tasks.view", "tasks.edit", "regions.view", "analytics.view"],
  viewer: ["dashboard.view", "tasks.view", "analytics.view"]
};

export function UsersManager({ initialUsers }: { initialUsers: AppUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    role: "technician",
    initials: "",
    color: "#2563eb"
  });

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter(
      (user) =>
        !normalized ||
        user.name.toLowerCase().includes(normalized) ||
        user.email.toLowerCase().includes(normalized) ||
        user.role.toLowerCase().includes(normalized)
    );
  }, [query, users]);

  function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const initials = draft.initials.trim() || buildInitials(draft.name);
    const user: AppUser = {
      id: `u-local-${Date.now()}`,
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      role: draft.role,
      initials,
      color: draft.color,
      permissions: rolePermissions[draft.role] ?? rolePermissions.viewer
    };

    if (!user.name || !user.email) {
      return;
    }

    setUsers((current) => [user, ...current]);
    setDraft({ name: "", email: "", role: "technician", initials: "", color: "#2563eb" });
    recordAudit("user.create", "user", user.id, { email: user.email, role: user.role });
  }

  return (
    <div className="users-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">ადმინისტრირება</p>
          <h1>მომხმარებლები</h1>
          <p>მომხმარებლების დამატება, როლების არჩევა და მინიჭებული საბაზისო უფლებების ნახვა.</p>
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

      <section className="content-grid user-admin-grid">
        <form className="surface admin-form" onSubmit={createUser}>
          <div className="section-title">
            <h2>ახალი მომხმარებელი</h2>
            <Plus size={20} />
          </div>
          <label>
            <span>სახელი და გვარი</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>ელფოსტა</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </label>
          <div className="form-row">
            <label>
              <span>როლი</span>
              <select
                value={draft.role}
                onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
              >
                {Object.entries(roleLabels).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>ინიციალები</span>
              <input
                value={draft.initials}
                maxLength={3}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, initials: event.target.value.toUpperCase() }))
                }
              />
            </label>
          </div>
          <label>
            <span>ფერი</span>
            <input
              type="color"
              value={draft.color}
              onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
            />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            <span>მომხმარებლის დამატება</span>
          </button>
        </form>

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
            {filteredUsers.map((user) => (
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
                  {roleLabels[user.role] ?? user.role}
                </span>
                <span className="count-pill">{user.permissions.length} უფლება</span>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
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
