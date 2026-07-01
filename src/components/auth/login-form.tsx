"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, Mail } from "lucide-react";
import { canAccessPath, getFirstAllowedPath } from "@/lib/navigation";
import type { SessionUser } from "@/lib/types";
import { SystemLoader } from "@/components/common/system-loader";

type LoginFormProps = {
  nextPath?: string;
};

function getSafeNextPath(nextPath?: string) {
  if (
    !nextPath ||
    !nextPath.startsWith("/") ||
    nextPath.startsWith("//") ||
    nextPath.startsWith("/login") ||
    nextPath === "/"
  ) {
    return "/dashboard";
  }

  return nextPath;
}

const LOGIN_PHASES = [
  { until: 40, text: "სერვერთან დაკავშირება" },
  { until: 70, text: "ავტორიზაცია..." },
  { until: 100, text: "მონაცემების ჩატვირთვა" },
];

function getLoginMessage(p: number) {
  return LOGIN_PHASES.find((ph) => p < ph.until)?.text ?? "მონაცემების ჩატვირთვა";
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("admin@local.ge");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginProgress, setLoginProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const redirectTo = getSafeNextPath(nextPath);

  useEffect(() => {
    if (!loading) {
      setLoginProgress(0);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      return;
    }

    let start: number | null = null;
    const duration = 2000;

    function step(ts: number) {
      if (!start) start = ts;
      const p = Math.min(((ts - start) / duration) * 85, 85);
      setLoginProgress(p);
      if (p < 85) raf.current = requestAnimationFrame(step);
    }

    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
  }, [loading]);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: identifier, password })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setLoading(false);
      setError(payload?.message || "შესვლა ვერ მოხერხდა.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as {
      user?: SessionUser;
    } | null;
    const target = canAccessPath(payload?.user, redirectTo)
      ? redirectTo
      : getFirstAllowedPath(payload?.user);
    router.replace(target);
    router.refresh();
  }

  return (
    <>
      {loading ? (
        <div style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1220",
          zIndex: 9999,
        }}>
          <SystemLoader progress={loginProgress} message={getLoginMessage(loginProgress)} />
        </div>
      ) : null}

      <form className="login-form" onSubmit={submit}>
        <label>
          <span>ელფოსტა ან X-Station</span>
          <div className="field-with-icon">
            <Mail size={18} />
            <input
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
            />
          </div>
        </label>

        <label>
          <span>პაროლი</span>
          <div className="field-with-icon">
            <KeyRound size={18} />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary-button" type="submit" disabled={loading}>
          <LogIn size={18} />
          <span>შესვლა</span>
        </button>
      </form>
    </>
  );
}
