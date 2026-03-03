/**
 * Import Quality Checks
 * Kører automatisk efter import + author-linking.
 * Gemmer resultater i import_quality_checks-tabellen.
 */

import { createAdminClient } from "@/lib/supabase/admin";

interface CheckResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string | number;
  message: string;
}

interface QualityCheckResult {
  passed: boolean;
  totalChecks: number;
  failedChecks: number;
  checks: CheckResult[];
}

async function saveChecks(
  importLogId: string | null,
  checkType: "article" | "linking",
  checks: CheckResult[]
): Promise<QualityCheckResult> {
  const supabase = createAdminClient();
  const failedChecks = checks.filter(c => !c.passed).length;
  const passed = failedChecks === 0;

  await supabase.from("import_quality_checks" as never).insert({
    import_log_id: importLogId,
    check_type: checkType,
    passed,
    total_checks: checks.length,
    failed_checks: failedChecks,
    checks,
  } as never);

  return { passed, totalChecks: checks.length, failedChecks, checks };
}

// ── Article checks ─────────────────────────────────────────────────────────────

/**
 * Kører efter C1/C2 import.
 * Checks: import_has_articles, title, abstract (< 30%), authors JSONB, import_completed.
 */
export async function runArticleChecks(
  importLogId: string
): Promise<QualityCheckResult> {
  const supabase = createAdminClient();

  const { data: importLog, error: logError } = await supabase
    .from("import_logs" as never)
    .select("*")
    .eq("id", importLogId)
    .single();

  if (logError || !importLog) {
    throw new Error(`Import log not found: ${importLogId}`);
  }

  const log = importLog as Record<string, unknown>;
  const checks: CheckResult[] = [];
  const startedAt = log.started_at as string;
  const completedAt = (log.completed_at as string) || new Date().toISOString();
  const articlesImported = (log.articles_imported as number) ?? 0;

  // Check 1: Import har artikler
  checks.push({
    name: "import_has_articles",
    passed: articlesImported > 0,
    expected: "> 0",
    actual: articlesImported,
    message: articlesImported > 0
      ? `${articlesImported} artikler importeret`
      : "Ingen artikler importeret — tom kørsel",
  });

  // Check 2: Alle artikler har title
  const { count: noTitle } = await supabase
    .from("articles" as never)
    .select("*", { count: "exact", head: true })
    .is("title", null)
    .gte("imported_at", startedAt)
    .lte("imported_at", completedAt);

  checks.push({
    name: "all_articles_have_title",
    passed: (noTitle ?? 0) === 0,
    expected: "0",
    actual: noTitle ?? 0,
    message: (noTitle ?? 0) === 0
      ? "Alle artikler har title"
      : `${noTitle} artikler mangler title`,
  });

  // Check 3: Abstract-mangler < 30%
  const { count: noAbstract } = await supabase
    .from("articles" as never)
    .select("*", { count: "exact", head: true })
    .is("abstract", null)
    .gte("imported_at", startedAt)
    .lte("imported_at", completedAt);

  const abstractMissingRate = articlesImported > 0 ? (noAbstract ?? 0) / articlesImported : 0;
  checks.push({
    name: "all_articles_have_abstract",
    passed: abstractMissingRate < 0.3,
    expected: "< 30%",
    actual: `${(abstractMissingRate * 100).toFixed(1)}% (${noAbstract ?? 0}/${articlesImported})`,
    message: abstractMissingRate < 0.3
      ? `${(abstractMissingRate * 100).toFixed(1)}% mangler abstract`
      : `${(abstractMissingRate * 100).toFixed(1)}% mangler abstract — over threshold`,
  });

  // Check 4: Alle artikler har authors JSONB
  const { data: emptyAuthors } = await supabase
    .from("articles" as never)
    .select("id", { count: "exact" })
    .gte("imported_at", startedAt)
    .lte("imported_at", completedAt)
    .or("authors.is.null,authors.eq.[]");

  const emptyCount = emptyAuthors?.length ?? 0;
  checks.push({
    name: "all_articles_have_authors_jsonb",
    passed: emptyCount === 0,
    expected: "0",
    actual: emptyCount,
    message: emptyCount === 0
      ? "Alle artikler har mindst 1 forfatter i JSONB"
      : `${emptyCount} artikler har tom/null authors JSONB`,
  });

  // Check 5: Import log status er "completed"
  checks.push({
    name: "import_completed",
    passed: log.status === "completed",
    expected: "completed",
    actual: log.status as string,
    message: log.status === "completed"
      ? "Import afsluttet korrekt"
      : `Import status: ${log.status}`,
  });

  return saveChecks(importLogId, "article", checks);
}

