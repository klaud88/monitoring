import { Activity, ShieldCheck, Wifi } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { AppCredit } from "@/components/layout/app-credit";
import { OneBitLogo } from "@/components/layout/onebit-logo";

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
          <OneBitLogo className="onebit-logo-login" />
          <h1 className="sr-only">თბილისის საბავშვო ბაგა-ბაღების მართვის სააგენტო</h1>
          <div className="login-intro">
            <span className="login-eyebrow">მოქნილი CRM პლატფორმა</span>
            <p>მართე შენი ბიზნესი სრული კონტროლით – ერთ პლატფორმაში</p>
          </div>
          <div className="login-badges">
            <span>
              <Wifi size={16} />
              Live status
            </span>
            <span>
              <ShieldCheck size={16} />
              Role based
            </span>
            <span>
              <Activity size={16} />
              RTPM
            </span>
          </div>
        </div>
        <LoginForm nextPath={resolvedSearchParams?.next} />
      </section>
      <AppCredit />
    </main>
  );
}
