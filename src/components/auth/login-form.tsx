"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, Mail } from "lucide-react";
import { canAccessPath, getFirstAllowedPath } from "@/lib/navigation";
import type { SessionUser } from "@/lib/types";

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

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("admin@local.ge");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const redirectTo = getSafeNextPath(nextPath);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: identifier, password })
    });

    setLoading(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
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
        <span>{loading ? "შემოწმება..." : "შესვლა"}</span>
      </button>
    </form>
  );
}
