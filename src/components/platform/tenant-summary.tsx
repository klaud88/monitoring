import { Lock } from "lucide-react";
import { summarizeFeatures } from "@/lib/feature-flags";
import type { UserOverview } from "@/lib/overview";

const dateFormat = new Intl.DateTimeFormat("ka-GE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tbilisi",
});

/** Users and enabled pages of one organisation, above its feature switches. */
export function TenantSummary({
  users,
  usersError,
  disabled,
}: {
  users: UserOverview | null;
  usersError?: string;
  /** The saved disabled set, so the counts follow each save. */
  disabled: string[];
}) {
  const features = summarizeFeatures(disabled);

  return (
    <div className="platform-summary">
      <section className="surface">
        <div className="section-title">
          <h2>მომხმარებლები</h2>
        </div>
        {users ? (
          <>
            <div className="kpi-strip platform-kpis">
              <Kpi label="აქტიური" value={users.active} />
              <Kpi label="ბოლო 7 დღეში შესული" value={users.activeLast7Days} />
              <Kpi label="ბაღის ანგარიში" value={users.gardens} />
              <Kpi label="პაროლი არ შეუცვლია" value={users.mustChangePassword} />
              <Kpi label="2FA ჩართული" value={users.twoFactor} />
              <Kpi label="გამორთული" value={users.inactive} />
            </div>
            <div className="chip-cloud">
              {users.byRole.map((role) => (
                <span key={role.role} className="chip">
                  {role.label}: {role.count}
                </span>
              ))}
            </div>
            <p className="platform-muted">
              ბოლო შესვლა:{" "}
              {users.lastLoginAt
                ? dateFormat.format(new Date(users.lastLoginAt))
                : "ჯერ არავინ შესულა"}
            </p>
          </>
        ) : (
          <p className="form-error">{usersError || "მონაცემები ვერ ჩაიტვირთა."}</p>
        )}
      </section>

      <section className="surface">
        <div className="section-title">
          <h2>ჩართული გვერდები</h2>
        </div>
        <div className="kpi-strip platform-kpis">
          <Kpi label="გვერდი" value={features.pagesOn} total={features.pagesTotal} />
          <Kpi label="ფუნქცია" value={features.actionsOn} total={features.actionsTotal} />
        </div>
        <div className="chip-cloud">
          {features.enabledPages.map((label) => (
            <span key={label} className="chip">
              {label}
            </span>
          ))}
          {features.pagesOn < features.pagesTotal ? (
            <span className="chip platform-chip-off">
              <Lock size={12} />
              გამორთულია {features.pagesTotal - features.pagesOn}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="kpi-cell">
      <span>{label}</span>
      <div className="kpi-value">
        <strong>{value}</strong>
        {total !== undefined ? <small>/ {total}</small> : null}
      </div>
    </div>
  );
}
