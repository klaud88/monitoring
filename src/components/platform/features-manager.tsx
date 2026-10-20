"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { featurePages, isFeatureDisabled } from "@/lib/feature-flags";
import type { UserOverview } from "@/lib/overview";
import { TenantSummary } from "./tenant-summary";

export function FeaturesManager({
  slug,
  initialDisabled,
  users,
  usersError,
}: {
  slug: string;
  initialDisabled: string[];
  users: UserOverview | null;
  usersError?: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialDisabled);
  const [disabled, setDisabled] = useState(() => new Set(initialDisabled));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const dirty = useMemo(() => {
    const before = new Set(saved);
    return (
      before.size !== disabled.size ||
      [...disabled].some((key) => !before.has(key))
    );
  }, [saved, disabled]);

  function toggle(key: string) {
    setNotice("");
    setDisabled((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch(
      `/platform/api/tenants/${encodeURIComponent(slug)}/features`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: [...disabled] }),
      },
    ).catch(() => null);
    setSaving(false);

    const payload = (await response?.json().catch(() => null)) as {
      disabled?: string[];
      message?: string;
    } | null;
    if (!response?.ok || !payload?.disabled) {
      if (response?.status === 401) {
        router.replace("/platform/login");
        return;
      }
      setError(payload?.message || "შენახვა ვერ მოხერხდა.");
      return;
    }

    setSaved(payload.disabled);
    setDisabled(new Set(payload.disabled));
    setNotice("შენახულია.");
  }

  return (
    <>
      <TenantSummary users={users} usersError={usersError} disabled={saved} />
      <section className="surface">
        <div className="section-title">
          <h2>გვერდები და ფუნქციები</h2>
          <button
            className="primary-button"
            type="button"
            onClick={save}
            disabled={!dirty || saving}
          >
            <Save size={16} />
            <span>{saving ? "ინახება..." : "შენახვა"}</span>
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="form-notice">{notice}</p> : null}

        <div className="permission-matrix">
          <div className="permission-row head">
            <span>გვერდი</span>
            <span>ფუნქციები</span>
            <span>მდგომარეობა</span>
          </div>
          {featurePages.map((page) => {
            const pageOn = !disabled.has(page.key);
            const pageVisible = pageOn && !disabled.has(`${page.key}.view`);
            return (
              <div key={page.key} className="permission-row">
                <button
                  type="button"
                  className={`permission-toggle platform-page-toggle ${pageOn ? "enabled" : ""}`}
                  onClick={() => toggle(page.key)}
                  disabled={page.locked || saving}
                  title={
                    page.locked
                      ? "ყოველთვის ჩართულია, რომ ადმინი არ ჩაიკეტოს"
                      : undefined
                  }
                >
                  {page.locked ? (
                    <Lock size={18} />
                  ) : pageOn ? (
                    <ToggleRight size={28} />
                  ) : (
                    <ToggleLeft size={28} />
                  )}
                  <span>{page.label}</span>
                </button>
                <div className="permission-action-list">
                  {page.actions.length === 0 ? (
                    <span className="platform-muted">მთლიანი გვერდი</span>
                  ) : null}
                  {page.actions.map((action) => {
                    const key = `${page.key}.${action.key}`;
                    // Off because of its page, the page's "view", or the
                    // function it depends on, not its own switch.
                    const parentOn = !isFeatureDisabled(
                      [...disabled].filter((item) => item !== key),
                      key,
                    );
                    const on = parentOn && !disabled.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`permission-toggle ${on ? "enabled" : ""} ${action.dependsOn ? "sub-permission" : ""}`}
                        onClick={() => toggle(key)}
                        disabled={page.locked || saving || !pageOn || !parentOn}
                        aria-label={`${page.label} ${action.label}`}
                      >
                        {on ? (
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
                  className={`visibility-pill ${pageVisible ? "visible" : "hidden"}`}
                >
                  {pageVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                  {pageVisible ? "ჩართულია" : "გამორთულია"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
