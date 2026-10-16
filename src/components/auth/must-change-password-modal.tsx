"use client";

import { ShieldAlert } from "lucide-react";
import { ChangePasswordForm } from "./change-password-form";

export function MustChangePasswordModal({
  mustChangePassword,
}: {
  mustChangePassword: boolean;
}) {
  if (!mustChangePassword) {
    return null;
  }

  return (
    <div className="must-change-password-backdrop" role="dialog" aria-modal="true" aria-labelledby="mcp-title">
      <div className="must-change-password-modal">
        <div className="must-change-password-icon">
          <ShieldAlert size={32} />
        </div>
        <h2 id="mcp-title">პაროლის შეცვლა სავალდებულოა</h2>
        <p className="muted">
          გთხოვთ დააყენოთ პირადი პაროლი. შეცვლის შემდეგ ხელახლა შეხვალთ ახალი პაროლით.
        </p>

        <ChangePasswordForm
          requireCurrent={false}
          className="must-change-password-form"
        />
      </div>
    </div>
  );
}
