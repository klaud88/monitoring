import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <p className="eyebrow">პროფილი</p>
          <h1>{user?.name}</h1>
          <p>მიმდინარე სესია და მინიჭებული უფლებები.</p>
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
              <dd>{user?.role}</dd>
            </div>
            <div>
              <dt>ინიციალები</dt>
              <dd>{user?.initials}</dd>
            </div>
          </dl>
        </div>
        <div className="surface">
          <h2>უფლებები</h2>
          <div className="chip-cloud">
            {user?.permissions.map((permission) => (
              <span key={permission} className="chip">
                {permission}
              </span>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
