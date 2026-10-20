import { notFound } from "next/navigation";
import { OneBitLogo } from "@/components/layout/onebit-logo";
import { PlatformLoginForm } from "@/components/platform/platform-login-form";
import { isPlatformConfigured } from "@/lib/platform-session";

// Reads portal env at request time; a build has no PORTAL_MODE.
export const dynamic = "force-dynamic";

export default function PlatformLoginPage() {
  if (process.env.PORTAL_MODE !== "1" || !isPlatformConfigured()) {
    notFound();
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-label="პლატფორმის ადმინი">
        <div className="login-copy">
          <OneBitLogo className="onebit-logo-login" />
          <div className="login-intro">
            <span className="login-eyebrow">პლატფორმის ადმინი</span>
            <p>ორგანიზაციების ფუნქციების მართვა</p>
          </div>
        </div>
        <PlatformLoginForm />
      </section>
    </main>
  );
}
