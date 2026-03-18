export interface ImportEventPayload extends Record<string, unknown> {
  circle: number;
  status: string;
  approval_method: string | null;
  specialty_tags: string[];
  pubmed_id: string;
  import_log_id: string | null;
  source_id: string | null;
}

export function buildImportEventPayload(
  params: ImportEventPayload
): ImportEventPayload {
  return params;
}
