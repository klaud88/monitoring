import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getRoles } from "@/lib/repositories";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { TwoFactorSettings } from "@/components/profile/two-factor-settings";

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const roles = await getRoles();
  const roleLabel =
    roles.find((role) => role.name === user?.role)?.label ?? user?.role;

  return (
    <>
      <section className="page-header">
        <div>
          <p className="eyebrow">პროფილი</p>
          <h1>{user?.name}</h1>
          <p>ანგარიშის მონაცემები და უსაფრთხოება.</p>
        </div>
      </section>

      <section className="content-grid two">
        <div className="surface">
          <h2>მომხმარებელი</h2>
          <dl className="details-list">
            <div>
              <dt>ელფოსტა</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>როლი</dt>
              <dd>{roleLabel}</dd>
            </div>
            <div>
              <dt>ინიციალები</dt>
              <dd>{user?.initials}</dd>
            </div>
          </dl>
        </div>
        <div className="surface">
          <h2>პაროლის შეცვლა</h2>
          <p className="muted">
            შეცვლის შემდეგ სესია დასრულდება და ხელახლა შეხვალთ ახალი პაროლით.
          </p>
          <ChangePasswordForm
            requireCurrent
            submitLabel="ცვლილების შენახვა"
            className="must-change-password-form"
          />
        </div>
      </section>

      <section className="content-grid">
        <div className="surface">
          <h2>ორფაქტორიანი ავტორიზაცია</h2>
          <TwoFactorSettings initialEnabled={Boolean(user?.twoFactorEnabled)} />
        </div>
      </section>
    </>
  );
}
