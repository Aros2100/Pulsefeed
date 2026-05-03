// Single source of truth for newsletter email HTML — built against email-v4.html.
// Pure function: no DB calls. All data provided via RenderParams.

// ── Types ─────────────────────────────────────────────────────────────────────

export type RenderArticle = {
  pubmed_id: string;
  newsletter_headline: string;
  newsletter_subheadline: string;
  article_type: string | null;
  journal_abbr: string | null;
};

export type SubspecialtyBlock = {
  name: string;
  short_name: string | null;
  lead: RenderArticle | null;
  more_count: number;
  more_url: string | null;
};

export type FeaturePromo = {
  label: string;
  headline: string;
  description: string;
  cta_text: string;
  cta_url: string;
};

export type AndFinallyArticle = {
  pubmed_id: string;
  newsletter_headline: string;
  newsletter_subheadline: string;
  article_type: string | null;
  journal_abbr: string | null;
};

export interface RenderParams {
  weekNumber: number;
  year: number;
  issueDate: Date;
  firstName: string | null;

  hero: RenderArticle;
  acrossLeads: RenderArticle[];
  acrossMoreCount: number;
  acrossMoreUrl: string | null;

  subspecialtyBlocks: SubspecialtyBlock[];

  pubmedTotal: number;
  pubmedBySub: { name: string; short_name: string | null; count: number }[];

  editionUrl: string;

  andFinally: AndFinallyArticle | null;
  featurePromo: FeaturePromo | null;

  footerSubspecialtyShortNames: string[];
  unsubscribeUrl: string;
  preferencesUrl: string;
  forwardUrl: string;

