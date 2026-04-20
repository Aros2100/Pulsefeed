// ── Shared newsletter HTML renderer ──────────────────────────────────────────
// Single source of truth for email structure and styling.
// Used by both the preview page and the test-send API route.

export type Article = {
  title: string;
  article_type: string | null;
  journal_abbr: string | null;
  pubmed_id: string;
  authorLastName: string | null;
  country: string | null;
};

export type Section = {
  name: string;
  comment: string;
  articles: Article[];
};

export interface RenderParams {
  weekNumber: number;
  year: number;
  satLabel: string;
  firstName: string;
  pubmedTotal: number;
  pubmedBySubspecialty: Record<string, number>;
  globalIntro: string;
  sections: Section[];
  globalArticles: Article[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function articleRow(a: Article): string {
  const meta = [a.article_type, a.journal_abbr, a.authorLastName, a.country].filter((s): s is string => s !== null && s !== undefined).map(esc).join(" · ");
  return `
    <div style="margin-bottom:10px">
      <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(a.pubmed_id)}/"
         style="font-size:14px;font-weight:600;color:#1a1a1a;text-decoration:none;line-height:1.45;display:block;margin-bottom:4px">
        <span style="color:#E83B2A;margin-right:8px">→</span>${esc(a.title)}
      </a>
      ${meta ? `<span style="font-size:11px;color:#9ca3af">${meta}</span>` : ""}
    </div>`;
}

function divider(label: string, highlight = false): string {
  const color = highlight ? "#059669" : "#9ca3af";
  const lineColor = highlight ? "#d1fae5" : "#e5e7eb";
  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <div style="flex:1;height:1px;background:${lineColor}"></div>
      <span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};white-space:nowrap">${esc(label)}</span>
      <div style="flex:1;height:1px;background:${lineColor}"></div>
    </div>`;
}

export function renderNewsletterHtml(params: RenderParams): string {
  const { satLabel, firstName, pubmedTotal, pubmedBySubspecialty, globalIntro, sections, globalArticles } = params;

  const editionLine = sections.length > 0
    ? `<div style="text-align:center;padding:8px 0;border-bottom:1px solid #f3f4f6"><span style="font-size:11px;color:#9ca3af">Your edition · ${sections.map((s) => esc(s.name)).join(" · ")}</span></div>`
    : "";

  const sectionsHtml = sections.map((s) => {
    const subTotal = pubmedBySubspecialty[s.name];
    const statLine = subTotal !== undefined
      ? `<p style="font-size:11px;color:#9ca3af;margin:0 0 12px;line-height:1.4">${subTotal} articles this week · ${s.articles.length} selected for you</p>`
      : "";
    return `
      ${divider(s.name)}
      ${statLine}
      ${s.comment ? `<p style="font-size:14px;line-height:1.75;color:#374151;margin:0 0 20px">${esc(s.comment)}</p>` : ""}
      ${s.articles.map(articleRow).join("")}
    `;
  }).join("");

  const highlightsHtml = globalArticles.length > 0 ? `
    ${divider("This week's highlights", true)}
    ${globalArticles.map(articleRow).join("")}
  ` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8ecf0;font-family:Inter,Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;background:#fff">

    <!-- Header -->
    <div style="background:#fff;border-bottom:1px solid #e5e7eb;padding:20px 32px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:16px;font-weight:700;color:#1a1a1a">Pulse<span style="color:#E83B2A">Feed</span></span>
      <span style="font-size:11px;color:#9ca3af">${esc(satLabel)}</span>
    </div>

    <!-- PubMed band -->
    ${pubmedTotal > 0 ? `<div style="background:#1a1a1a;text-align:center;padding:10px 0"><span style="font-size:11px;color:#a0aec0;letter-spacing:0.08em;text-transform:uppercase">${pubmedTotal} new articles in neurosurgery on PubMed this week</span></div>` : ""}

    <!-- Your edition line -->
    ${editionLine}

    <!-- Body -->
    <div style="padding:32px 32px 0">

      <!-- Greeting -->
      ${firstName ? `<div style="margin-bottom:24px"><p style="font-size:15px;color:#1a1a1a;margin:0">Hi ${esc(firstName)},</p></div>` : ""}

      <!-- Global intro -->
      ${globalIntro ? `<p style="font-size:14px;line-height:1.75;color:#374151;margin:0 0 28px;font-family:Georgia,'Times New Roman',serif;font-style:italic">${esc(globalIntro)}</p>` : ""}

      <!-- Sections -->
      ${sectionsHtml}

      <!-- Highlights -->
      ${highlightsHtml}
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding:24px 32px;margin-top:32px;text-align:center">
      <p style="font-size:11px;color:#9ca3af;margin:0 0 6px;line-height:1.6">PulseFeed sends every Saturday</p>
      <p style="font-size:11px;color:#9ca3af;margin:0;line-height:1.6">
        <span style="color:#6b7280;text-decoration:underline">Manage preferences</span> · <span style="color:#6b7280;text-decoration:underline">Unsubscribe</span>
      </p>
    </div>
  </div>
</body>
</html>`;
}
