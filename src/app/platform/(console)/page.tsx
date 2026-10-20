import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { summarizeFeatures } from "@/lib/feature-flags";
import { getTenantFeatures, getTenantOverview } from "@/lib/platform";
import { getPortalTenants } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default async function PlatformHomePage() {
  const tenants = getPortalTenants();
  const [states, overviews] = await Promise.all([
    Promise.all(tenants.map((tenant) => getTenantFeatures(tenant))),
    Promise.all(tenants.map((tenant) => getTenantOverview(tenant))),
  ]);

  return (
    <div>
      <section className="page-header">
        <div>
          <p className="eyebrow">პლატფორმა</p>
          <h1>ორგანიზაციები</h1>
          <p>აირჩიე ორგანიზაცია, რომ მისი გვერდები და ფუნქციები ჩართო ან გამორთო.</p>
        </div>
      </section>

      <div className="platform-tenant-list">
        {tenants.length === 0 ? (
          <p className="form-error">PORTAL_TENANTS ცარიელია — ორგანიზაცია ვერ მოიძებნა.</p>
        ) : null}
        {tenants.map((tenant, index) => {
          const state = states[index];
          const overview = overviews[index];
          const features = state.ok ? summarizeFeatures(state.disabled) : null;
          return (
            <Link key={tenant.slug} href={`/platform/${tenant.slug}`} className="platform-tenant-row">
              <Building2 size={20} />
              <span className="platform-tenant-name">
                <strong>{tenant.slug}</strong>
                {overview.ok && features ? (
                  <small className="platform-muted">
                    {overview.users.active} მომხმარებელი · {features.pagesOn}/
                    {features.pagesTotal} გვერდი · {features.actionsOn}/
                    {features.actionsTotal} ფუნქცია
                  </small>
                ) : null}
              </span>
              <span className={`visibility-pill ${state.ok ? "visible" : "hidden"}`}>
                {features
                  ? features.pagesOn === features.pagesTotal &&
                    features.actionsOn === features.actionsTotal
                    ? "ყველაფერი ჩართულია"
                    : "ნაწილი გამორთულია"
                  : state.ok
                    ? ""
                    : state.message}
              </span>
              <ChevronRight size={18} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