  trackingPixelUrl: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatIssueDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const LOGO_PATH = `M14 0 L86 0 A14 14 0 0 1 100 14 L100 86 A14 14 0 0 1 86 100 L14 100 A14 14 0 0 1 0 86 L0 14 A14 14 0 0 1 14 0 Z M 50.598 16.442 C 50.626 16.714 50.666 22.718 50.694 29.804 C 50.728 36.876 50.768 43.064 50.802 43.547 L 50.850 44.417 L 57.854 37.325 C 61.703 33.422 64.865 30.198 64.878 30.164 C 64.892 30.117 53.856 19.148 51.272 16.653 L 50.551 15.959 L 50.598 16.442 M 37.046 26.370 C 33.014 26.411 29.002 26.452 28.124 26.458 L 26.526 26.486 L 34.877 34.700 C 39.467 39.215 44.043 43.717 45.043 44.689 L 46.858 46.471 L 46.811 43.397 C 46.784 41.711 46.736 37.168 46.716 33.299 L 46.668 26.282 L 45.512 26.295 C 44.893 26.302 41.078 26.336 37.046 26.370 M 64.974 37.576 L 54.896 47.654 L 65.001 47.654 L 75.092 47.654 L 75.092 37.576 C 75.092 32.028 75.085 27.492 75.072 27.492 C 75.065 27.492 70.522 32.028 64.974 37.576 M 23.650 43.118 L 16.524 50.245 L 30.817 50.245 L 45.104 50.245 L 37.978 43.118 C 34.061 39.202 30.838 35.992 30.817 35.992 C 30.790 35.992 27.567 39.202 23.650 43.118 M 49.837 46.600 C 49.177 46.736 48.348 47.205 47.885 47.715 C 45.886 49.898 47.042 53.352 49.959 53.896 C 51.659 54.209 53.482 53.142 54.046 51.496 C 54.604 49.878 54.026 48.130 52.618 47.151 C 51.904 46.668 50.687 46.423 49.837 46.600 M 62.043 57.385 L 69.183 64.532 L 76.323 57.385 L 83.476 50.245 L 69.183 50.245 L 54.896 50.245 L 62.043 57.385 M 26.445 64.062 L 26.445 74.167 L 36.522 64.083 C 42.064 58.541 46.600 53.998 46.600 53.992 C 46.600 53.978 42.064 53.964 36.522 53.964 L 26.445 53.964 L 26.445 64.062 M 54.291 64.613 L 54.291 74.691 L 64.382 74.691 L 74.487 74.691 L 64.409 64.613 C 58.867 59.064 54.325 54.536 54.318 54.536 C 54.298 54.536 54.291 59.064 54.291 64.613 M 42.914 62.757 C 39.134 66.735 36.026 70.019 36.012 70.060 C 36.006 70.094 39.276 73.249 43.282 77.064 L 50.564 84.000 L 50.517 82.565 C 50.496 81.776 50.333 75.378 50.163 68.353 C 49.993 61.322 49.837 55.562 49.823 55.542 C 49.816 55.535 46.702 58.786 42.914 62.757`;

function pubmedUrl(pubmedId: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${esc(pubmedId)}/`;
}

function metaLine(articleType: string | null, journalAbbr: string | null): string {
  const parts: string[] = [articleType, journalAbbr].filter((s): s is string => s !== null && s !== "");
  return parts.map(esc).join(" &nbsp;·&nbsp; ");
}

function spacer(): string {
  return `<tr><td style="height: 14px; line-height: 14px; font-size: 0;">&nbsp;</td></tr>`;
}

// ── Article row builders ──────────────────────────────────────────────────────

function acrossArticleRow(a: RenderArticle, isFirst: boolean): string {
  const borderStyle = isFirst ? "" : "border-top: 1px solid #F1F5F9;";
  const meta = metaLine(a.article_type, a.journal_abbr);
  return `
              <tr>
                <td class="px-card" style="padding: 0 36px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td style="padding: 18px 0; ${borderStyle}">
                        ${meta ? `<p style="margin:0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color:#64748B;">${meta}</p>` : ""}
                        <h3 class="article-title serif" style="margin:0 0 8px 0; font-family: Georgia, serif; font-size: 18px; line-height: 25px; color:#1E293B; font-weight: 400; letter-spacing: -0.2px;">
                          <a href="${pubmedUrl(a.pubmed_id)}" style="color:#1E293B; text-decoration:none;">${esc(a.newsletter_headline)}</a>
                        </h3>
                        <p style="margin:0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color:#475569;">
                          ${esc(a.newsletter_subheadline)}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

function subArticleRow(block: SubspecialtyBlock, isFirst: boolean, isLast: boolean): string {
  const borderStyle = isFirst ? "" : "border-top: 1px solid #F1F5F9;";
  const bottomPad = isLast ? "padding: 0 36px 22px 36px;" : "padding: 0 36px;";
  const subLabel = esc(block.short_name ?? block.name);

  if (!block.lead) {
    return `
              <tr>
                <td class="px-card" style="${bottomPad}">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td style="padding: 18px 0 ${isLast ? "0" : ""} 0; ${borderStyle}">
                        <p style="margin:0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">
                          <span style="color:#D94A43;">${subLabel}</span>
                        </p>
                        <p style="margin: 8px 0 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #94A3B8; font-style: italic;">No articles selected for this issue.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
  }

  const a = block.lead;
  const meta = a.article_type ? esc(a.article_type) : "";
  const moreLink = (block.more_count > 0 && block.more_url)
    ? `<a href="${esc(block.more_url)}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 600; color:#D94A43; text-decoration:none;">${block.more_count} more worth reading in ${subLabel} →</a>`
    : "";
  const subheadMargin = moreLink ? "margin:0 0 10px 0;" : "margin:0;";

  return `
              <tr>
                <td class="px-card" style="${bottomPad}">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td style="padding: 18px 0 ${isLast ? "0" : ""} 0; ${borderStyle}">
                        <p style="margin:0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">
                          <span style="color:#D94A43;">${subLabel}</span>
                          ${meta ? `<span style="color:#CBD5E1;"> · </span><span style="color:#64748B;">${meta}</span>` : ""}
                        </p>
                        <h3 class="article-title serif" style="margin:0 0 8px 0; font-family: Georgia, serif; font-size: 18px; line-height: 25px; color:#1E293B; font-weight: 400; letter-spacing: -0.2px;">
                          <a href="${pubmedUrl(a.pubmed_id)}" style="color:#1E293B; text-decoration:none;">${esc(a.newsletter_headline)}</a>
                        </h3>
                        <p style="${subheadMargin} font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color:#475569;">
                          ${esc(a.newsletter_subheadline)}
                        </p>
                        ${moreLink}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderNewsletterHtml(p: RenderParams): string {
  const { weekNumber, issueDate, firstName, hero, acrossLeads, acrossMoreCount, acrossMoreUrl,
    subspecialtyBlocks, pubmedTotal, pubmedBySub, editionUrl, andFinally, featurePromo,
    footerSubspecialtyShortNames, unsubscribeUrl, preferencesUrl, forwardUrl, trackingPixelUrl } = p;

  const issueDateStr = formatIssueDate(issueDate);

  // Preheader
  const preheaderText = `Issue ${weekNumber} in neurosurgery — ${acrossLeads.length + 1} across the field${subspecialtyBlocks.length > 0 ? `, one from each of your subspecialties` : ""}.`;

  // Greeting
  const greetingHtml = `
        <tr>
          <td style="padding: 0 4px 18px 4px;">
            <p style="margin:0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; color:#475569; line-height: 1.5;">
              Hi${firstName ? ` ${esc(firstName)}` : ""},
            </p>
          </td>
        </tr>`;

  // Hero
  const heroMeta = metaLine(hero.article_type, hero.journal_abbr);
  const heroHtml = `
        <tr>
          <td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f1e8; border-radius: 14px; border: 1px solid #E5DCC8;">
              <tr>
                <td class="px-card" style="padding: 32px 36px 30px 36px;">
                  <p style="margin:0 0 14px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color:#D94A43;">
                    This week's lead from PubMed
                  </p>
                  ${heroMeta ? `<p style="margin:0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color:#64748B;">${heroMeta}</p>` : ""}
                  <h2 class="lede-title serif" style="margin:0 0 14px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 26px; line-height: 32px; color:#1E293B; font-weight: 400; letter-spacing: -0.4px;">
                    <a href="${pubmedUrl(hero.pubmed_id)}" style="color:#1E293B; text-decoration:none;">${esc(hero.newsletter_headline)}</a>
                  </h2>
                  <p style="margin:0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color:#475569;">
                    ${esc(hero.newsletter_subheadline)}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

  // Across the field
  const acrossMoreHtml = (acrossMoreCount > 0 && acrossMoreUrl) ? `
              <tr>
                <td class="px-card" style="padding: 0 36px 22px 36px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td style="padding: 14px 0 0 0; border-top: 1px solid #F1F5F9;">
                        <a href="${esc(acrossMoreUrl)}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; color:#D94A43; text-decoration:none;">
                          ${acrossMoreCount} more worth reading across the field →
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>` : (acrossLeads.length > 0 ? `<tr><td style="height:22px; line-height:22px; font-size:0;">&nbsp;</td></tr>` : "");

  const acrossHtml = acrossLeads.length > 0 ? `
        <tr>
          <td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#ffffff; border-radius: 14px; border: 1px solid #E2E8F0;">
              <tr>
                <td class="px-card" style="padding: 24px 36px 8px 36px;">
                  <p style="margin:0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color:#334155;">
                    Also across the field
                  </p>
                </td>
              </tr>
              ${acrossLeads.map((a, i) => acrossArticleRow(a, i === 0)).join("")}
              ${acrossMoreHtml}
            </table>
          </td>
        </tr>` : "";

  // From your subspecialties
  const subsHtml = subspecialtyBlocks.length > 0 ? `
        <tr>
          <td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#ffffff; border-radius: 14px; border: 1px solid #E2E8F0;">
              <tr>
                <td class="px-card" style="padding: 24px 36px 8px 36px;">
                  <p style="margin:0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color:#334155;">
                    From your subspecialties
                  </p>
                </td>
              </tr>
              ${subspecialtyBlocks.map((b, i) => subArticleRow(b, i === 0, i === subspecialtyBlocks.length - 1)).join("")}
            </table>
          </td>
        </tr>` : "";

  // Numbers + CTA
  const totalCell = `<td align="left" style="padding: 14px 18px; border-right: 1px solid #E2E8F0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                        <p style="margin: 0 0 2px 0; font-family: Georgia, serif; font-size: 22px; line-height: 1; color:#1E293B; font-weight: 400;">${pubmedTotal}</p>
                        <p style="margin: 0; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color:#64748B;">Neurosurgery</p>
                      </td>`;

  const subCells = pubmedBySub.map((s, i) => {
    const isLast = i === pubmedBySub.length - 1;
    const borderRight = isLast ? "" : "border-right: 1px solid #E2E8F0;";
    const cls = isLast ? ` class="last"` : "";
    return `<td align="left"${cls} style="padding: 14px 18px; ${borderRight} font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                        <p style="margin: 0 0 2px 0; font-family: Georgia, serif; font-size: 22px; line-height: 1; color:#1E293B; font-weight: 400;">${s.count}</p>
                        <p style="margin: 0; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color:#64748B;">${esc(s.short_name ?? s.name)}</p>
                      </td>`;
  }).join("");

  const numbersHtml = `
        <tr>
          <td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#ffffff; border-radius: 14px; border: 1px solid #E2E8F0;">
              <tr>
                <td class="px-card" style="padding: 24px 36px 12px 36px;">
                  <p style="margin:0 0 14px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color:#334155;">
                    New neurosurgical articles on PubMed
                  </p>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="nums-grid" style="background-color:#F8FAFC; border-radius: 8px;">
                    <tr>
                      ${totalCell}
                      ${subCells}
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="px-card" style="padding: 8px 36px 28px 36px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td align="center">
                        <a href="${esc(editionUrl)}" style="display:block; background-color:#D94A43; color:#FFFFFF; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; padding: 14px 18px; text-decoration:none; border-radius: 8px; letter-spacing: 0.1px; text-align:center;">
                          Open this week's edition on PulseFeeds →
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

  // And finally
  const andFinallyHtml = andFinally ? `
        <tr>
          <td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#ffffff; border-radius: 14px; border: 1px solid #E2E8F0;">
              <tr>
                <td class="px-card" style="padding: 24px 36px 26px 36px;">
                  <p style="margin:0 0 14px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color:#334155;">
                    And finally
                  </p>
                  <p style="margin:0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color:#64748B;">
                    ${metaLine(andFinally.article_type, andFinally.journal_abbr)}
                  </p>
                  <h3 class="article-title serif" style="margin:0 0 8px 0; font-family: Georgia, serif; font-size: 18px; line-height: 25px; color:#1E293B; font-weight: 400; letter-spacing: -0.2px;">
                    <a href="${pubmedUrl(andFinally.pubmed_id)}" style="color:#1E293B; text-decoration:none;">${esc(andFinally.newsletter_headline)}</a>
                  </h3>
                  <p style="margin:0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color:#475569;">
                    ${esc(andFinally.newsletter_subheadline)}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : "";

  // Feature promo
  const featurePromoHtml = featurePromo ? `
        <tr>
          <td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#ffffff; border-radius: 14px; border: 1px solid #E2E8F0;">
              <tr>
                <td class="px-card" style="padding: 24px 36px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td valign="top" width="4" style="background-color:#D94A43; border-radius: 2px;">&nbsp;</td>
                      <td valign="top" style="padding-left: 18px;">
                        <p style="margin:0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color:#D94A43;">
                          ${esc(featurePromo.label)}
                        </p>
                        <h3 class="article-title serif" style="margin:0 0 8px 0; font-family: Georgia, serif; font-size: 18px; line-height: 25px; color:#1E293B; font-weight: 400; letter-spacing: -0.2px;">
                          ${esc(featurePromo.headline)}
                        </h3>
                        <p style="margin:0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color:#475569;">
                          ${esc(featurePromo.description)}
                        </p>
                        <a href="${esc(featurePromo.cta_url)}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; color:#D94A43; text-decoration:none;">
                          ${esc(featurePromo.cta_text)}
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : "";

  // Footer
  const footerSubsText = footerSubspecialtyShortNames.length > 0
    ? ` &mdash; ${footerSubspecialtyShortNames.map(esc).join(", ")}.`
    : ".";

  const footerHtml = `
        <tr>
          <td style="padding: 24px 4px 16px 4px;">
            <p style="margin:0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 17px; color:#64748B;">
              Issue ${weekNumber} &nbsp;·&nbsp; Subscribed for <strong style="color:#475569;">Neurosurgery</strong>${footerSubsText}
            </p>
            <p style="margin:0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color:#64748B;">
              <a href="${esc(preferencesUrl)}" style="color:#64748B; text-decoration:underline;">Update preferences</a>
              &nbsp;·&nbsp;
              <a href="${esc(forwardUrl)}" style="color:#64748B; text-decoration:underline;">Forward to a colleague</a>
              &nbsp;·&nbsp;
              <a href="${esc(unsubscribeUrl)}" style="color:#64748B; text-decoration:underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>`;

  // Tracking pixel
  const trackingHtml = trackingPixelUrl
    ? `<img src="${esc(trackingPixelUrl)}" width="1" height="1" style="display:block;width:1px;height:1px;border:0" alt="" />`
    : "";

  // Section spacers (only between sections that exist)
  const afterHeroSpacer = (acrossLeads.length > 0 || subspecialtyBlocks.length > 0) ? spacer() : "";
  const afterAcrossSpacer = (acrossLeads.length > 0 && subspecialtyBlocks.length > 0) ? spacer() : "";
  const afterSubsSpacer = (subspecialtyBlocks.length > 0) ? spacer() : (acrossLeads.length > 0 ? spacer() : spacer());

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PulseFeeds &mdash; Issue ${weekNumber}</title>
  <!--[if mso]>
  <style type="text/css">
    table, td, div { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif !important; }
    .serif { font-family: Georgia, 'Times New Roman', serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { text-decoration: none; }
    @media screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .px-card { padding-left: 22px !important; padding-right: 22px !important; }
      .px-outer { padding-left: 12px !important; padding-right: 12px !important; }
      .lede-title { font-size: 17px !important; line-height: 24px !important; }
      .article-title { font-size: 16px !important; line-height: 22px !important; }
      .nums-grid td { display: block !important; width: 100% !important; padding: 8px 0 !important; border-right: none !important; border-bottom: 1px solid #E2E8F0 !important; }
      .nums-grid td.last { border-bottom: none !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#edf5f8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">

<!-- Preheader -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${esc(preheaderText)}</div>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#edf5f8;">
  <tr>
    <td align="center" class="px-outer" style="padding: 24px 16px;">

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="container" style="width:600px; max-width:600px;">

        <!-- MASTHEAD -->
        <tr>
          <td style="padding: 8px 4px 24px 4px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td align="left" valign="middle">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td valign="middle" style="padding-right: 10px;">
                        <!--[if !mso]><!-->
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32" style="display:block;">
                          <path d="${LOGO_PATH}" fill="#D94A43" fill-rule="evenodd"></path>
                        </svg>
                        <!--<![endif]-->
                        <!--[if mso]>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="32" height="32" style="background-color:#D94A43;"><tr><td>&nbsp;</td></tr></table>
                        <![endif]-->
                      </td>
                      <td valign="middle" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color:#334155; line-height: 12px;">
                        PULSE<br/>FEEDS
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" valign="middle" style="font-family: Georgia, 'Times New Roman', serif; font-size: 13px; color:#475569; font-style: italic; line-height: 1.3;">
                  Medical Intelligence<br/>for Neurosurgery
                </td>
              </tr>
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 14px;">
              <tr>
                <td style="border-top: 1px solid #CBD5E1; padding-top: 10px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 11px; color:#64748B;" align="left">
                  Issue ${weekNumber} &nbsp;·&nbsp; ${issueDateStr}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- GREETING -->
        ${greetingHtml}

        <!-- HERO -->
        ${heroHtml}

        ${afterHeroSpacer}

        <!-- ACROSS THE FIELD -->
        ${acrossHtml}

        ${afterAcrossSpacer}

        <!-- FROM YOUR SUBSPECIALTIES -->
        ${subsHtml}

        ${afterSubsSpacer}

        <!-- NUMBERS + CTA -->
        ${numbersHtml}

        ${spacer()}

        <!-- AND FINALLY -->
        ${andFinallyHtml}

        <!-- FEATURE PROMO -->
        ${featurePromoHtml}

        ${spacer()}

        <!-- FOOTER -->
        ${footerHtml}

      </table>

    </td>
  </tr>
</table>

${trackingHtml}
</body>
</html>`;
}