// ── Linking checks ─────────────────────────────────────────────────────────────

/**
 * Kører efter author-linking.
 * Tager authorLinkingLogId (id fra author_linking_logs).
 * Checks: rejected_authors_below_threshold, author_linking_rate, no_suspect_author_names.
 * Gemmer med import_log_id = author_linking_logs.import_log_id (kan være null).
 */
export async function runLinkingChecks(
  authorLinkingLogId: string
): Promise<QualityCheckResult> {
  const supabase = createAdminClient();

  const { data: linkingLog, error: logError } = await supabase
    .from("author_linking_logs" as never)
    .select("started_at, completed_at, import_log_id, new_authors, duplicates, rejected")
    .eq("id", authorLinkingLogId)
    .single();

  if (logError || !linkingLog) {
    throw new Error(`Author linking log not found: ${authorLinkingLogId}`);
  }

  const ll = linkingLog as Record<string, unknown>;
  const checks: CheckResult[] = [];
  const startedAt = ll.started_at as string;
  const completedAt = (ll.completed_at as string) || new Date().toISOString();
  const importLogId = (ll.import_log_id as string | null) ?? null;

  // Check 1: Rejected authors rate < 10%
  const total = ((ll.new_authors as number) ?? 0) + ((ll.duplicates as number) ?? 0) + ((ll.rejected as number) ?? 0);
  const rejectedRate = total > 0 ? ((ll.rejected as number) ?? 0) / total : 0;
  checks.push({
    name: "rejected_authors_below_threshold",
    passed: rejectedRate < 0.1,
    expected: "< 10%",
    actual: `${(rejectedRate * 100).toFixed(1)}% (${ll.rejected}/${total})`,
    message: rejectedRate < 0.1
      ? `Afvisningsrate: ${(rejectedRate * 100).toFixed(1)}%`
      : `Høj afvisningsrate: ${(rejectedRate * 100).toFixed(1)}% — tjek parser`,
  });

  // Check 2: Author linking-rate > 80%
  const { data: articlesInWindow } = await supabase
    .from("articles" as never)
    .select("id, authors")
    .gte("imported_at", startedAt)
    .lte("imported_at", completedAt);

  if (articlesInWindow && articlesInWindow.length > 0) {
    const articleIds = (articlesInWindow as Array<{ id: string; authors: unknown[] }>).map(a => a.id);
    const { count: linkedCount } = await supabase
      .from("article_authors" as never)
      .select("*", { count: "exact", head: true })
      .in("article_id", articleIds);

    const expectedSlots = (articlesInWindow as Array<{ id: string; authors: unknown[] }>).reduce(
      (sum, a) => sum + (Array.isArray(a.authors) ? a.authors.length : 0), 0
    );
    const linkingRate = expectedSlots > 0 ? (linkedCount ?? 0) / expectedSlots : 1;

    checks.push({
      name: "author_linking_rate",
      passed: linkingRate > 0.8,
      expected: "> 80%",
      actual: `${(linkingRate * 100).toFixed(1)}% (${linkedCount}/${expectedSlots})`,
      message: linkingRate > 0.8
        ? `Linking-rate: ${(linkingRate * 100).toFixed(1)}%`
        : `Lav linking-rate: ${(linkingRate * 100).toFixed(1)}% — mulig parser-fejl`,
    });
  }

  // Check 3: Ingen suspekte forfatternavne
  const { count: suspectNames } = await supabase
    .from("authors" as never)
    .select("*", { count: "exact", head: true })
    .gte("created_at", startedAt)
    .lte("created_at", completedAt)
    .or("display_name.like.%@%,display_name.like.%http%,display_name.like.%[%");

  checks.push({
    name: "no_suspect_author_names",
    passed: (suspectNames ?? 0) === 0,
    expected: "0",
    actual: suspectNames ?? 0,
    message: (suspectNames ?? 0) === 0
      ? "Ingen suspekte forfatternavne"
      : `${suspectNames} forfattere med suspekte tegn i navn`,
  });

  return saveChecks(importLogId, "linking", checks);
}
