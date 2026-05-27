import { Activity, ShieldCheck, Wifi } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-label="ავტორიზაცია">
        <div className="login-copy">
          <div className="brand-mark large">
            <Activity size={28} strokeWidth={2.4} />
          </div>
          <h1>BioStar2 Ops</h1>
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
        <LoginForm />
      </section>
    </main>
  );
}
