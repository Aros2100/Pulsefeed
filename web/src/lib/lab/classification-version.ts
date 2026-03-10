export type Dimension = "subspecialty" | "article_type" | "study_design";

const DIMENSION_INDEX: Record<Dimension, number> = {
  subspecialty: 0,
  article_type: 1,
  study_design: 2,
};

export function versionSegments(version: string): {
  subspecialty: number;
  article_type: number;
  study_design: number;
} {
  const parts = version.split(".").map(Number);
  return {
    subspecialty: parts[0] ?? 1,
    article_type: parts[1] ?? 1,
    study_design: parts[2] ?? 1,
  };
}

export function bumpVersion(current: string, dimension: Dimension): string {
  const parts = current.split(".").map(Number);
  while (parts.length < 3) parts.push(1);
  parts[DIMENSION_INDEX[dimension]]++;
  return parts.join(".");
}

export function changedDimension(prev: string, next: string): Dimension[] {
  const p = prev.split(".").map(Number);
  const n = next.split(".").map(Number);
  const dims: Dimension[] = [];
  if ((p[0] ?? 1) !== (n[0] ?? 1)) dims.push("subspecialty");
  if ((p[1] ?? 1) !== (n[1] ?? 1)) dims.push("article_type");
  if ((p[2] ?? 1) !== (n[2] ?? 1)) dims.push("study_design");
  return dims;
}
