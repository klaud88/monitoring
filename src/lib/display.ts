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
