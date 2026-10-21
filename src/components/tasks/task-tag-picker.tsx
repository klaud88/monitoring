"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { DeletedTagList } from "@/components/common/deleted-tag-list";
import { TagChipControl } from "@/components/common/tag-chip-control";

type Props = {
  availableTags: string[];
  selectedTags: string[];
  canCreateTags: boolean;
  canDeleteTags: boolean;
  canRenameTags?: boolean;
  className?: string;
  onToggle: (tagName: string) => void;
  onCreateTag: (tagName: string) => Promise<boolean> | boolean;
  onDeleteTag: (tagName: string) => Promise<boolean> | boolean;
  /** Renames the tag everywhere; offered to those who may delete tags. */
  onRenameTag?: (tagName: string, newName: string) => Promise<boolean> | boolean;
  /** Deleted tags, offered for restoring to those who may delete tags. */
  deletedTags?: string[];
  onRestoreTag?: (tagName: string) => Promise<boolean> | boolean;
};

export function TaskTagPicker({
  availableTags,
  selectedTags,
  canCreateTags,
  canDeleteTags,
  canRenameTags = false,
  className,
  onToggle,
  onCreateTag,
  onDeleteTag,
  onRenameTag,
  deletedTags = [],
  onRestoreTag,
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
      message: `ნამდვილად გსურთ "${tagName}" ტეგის წაშლა? ტეგი ყველა დავალებასა და პრობლემაზე დაიმალება; აღდგენისას დაბრუნდება.`,
    });
    if (!confirmed) {
      return;
    }

    setDeletingTag(tagName);
    await onDeleteTag(tagName);
    setDeletingTag("");
  }

  async function renameTag(tagName: string, newName: string) {
    if (!onRenameTag) {
      return false;
    }
    if (availableTags.includes(newName)) {
      const merge = await confirm({
        title: "ტეგების გაერთიანება",
        message: `ტეგი "${newName}" უკვე არსებობს. გაერთიანდეს "${tagName}" მასთან? "${tagName}" ყველგან "${newName}"-ით შეიცვლება.`,
        confirmLabel: "გაერთიანება",
      });
      if (!merge) {
        return false;
      }
    }
    return onRenameTag(tagName, newName);
  }

  return (
    <div className={`task-tag-picker ${className ?? ""}`.trim()}>
      {confirmationDialog}
      <span>ტეგები</span>
      <div className="row-tags">
        {availableTags.map((tagName) => (
          <TagChipControl
            key={tagName}
            name={tagName}
            showIcon
            selected={selectedTags.includes(tagName)}
            onToggle={() => onToggle(tagName)}
            onRename={
              canRenameTags && onRenameTag
                ? (newName) => renameTag(tagName, newName)
                : undefined
            }
            onDelete={canDeleteTags ? () => void deleteTag(tagName) : undefined}
            busy={Boolean(deletingTag)}
          />
        ))}
      </div>
      {canDeleteTags && onRestoreTag ? (
        <DeletedTagList tags={deletedTags} onRestore={onRestoreTag} />
      ) : null}
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
