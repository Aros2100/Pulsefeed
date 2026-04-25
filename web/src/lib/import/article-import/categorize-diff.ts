export type DiffCategory =
  | "data_loss"
  | "casing_only"
  | "unicode_variant"
  | "db_shorter_labels"
  | "content_differs";

/**
 * Removes structured-abstract labels and double newlines from PubMed-style abstracts.
 * Labels are ALL-CAPS words (optionally with spaces, &, /, -) followed by ": ".
 * Only matches at start of string or after \n\n — not mid-sentence colons.
 *
 * Examples:
 *   "BACKGROUND: Foo.\n\nMETHODS: Bar."  → "Foo. Bar."
 *   "OBJECTIVE: Test.\n\nRESULTS: Done." → "Test. Done."
 *   "The result was: 42."               → "The result was: 42."
 */
function stripStructuredLabels(text: string): string {
  return text
    .replace(/(^|\n\n)([A-Z][A-Z &/\-]+):\s*/g, "$1")
    .replace(/\n\n/g, " ")
    .trim();
}

export function categorizeDiff(
  field: "title" | "abstract",
  dbValue: string | null,
  xmlValue: string | null
): DiffCategory {
  // 1. data_loss: DB is NULL or empty, XML has actual content
  if (
    (dbValue === null || dbValue.trim() === "") &&
    xmlValue !== null &&
    xmlValue.trim() !== ""
  ) {
    return "data_loss";
  }

  // Edge case: XML is null but DB is not
  if (dbValue === null || xmlValue === null) {
    return "content_differs";
  }

  // 2. casing_only: identical when lowercased
  if (dbValue.toLowerCase() === xmlValue.toLowerCase()) {
    return "casing_only";
  }

  // 3. unicode_variant: identical after NFKC normalization
  if (dbValue.normalize("NFKC") === xmlValue.normalize("NFKC")) {
    return "unicode_variant";
  }

  // 4. db_shorter_labels: XML without "LABEL: " patterns and newlines matches DB
  if (field === "abstract" && dbValue.length < xmlValue.length) {
    const xmlStripped = stripStructuredLabels(xmlValue);
    if (xmlStripped === dbValue.trim()) {
      return "db_shorter_labels";
    }
  }

  // 5. Residual bucket
  return "content_differs";
}
