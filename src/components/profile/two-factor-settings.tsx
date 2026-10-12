"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck, ShieldOff, ShieldPlus } from "lucide-react";

type SetupData = {
  secret: string;
  qrDataUrl: string;
};

type Phase =
  | "status"
  | "starting"
  | "enrolling"
  | "backup-codes"
  | "disabling";

export function TwoFactorSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [phase, setPhase] = useState<Phase>("status");
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function startEnrollment() {
    setError("");
    setBusy(true);

    const response = await fetch("/api/auth/2fa/setup", { method: "POST" }).catch(() => null);
    setBusy(false);

    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.message || "ვერ დაიწყო დაყენება.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as SetupData | null;
    if (!payload) {
      setError("ვერ დაიწყო დაყენება.");
      return;
    }

    setSetupData(payload);
    setCode("");
    setPhase("enrolling");
  }

  async function confirmEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const response = await fetch("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    setBusy(false);

    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.message || "კოდი არასწორია.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { backupCodes?: string[] } | null;
    setBackupCodes(payload?.backupCodes || []);
    setPhase("backup-codes");
  }

  function finishEnrollment() {
    setEnabled(true);
    setSetupData(null);
    setCode("");
    setBackupCodes([]);
    setPhase("status");
  }

  function cancelEnrollment() {
    setSetupData(null);
    setCode("");
    setError("");
    setPhase("status");
  }

  async function confirmDisable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const response = await fetch("/api/auth/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);

    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.message || "პაროლი არასწორია.");
      return;
    }

    setEnabled(false);
    setPassword("");
    setError("");
    setPhase("status");
  }

  if (phase === "enrolling" && setupData) {
    return (
      <div className="twofa-card">
        <p className="muted">
          დაასკანერეთ QR კოდი Google Authenticator-ის (ან სხვა თავსებადი) აპლიკაციით, შემდეგ
          შეიყვანეთ 6-ნიშნა კოდი დასადასტურებლად.
        </p>

        <div className="twofa-qr-row">
          {/* eslint-disable-next-line @next/next/no-img-element -- locally generated data: URL, not an optimizable remote image */}
          <img src={setupData.qrDataUrl} alt="2FA QR კოდი" width={176} height={176} />
          <div>
            <p className="muted" style={{ marginBottom: 6 }}>
              ვერ სკანირდება? შეიყვანეთ გასაღები ხელით:
            </p>
            <span className="twofa-secret-value">{setupData.secret}</span>
          </div>
        </div>

        <form onSubmit={confirmEnrollment} style={{ display: "grid", gap: 10 }}>
          <label className="field-label">
            <span>დამადასტურებელი კოდი</span>
            <input
              className="twofa-code-input"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="twofa-actions">
            <button className="primary-button" type="submit" disabled={busy}>
              <ShieldCheck size={16} />
              <span>დადასტურება და ჩართვა</span>
            </button>
            <button className="ghost-button" type="button" onClick={cancelEnrollment} disabled={busy}>
              გაუქმება
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (phase === "backup-codes") {
    return (
      <div className="twofa-card">
        <p className="form-error" style={{ background: "transparent", border: "none", padding: 0 }}>
          ორფაქტორიანი ავტორიზაცია ჩაირთო. შეინახეთ სარეზერვო კოდები — თითოეული მხოლოდ ერთხელ
          გამოიყენება, თუ ტელეფონზე წვდომას დაკარგავთ. ეს გვერდიდან ტოვების შემდეგ აღარ გამოჩნდება.
        </p>

        <div className="twofa-backup-codes">
          {backupCodes.map((backupCode) => (
            <span key={backupCode}>{backupCode}</span>
          ))}
        </div>

        <div className="twofa-actions">
          <button className="primary-button" type="button" onClick={finishEnrollment}>
            <ShieldCheck size={16} />
            <span>კოდები შენახულია</span>
          </button>
        </div>
      </div>
    );
  }

  if (phase === "disabling") {
    return (
      <form className="twofa-card" onSubmit={confirmDisable}>
        <p className="muted">
          გამორთვის დასადასტურებლად შეიყვანეთ მიმდინარე პაროლი.
        </p>

        <label className="field-label">
          <span>პაროლი</span>
          <div className="input-with-icon">
            <KeyRound size={15} />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="twofa-actions">
          <button className="primary-button danger" type="submit" disabled={busy}>
            <ShieldOff size={16} />
            <span>გამორთვის დადასტურება</span>
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setPassword("");
              setError("");
              setPhase("status");
            }}
          >
            გაუქმება
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="twofa-card">
      <div className="twofa-status-row">
        <span className={`twofa-status-badge ${enabled ? "on" : "off"}`}>
          {enabled ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
          {enabled ? "ჩართულია" : "გამორთულია"}
        </span>

        {enabled ? (
          <button
            className="ghost-button danger"
            type="button"
            onClick={() => {
              setError("");
              setPhase("disabling");
            }}
          >
            <ShieldOff size={16} />
            <span>გამორთვა</span>
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={startEnrollment} disabled={busy}>
            <ShieldPlus size={16} />
            <span>ჩართვა</span>
          </button>
        )}
      </div>

      <p className="muted">
        ორფაქტორიანი ავტორიზაცია პაროლის გარდა მოითხოვს ავტორიზაციის აპლიკაციის (Google
        Authenticator, Authy და სხვა) კოდსაც შესვლისას.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
