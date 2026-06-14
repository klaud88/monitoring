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

export const MAX_TASK_TAG_LENGTH = 120;

export function normalizeTaskTagName(value: unknown) {
  const tagName = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

  return tagName && tagName.length <= MAX_TASK_TAG_LENGTH ? tagName : "";
}

export function normalizeTaskTags(value: unknown) {
  return [...new Set(readTagArray(value).map(normalizeTaskTagName))].filter(
    Boolean,
  );
}

export function filterRegisteredTaskTags(
  value: unknown,
  registeredTags: string[],
) {
  const registered = new Set(registeredTags.map(normalizeTaskTagName));
  return normalizeTaskTags(value).filter((tag) => registered.has(tag));
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
