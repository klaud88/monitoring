"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  Edit3,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Tags,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { MultiSelectDropdown } from "@/components/common/multi-select-dropdown";
import type { AppRole, ProblemCategory, SessionUser } from "@/lib/types";

type RoleOption = Pick<AppRole, "id" | "name" | "label">;
type CategoryUser = SessionUser & { assignable: boolean };
type Tab = "active" | "disabled" | "deleted";

type FormState = {
  id?: string;
  title: string;
  userIds: string[];
  roleIds: string[];
};

const emptyForm: FormState = { title: "", userIds: [], roleIds: [] };

const tabLabels: Record<Tab, string> = {
  active: "აქტიური",
  disabled: "გამორთული",
  deleted: "წაშლილი",
};

export function ProblemCategoriesManager({
  initialCategories,
  users,
  roles,
}: {
  initialCategories: ProblemCategory[];
  /** All active users; `assignable` = may be a task assignee. */
  users: CategoryUser[];
  roles: RoleOption[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [tab, setTab] = useState<Tab>("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { confirm, confirmationDialog } = useConfirmDialog();

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const assignableUsers = useMemo(() => users.filter((user) => user.assignable), [users]);
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const roleLabelByName = useMemo(
    () => new Map(roles.map((role) => [role.name, role.label || role.name])),
    [roles],
  );
  const usersByRole = useMemo(() => {
    const grouped = new Map<string, SessionUser[]>();
    for (const user of assignableUsers) {
      grouped.set(user.role, [...(grouped.get(user.role) ?? []), user]);
    }
    return grouped;
  }, [assignableUsers]);

  const userOptions = assignableUsers.map((user) => ({
    value: user.id,
    label: user.name,
    hint: roleLabelByName.get(user.role) ?? user.role,
  }));
  const roleOptions = roles.map((role) => {
    const members = usersByRole.get(role.name) ?? [];
    return {
      value: role.id,
      label: role.label || role.name,
      hint: members.length
        ? `${members.length} შემსრულებელი: ${members.map((member) => member.name).join(", ")}`
        : "შემსრულებელი არ ჰყავს",
    };
  });

  /* Same rule the server applies (getProblemCategories): linked users plus
     every assignable member of a linked role. */
  const previewUsers = useMemo(() => {
    const ids = new Set(form.userIds);
    for (const roleId of form.roleIds) {
      const role = roleById.get(roleId);
      for (const member of (role && usersByRole.get(role.name)) ?? []) {
        ids.add(member.id);
      }
    }
    return [...ids].map((id) => userById.get(id)).filter(Boolean) as SessionUser[];
  }, [form.roleIds, form.userIds, roleById, userById, usersByRole]);

  const counts: Record<Tab, number> = {
    active: categories.filter((item) => !item.deletedAt && item.isActive).length,
    disabled: categories.filter((item) => !item.deletedAt && !item.isActive).length,
    deleted: categories.filter((item) => item.deletedAt).length,
  };
  const visible = categories.filter((item) =>
    tab === "deleted"
      ? item.deletedAt
      : !item.deletedAt && item.isActive === (tab === "active"),
  );

  async function request(url: string, init: RequestInit) {
    setSaving(true);
    setError("");
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
    }).catch(() => null);
    setSaving(false);

    const payload = (await response?.json().catch(() => null)) as {
      category?: ProblemCategory;
      message?: string;
    } | null;
    if (!response?.ok || !payload?.category) {
      setError(payload?.message || "მოქმედება ვერ შესრულდა.");
      return null;
    }

    const saved = payload.category;
    setCategories((current) =>
      current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved],
    );
    return saved;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = JSON.stringify({
      title: form.title,
      userIds: form.userIds,
      roleIds: form.roleIds,
    });
    const saved = form.id
      ? await request(`/api/problem-categories/${encodeURIComponent(form.id)}`, {
          method: "PATCH",
          body,
        })
      : await request("/api/problem-categories", { method: "POST", body });

    if (saved) {
      setForm(emptyForm);
      setTab(saved.deletedAt ? "deleted" : saved.isActive ? "active" : "disabled");
    }
  }

  function startEdit(category: ProblemCategory) {
    setError("");
    setForm({
      id: category.id,
      title: category.title,
      userIds: category.userIds.filter((id) => userById.get(id)?.assignable),
      roleIds: category.roleIds.filter((id) => roleById.has(id)),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleActive(category: ProblemCategory) {
    await request(`/api/problem-categories/${encodeURIComponent(category.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !category.isActive }),
    });
  }

  async function remove(category: ProblemCategory) {
    const confirmed = await confirm({
      title: "კატეგორიის წაშლა",
      message: `„${category.title}“ გადავა წაშლილებში და ახალი პრობლემის ფორმაში აღარ გამოჩნდება. აღდგენა შესაძლებელია.`,
      confirmLabel: "წაშლა",
    });
    if (!confirmed) {
      return;
    }
    if (form.id === category.id) {
      setForm(emptyForm);
    }
    await request(`/api/problem-categories/${encodeURIComponent(category.id)}`, {
      method: "DELETE",
    });
  }

  async function restore(category: ProblemCategory) {
    const saved = await request(
      `/api/problem-categories/${encodeURIComponent(category.id)}`,
      { method: "PATCH", body: JSON.stringify({ restore: true }) },
    );
    if (saved) {
      setTab(saved.isActive ? "active" : "disabled");
    }
  }

  return (
    <div className="pcat-page">
      {confirmationDialog}

      <section className="page-header">
        <div>
          <p className="eyebrow">ადმინისტრირება</p>
          <h1>პრობლემის კატეგორიები</h1>
          <p>
            ბაღი პრობლემის დაფიქსირებისას ირჩევს კატეგორიას, დავალება კი
            ავტომატურად ეწერება აქ მიბმულ ადამიანებს.
          </p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <Layers size={18} />
            <span>{counts.active}</span>
            <small>აქტიური</small>
          </div>
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      <form className="surface pcat-form" onSubmit={submit}>
        <div className="section-title">
          <h2>{form.id ? "კავშირის რედაქტირება" : "ახალი კავშირი"}</h2>
          {form.id ? <Edit3 size={20} /> : <Plus size={20} />}
        </div>

        <div className="pcat-form-grid">
          <label className="pcat-field">
            <span>სათაური (კატეგორია)</span>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="მაგ. კამერები"
              maxLength={160}
              required
            />
          </label>

          <MultiSelectDropdown
            label="მომხმარებლები"
            options={userOptions}
            selected={form.userIds}
            onChange={(userIds) => setForm({ ...form, userIds })}
            placeholder="აირჩიეთ მომხმარებლები"
            searchPlaceholder="მოძებნეთ სახელით ან როლით…"
          />

          <MultiSelectDropdown
            label="ჯგუფები (როლები)"
            options={roleOptions}
            selected={form.roleIds}
            onChange={(roleIds) => setForm({ ...form, roleIds })}
            placeholder="აირჩიეთ როლები"
            searchPlaceholder="მოძებნეთ როლი…"
          />
        </div>

        <div className={`pcat-preview${previewUsers.length ? "" : " empty"}`}>
          {previewUsers.length ? (
            <>
              <Users size={15} />
              <span>
                ავტომატურად მიიღებს <b>{previewUsers.length}</b> ადამიანი:
              </span>
              <span className="pcat-preview-names">
                {previewUsers.map((user) => (
                  <span key={user.id} className="pcat-person">
                    <i style={{ backgroundColor: user.color }}>{user.initials}</i>
                    {user.name}
                  </span>
                ))}
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={15} />
              <span>
                შემსრულებელი არ არის არჩეული. ამ კატეგორიის პრობლემა
                ავტომატურად არავის მიეწერება.
              </span>
            </>
          )}
        </div>

        <p className="pcat-note">
          სიაში მხოლოდ ის მომხმარებლები ჩანს, ვისაც წვდომის უფლებებში ჩართული
          აქვს „შემსრულებლებში დამატება“. როლის მიბმისას დავალებას მიიღებს
          როლის ყველა მიმდინარე და მომავალი წევრი.
        </p>

        <div className="pcat-form-actions">
          {form.id ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => setForm(emptyForm)}
              disabled={saving}
            >
              <X size={16} />
              <span>გაუქმება</span>
            </button>
          ) : null}
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={16} />
            <span>{form.id ? "ცვლილების შენახვა" : "კავშირის დამატება"}</span>
          </button>
        </div>
      </form>

      <section className="surface pcat-list" aria-label="კავშირების ჩამონათვალი">
        <div className="pcat-tabs" role="tablist">
          {(Object.keys(tabLabels) as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`pcat-tab${tab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
            >
              {tabLabels[key]}
              <span>{counts[key]}</span>
            </button>
          ))}
        </div>

        {visible.length ? (
          <ul className="pcat-rows">
            {visible.map((category) => (
              <li
                key={category.id}
                className={`pcat-row${form.id === category.id ? " editing" : ""}`}
              >
                <div className="pcat-row-main">
                  <strong className="pcat-row-title">{category.title}</strong>
                </div>

                <div className="pcat-row-links">
                  <div className="pcat-row-group">
                    <span className="pcat-row-label">
                      <UserRound size={13} />
                      მომხმარებლები:
                    </span>
                    {category.userIds.length ? (
                      category.userIds.map((id) => {
                        const user = userById.get(id);
                        if (!user) {
                          return (
                            <span key={id} className="pcat-chip user inactive">
                              წაშლილი მომხმარებელი
                            </span>
                          );
                        }
                        return (
                          <span
                            key={id}
                            className={`pcat-chip user${user.assignable ? "" : " inactive"}`}
                            style={{ "--user-color": user.color } as CSSProperties}
                            title={
                              user.assignable
                                ? roleLabelByName.get(user.role) ?? user.role
                                : "შემსრულებლის უფლება მოხსნილია — დავალებას ვერ მიიღებს"
                            }
                          >
                            <i>{user.initials}</i>
                            {user.name}
                          </span>
                        );
                      })
                    ) : (
                      <span className="pcat-row-none">—</span>
                    )}
                  </div>
                  <div className="pcat-row-group">
                    <span className="pcat-row-label">
                      <Tags size={13} />
                      ჯგუფები:
                    </span>
                    {category.roleIds.length ? (
                      category.roleIds.map((id) => {
                        const role = roleById.get(id);
                        if (!role) {
                          return null;
                        }
                        const members = usersByRole.get(role.name) ?? [];
                        return (
                          <span
                            key={id}
                            className="pcat-chip role"
                            title={
                              members.length
                                ? members.map((member) => member.name).join(", ")
                                : "ამ როლში შემსრულებელი არ არის"
                            }
                          >
                            {role.label || role.name}
                            <b>{members.length}</b>
                          </span>
                        );
                      })
                    ) : (
                      <span className="pcat-row-none">—</span>
                    )}
                  </div>
                </div>

                <span
                  className={`pcat-count${category.resolvedUserIds.length ? "" : " warn"}`}
                  title={category.resolvedUserIds
                    .map((id) => userById.get(id)?.name)
                    .filter(Boolean)
                    .join(", ")}
                >
                  {category.resolvedUserIds.length ? (
                    <>
                      <Users size={13} />
                      {category.resolvedUserIds.length} შემსრულებელი
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={13} />
                      შემსრულებელი არ ჰყავს
                    </>
                  )}
                </span>

                <div className="pcat-row-actions">
                  {category.deletedAt ? (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => restore(category)}
                      disabled={saving}
                    >
                      <RotateCcw size={15} />
                      <span>აღდგენა</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={category.isActive}
                        aria-label={category.isActive ? "გამორთვა" : "ჩართვა"}
                        title={category.isActive ? "გამორთვა" : "ჩართვა"}
                        className={`info-switch${category.isActive ? " on" : ""}`}
                        onClick={() => toggleActive(category)}
                        disabled={saving}
                      >
                        <span className="info-switch-track" aria-hidden="true">
                          <span className="info-switch-thumb" />
                        </span>
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="რედაქტირება"
                        title="რედაქტირება"
                        onClick={() => startEdit(category)}
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        className="icon-button danger"
                        type="button"
                        aria-label="წაშლა"
                        title="წაშლა"
                        onClick={() => remove(category)}
                        disabled={saving}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pcat-empty">
            {tab === "active"
              ? "აქტიური კატეგორია არ არის."
              : tab === "disabled"
                ? "გამორთული კატეგორია არ არის."
                : "წაშლილი კატეგორია არ არის."}
          </p>
        )}
      </section>
    </div>
  );
}
