export const TAG_STORAGE_KEY = "biostar_custom_tags";

export function mergeTags(...groups: string[][]) {
  return Array.from(
    new Set(
      groups
        .flat()
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

/** A tag list with `from` replaced by `to` (no duplicate if `to` is there). */
export function renameTagInList(tags: string[], from: string, to: string) {
  return tags.includes(from)
    ? [...new Set(tags.map((tag) => (tag === from ? to : tag)))]
    : tags;
}
