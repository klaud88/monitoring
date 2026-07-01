"use client";

import { useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";

export function MustChangePasswordModal({
  mustChangePassword,
}: {
  mustChangePassword: boolean;
}) {
  const [done, setDone] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!mustChangePassword || done) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("პაროლები არ ემთხვევა.");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      setError(data?.message || "პაროლის შეცვლა ვერ მოხერხდა.");
      return;
    }

    setDone(true);
    window.location.reload();
  }

  return (
    <div className="must-change-password-backdrop" role="dialog" aria-modal="true" aria-labelledby="mcp-title">
      <div className="must-change-password-modal">
        <div className="must-change-password-icon">
          <ShieldAlert size={32} />
        </div>
        <h2 id="mcp-title">პაროლის შეცვლა სავალდებულოა</h2>
        <p className="muted">
          პირველი შესვლისთვის გთხოვთ დააყენოთ პირადი პაროლი.
        </p>

        <form className="must-change-password-form" onSubmit={handleSubmit}>
          <label className="field-label">
            <span>ახალი პაროლი</span>
            <div className="input-with-icon">
              <KeyRound size={15} />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="მინიმუმ 8 სიმბოლო"
                autoComplete="new-password"
                required
              />
            </div>
          </label>

          <label className="field-label">
            <span>გაიმეორეთ პაროლი</span>
            <div className="input-with-icon">
              <KeyRound size={15} />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="გაიმეორეთ პაროლი"
                autoComplete="new-password"
                required
              />
            </div>
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button
            className="primary-button"
            type="submit"
            disabled={saving}
            style={{ width: "100%" }}
          >
            {saving ? "ინახება..." : "პაროლის შეცვლა"}
          </button>
        </form>
      </div>
    </div>
  );
}
