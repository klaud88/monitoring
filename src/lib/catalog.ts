export const regions = [
  "ვაკე-საბურთალო",
  "მთაწმინდა-კრწანისი",
  "ისანი-სამგორი",
  "დიდუბე-ჩუღურეთი",
  "გლდანი-ნაძალადევი",
  "დიდგორი",
] as const;

export const tagCatalog = [
  "ელ.პრობლემა",
  "კამერები",
  "UPS",
  "offline",
] as const;

export const taskTagCatalog = [
  "ინტ. გათიშული",
  "ელ.პრობლემა",
  "UPS",
  "რეკი",
  "LAN",
  "XT Offline",
  "კამერები Offline",
  "კამერების ლუპი",
] as const;

const taskTagSet = new Set<string>(taskTagCatalog);

export function normalizeTaskTags(value: unknown) {
  const tags = readTagArray(value);

  return [...new Set(tags.map((tag) => tag.trim()))].filter((tag) =>
    taskTagSet.has(tag),
  );
}

function readTagArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return trimmed.split(",").map(String);
    }
  }

  return [];
}
