"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

/* New password + repeat. A successful change ends the session on the
   server, so the user is sent to the login page to sign in with it. */
export function ChangePasswordForm({
  requireCurrent,
  submitLabel = "პაროლის შეცვლა",
  className,
}: {
  requireCurrent: boolean;
  submitLabel?: string;
  className?: string;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (requireCurrent && !currentPassword) {
      setError("მიმდინარე პაროლის შეყვანა სავალდებულოა.");
      return;
    }

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
      body: JSON.stringify(
        requireCurrent ? { currentPassword, newPassword } : { newPassword },
      ),
    }).catch(() => null);

    if (!response?.ok) {
      setSaving(false);
      const data = await response?.json().catch(() => null);
      setError(data?.message || "პაროლის შეცვლა ვერ მოხერხდა.");
      return;
    }

    window.location.assign("/login?passwordChanged=1");
  }

  return (
    <form className={className} onSubmit={handleSubmit}>
      {requireCurrent ? (
        <label className="field-label">
          <span>მიმდინარე პაროლი</span>
          <div className="input-with-icon">
            <KeyRound size={15} />
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="მიმდინარე პაროლი"
              autoComplete="current-password"
              required
            />
          </div>
        </label>
      ) : null}

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
        {saving ? "ინახება..." : submitLabel}
      </button>
    </form>
  );
}
