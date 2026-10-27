"use client";

import { useState } from "react";

type ConfirmDialogOptions = {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" (red, default) for deletes; "primary" for e.g. restoring. */
  tone?: "danger" | "primary";
  /** A notice rather than a question: only the confirm button is shown. */
  hideCancel?: boolean;
};

type ConfirmDialogRequest = Required<ConfirmDialogOptions> & {
  resolve: (confirmed: boolean) => void;
};

const defaultConfirmOptions: Required<ConfirmDialogOptions> = {
  title: "წაშლის დადასტურება",
  message: "ნამდვილად გსურთ აღნიშნულის წაშლა?",
  confirmLabel: "კი",
  cancelLabel: "არა",
  tone: "danger",
  hideCancel: false,
};

export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmDialogRequest | null>(null);

  function confirm(options: ConfirmDialogOptions = {}) {
    return new Promise<boolean>((resolve) => {
      setRequest({
        ...defaultConfirmOptions,
        ...options,
        resolve,
      });
    });
  }

  function close(confirmed: boolean) {
    request?.resolve(confirmed);
    setRequest(null);
  }

  const confirmationDialog = request ? (
    <div className="confirm-dialog-backdrop" role="presentation">
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title">{request.title}</h2>
        <p>{request.message}</p>
        <div className="confirm-dialog-actions">
          {request.hideCancel ? null : (
            <button
              className="ghost-button"
              type="button"
              onClick={() => close(false)}
            >
              {request.cancelLabel}
            </button>
          )}
          <button
            className={`primary-button${request.tone === "danger" ? " danger" : ""}`}
            type="button"
            onClick={() => close(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  return { confirm, confirmationDialog };
}
