"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogIn, Mail, ShieldCheck } from "lucide-react";

export function PlatformLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/platform/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, code }),
    }).catch(() => null);
    setLoading(false);

    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message || "შესვლა ვერ მოხერხდა.");
      setCode("");
      return;
    }

    router.replace("/platform");
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

      <label>
        <span>ავტორიზაციის კოდი</span>
        <div className="field-with-icon">
          <ShieldCheck size={18} />
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
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
  );
}
