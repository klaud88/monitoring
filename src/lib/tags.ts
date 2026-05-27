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
