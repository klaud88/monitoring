import { ShieldCheck, Wifi } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { AgencyLogo } from "@/components/layout/agency-logo";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <main className="login-page">
      <section className="login-panel" aria-label="ავტორიზაცია">
        <div className="login-copy">
          <AgencyLogo className="agency-logo agency-logo-login" />
          <h1 className="sr-only">თბილისის საბავშვო ბაგა-ბაღების მართვის სააგენტო</h1>
          <p>დავაისების სტატუსები, ტასკები, უფლებები და audit log ერთ სამუშაო სივრცეში.</p>
          <div className="login-badges">
            <span>
              <Wifi size={16} />
              Live status
            </span>
            <span>
              <ShieldCheck size={16} />
              Role based
            </span>
          </div>
        </div>
        <LoginForm nextPath={resolvedSearchParams?.next} />
      </section>
    </main>
  );
}
