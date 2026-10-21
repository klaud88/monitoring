"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";

/** Deleted tags, each with a restore button (asks first). */
export function DeletedTagList({
  tags,
  onRestore,
}: {
  tags: string[];
  onRestore: (tagName: string) => Promise<boolean> | boolean;
}) {
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [restoring, setRestoring] = useState("");

  if (!tags.length) {
    return null;
  }

  async function restore(tagName: string) {
    if (restoring) {
      return;
    }
    const confirmed = await confirm({
      title: "აღდგენის დადასტურება",
      message: `ნამდვილად გსურთ "${tagName}" ტეგის აღდგენა? ის ყველგან დაბრუნდება, სადაც იყო.`,
      confirmLabel: "აღდგენა",
      tone: "primary",
    });
    if (!confirmed) {
      return;
    }
    setRestoring(tagName);
    await onRestore(tagName);
    setRestoring("");
  }

  return (
    <div className="deleted-tag-list">
      {confirmationDialog}
      <span className="deleted-tag-list-label">წაშლილი ტეგები</span>
      {tags.map((tagName) => (
        <button
          key={tagName}
          type="button"
          className="deleted-tag-chip"
          onClick={() => void restore(tagName)}
          disabled={Boolean(restoring)}
          title={`"${tagName}" — აღდგენა`}
        >
          <span>{tagName}</span>
          <RotateCcw size={12} />
        </button>
      ))}
    </div>
  );
}
