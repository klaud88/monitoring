"use client";

import { useState } from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";

type Props = {
  availableTags: string[];
  selectedTags: string[];
  canCreateTags: boolean;
  canDeleteTags: boolean;
  className?: string;
  onToggle: (tagName: string) => void;
  onCreateTag: (tagName: string) => Promise<boolean> | boolean;
  onDeleteTag: (tagName: string) => Promise<boolean> | boolean;
};

export function TaskTagPicker({
  availableTags,
  selectedTags,
  canCreateTags,
  canDeleteTags,
  className,
  onToggle,
  onCreateTag,
  onDeleteTag,
}: Props) {
  const [newTagName, setNewTagName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingTag, setDeletingTag] = useState("");
  const { confirm, confirmationDialog } = useConfirmDialog();

  async function createTag() {
    if (!canCreateTags || saving) {
      return;
    }

    const tagName = newTagName.trim().replace(/\s+/g, " ");
    if (!tagName) {
      return;
    }

    if (availableTags.includes(tagName)) {
      if (!selectedTags.includes(tagName)) {
        onToggle(tagName);
      }
      setNewTagName("");
      return;
    }

    setSaving(true);
    const created = await onCreateTag(tagName);
    setSaving(false);
    if (created) {
      if (!selectedTags.includes(tagName)) {
        onToggle(tagName);
      }
      setNewTagName("");
    }
  }

  function submitNewTagOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void createTag();
  }

  async function deleteTag(tagName: string) {
    if (!canDeleteTags || deletingTag) {
      return;
    }

    const confirmed = await confirm({
      message: `ნამდვილად გსურთ "${tagName}" ტეგის წაშლა?`,
    });
    if (!confirmed) {
      return;
    }

    setDeletingTag(tagName);
    await onDeleteTag(tagName);
    setDeletingTag("");
  }

  return (
    <div className={`task-tag-picker ${className ?? ""}`.trim()}>
      {confirmationDialog}
      <span>ტეგები</span>
      <div className="row-tags">
        {availableTags.map((tagName) => (
          <span key={tagName} className="tag-chip-control">
            <button
              type="button"
              className={`tag-toggle compact ${selectedTags.includes(tagName) ? "active" : ""}`}
              onClick={() => onToggle(tagName)}
            >
              <Tag size={13} />
              {tagName}
            </button>
            {canDeleteTags ? (
              <button
                type="button"
                className="tag-delete-button"
                onClick={() => deleteTag(tagName)}
                disabled={Boolean(deletingTag)}
                aria-label={`${tagName} ტეგის წაშლა`}
                title="ტეგის წაშლა"
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {canCreateTags ? (
        <div className="task-tag-create">
          <input
            value={newTagName}
            onChange={(event) => setNewTagName(event.target.value)}
            onKeyDown={submitNewTagOnEnter}
            placeholder="ახალი ტეგი"
            maxLength={120}
          />
          <button
            className="ghost-button"
            type="button"
            onClick={() => void createTag()}
            disabled={saving}
          >
            <Plus size={15} />
            <span>{saving ? "ემატება..." : "დამატება"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
