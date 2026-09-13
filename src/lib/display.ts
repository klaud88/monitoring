export function withoutDeviceCodes(
  value: string,
  codes: Array<string | null | undefined> = [],
) {
  const original = value;
  let cleaned = value;
  const knownCodes = Array.from(
    new Set(codes.map((code) => code?.trim()).filter(Boolean) as string[]),
  ).sort((first, second) => second.length - first.length);

  for (const code of knownCodes) {
    cleaned = cleaned.replace(
      new RegExp(
        `(^|[\\s([{])${escapeRegExp(code)}(?:\\s*[·:,-])?\\s*`,
        "giu",
      ),
      "$1",
    );
  }

  cleaned = cleaned
    .replace(/\b[A-Z]{2,}-[A-Z0-9]+(?:-[A-Z0-9]+)*\b\s*[·:,-]?\s*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,:;])/g, "$1")
    .trim();

  return cleaned || original;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const shortMonths = [
  "იან",
  "თებ",
  "მარ",
  "აპრ",
  "მაი",
  "ივნ",
  "ივლ",
  "აგვ",
  "სექ",
  "ოქტ",
  "ნოე",
  "დეკ",
];

/**
 * "2026-09-08" -> "08 სექ". Phone cards have no room for the full date, and the
 * year is almost always the current one; the full value stays in the DOM for
 * wider screens.
 */
export function formatShortDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value.trim();
  }

  const month = shortMonths[Number(match[2]) - 1];
  return month ? `${match[3]} ${month}` : value.trim();
}
