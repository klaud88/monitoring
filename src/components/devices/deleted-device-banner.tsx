"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";

/** Shown on a deleted device's page (only to those who may restore it). */
export function DeletedDeviceBanner({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function restore() {
    const confirmed = await confirm({
      title: "აღდგენის დადასტურება",
      message: "ნამდვილად გსურთ მოწყობილობის აღდგენა?",
      confirmLabel: "აღდგენა",
      tone: "primary",
    });
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError("");
    const response = await fetch(`/api/devices/${deviceId}/restore`, {
      method: "POST",
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError("მოწყობილობის აღდგენა ვერ მოხერხდა.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="deleted-banner" role="status">
      {confirmationDialog}
      <span>მოწყობილობა წაშლილია.</span>
      {error ? <span className="form-error">{error}</span> : null}
      <button
        className="ghost-button"
        type="button"
        onClick={() => void restore()}
        disabled={busy}
      >
        <RotateCcw size={15} />
        <span>აღდგენა</span>
      </button>
    </div>
  );
}
