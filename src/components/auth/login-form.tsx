"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, Mail } from "lucide-react";

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
  const [email, setEmail] = useState("admin@local.ge");
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
      body: JSON.stringify({ email, password })
    });

    setLoading(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.message || "შესვლა ვერ მოხერხდა.");
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>ელფოსტა</span>
        <div className="field-with-icon">
          <Mail size={18} />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
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
