import { notFound } from "next/navigation";
import { FeaturesManager } from "@/components/platform/features-manager";
import {
  findPortalTenant,
  getTenantFeatures,
  getTenantOverview,
} from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function PlatformTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = findPortalTenant(slug);
  if (!tenant) {
    notFound();
  }

  const [state, overview] = await Promise.all([
    getTenantFeatures(tenant),
    getTenantOverview(tenant),
  ]);

  return (
    <div>
      <section className="page-header">
        <div>
          <p className="eyebrow">ორგანიზაცია</p>
          <h1>{tenant.slug}</h1>
          <p>
            ორგანიზაციის ადმინი როლებს მხოლოდ აქ ჩართულ ფუნქციებს ანაწილებს.
            გამორთულს ვერავინ გამოიყენებს და ვერც ჩართავს, ადმინისტრატორიც.
            ცვლილება 30 წამში ვრცელდება.
          </p>
        </div>
      </section>

      {state.ok ? (
        <FeaturesManager
          slug={tenant.slug}
          initialDisabled={state.disabled}
          users={overview.ok ? overview.users : null}
          usersError={overview.ok ? undefined : overview.message}
        />
      ) : (
        <p className="form-error page-error">{state.message}</p>
      )}
    </div>
  );
}
