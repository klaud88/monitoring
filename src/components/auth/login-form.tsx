"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, LogIn, Mail, ShieldCheck } from "lucide-react";
import { canAccessPath, getFirstAllowedPath } from "@/lib/navigation";
import type { SessionUser } from "@/lib/types";
import { SystemLoader } from "@/components/common/system-loader";

type LoginFormProps = {
  nextPath?: string;
  passwordChanged?: boolean;
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
  return (
    LOGIN_PHASES.find((ph) => p < ph.until)?.text ?? "მონაცემების ჩატვირთვა"
  );
}

export function LoginForm({ nextPath, passwordChanged }: LoginFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  // "credentials" is email/password; a 2FA account moves to "code" once the
  // password checks out, and only then is a real session issued.
  const [stage, setStage] = useState<"credentials" | "code">("credentials");
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
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
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [loading]);

  function goToDestination(user?: SessionUser) {
    const target = canAccessPath(user, redirectTo)
      ? redirectTo
      : getFirstAllowedPath(user);
    // Full page load: behind the portal the next request is served by the
    // organisation's own process, not the one that rendered this form.
    window.location.assign(target);
  }

  async function submitCredentials(
    event: React.SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: identifier, password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setLoading(false);
      setError(payload?.message || "შესვლა ვერ მოხერხდა.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as {
      user?: SessionUser;
      twoFactorRequired?: boolean;
    } | null;

    if (payload?.twoFactorRequired) {
      setLoading(false);
      setStage("code");
      return;
    }

    goToDestination(payload?.user);
  }

  async function submitCode(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setLoading(false);
      setError(payload?.message || "კოდი არასწორია.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as {
      user?: SessionUser;
    } | null;

    goToDestination(payload?.user);
  }

  return (
    <>
      {loading ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b1220",
            zIndex: 9999,
          }}
        >
          <SystemLoader
            progress={loginProgress}
            message={getLoginMessage(loginProgress)}
          />
        </div>
      ) : null}

      {stage === "credentials" ? (
        <form className="login-form" onSubmit={submitCredentials}>
          {passwordChanged && !error ? (
            <p className="form-notice">პაროლი შეიცვალა. შედით ახალი პაროლით.</p>
          ) : null}

          <label>
            <span>ელფოსტა</span>
            <div className="field-with-icon">
              <Mail size={18} />
              <input
                type="email"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="name@example.ge"
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
      ) : (
        <form className="login-form" onSubmit={submitCode}>
          <label>
            <span>
              {useBackupCode ? "სარეზერვო კოდი" : "ავტორიზაციის კოდი"}
            </span>
            <div className="field-with-icon">
              <ShieldCheck size={18} />
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={useBackupCode ? "XXXXX-XXXXX" : "123456"}
                inputMode={useBackupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            <ShieldCheck size={18} />
            <span>დადასტურება</span>
          </button>

          <div className="login-form-actions">
            <button
              type="button"
              className="login-form-link"
              onClick={() => {
                setUseBackupCode((v) => !v);
                setCode("");
                setError("");
              }}
            >
              {useBackupCode
                ? "ავტორიზაციის კოდის გამოყენება"
                : "სარეზერვო კოდის გამოყენება"}
            </button>

            <button
              type="button"
              className="login-form-link"
              onClick={() => {
                setStage("credentials");
                setCode("");
                setError("");
              }}
            >
              ← უკან
            </button>
          </div>
        </form>
      )}
    </>
  );
}
