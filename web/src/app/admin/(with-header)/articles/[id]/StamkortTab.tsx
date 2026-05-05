import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_SPECIALTY } from '@/lib/auth/specialties';
import StamkortHeader from './stamkort/StamkortHeader';
import StamkortHeadline from './stamkort/StamkortHeadline';
import StamkortScoring from './stamkort/StamkortScoring';
import StamkortSARI from './stamkort/StamkortSARI';
import StamkortResume from './stamkort/StamkortResume';
import StamkortMeshTerms from './stamkort/StamkortMeshTerms';
import StamkortBibliometri from './stamkort/StamkortBibliometri';
import StamkortPubmedDrawer from './stamkort/StamkortPubmedDrawer';
import type { MeshTerm } from './stamkort/StamkortMeshTerms';
import type { AuthorRow } from './stamkort/AuthorsModal';
import type { AddressRow } from './stamkort/AddressesModal';

interface Props {
  articleId: string;
}

function parseArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}'))
    return val.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean) as T[];
  return [];
}

export default async function StamkortTab({ articleId }: Props) {
  const admin = createAdminClient();

  const [articleRes, specialtiesRes, authorsRes, addressesRes] = await Promise.all([
    admin.from('articles').select('*').eq('id', articleId).maybeSingle(),
    admin.from('article_specialties')
      .select('specialty')
      .eq('article_id', articleId)
      .eq('specialty_match', true),
    admin.from('article_authors')
      .select('position, author_id, authors(display_name)')
      .eq('article_id', articleId)
      .order('position', { ascending: true }),
    admin.from('article_geo_addresses')
      .select('position, department, institution, city, state, country')
      .eq('article_id', articleId)
      .order('position', { ascending: true }),
  ]);

  const raw = (articleRes.data ?? {}) as Record<string, unknown>;

  const matchedSpecialties = (specialtiesRes.data ?? []).map(r => r.specialty as string);

  type AuthorRaw = { position: number | null; author_id: string; authors: { display_name: string } | null };
  const authorRows: AuthorRow[] = (authorsRes.data ?? []).map(r => {
    const a = r as unknown as AuthorRaw;
    return {
      position:    a.position ?? 0,
      authorId:    a.author_id ?? null,
      displayName: a.authors?.display_name ?? null,
    };
  });

  type AddrRaw = { position: number; department: string | null; institution: string | null; city: string | null; state: string | null; country: string | null };
  const addressRows: AddressRow[] = (addressesRes.data ?? []).map(r => {
    const a = r as unknown as AddrRaw;
    return {
      position:    a.position,
      department:  a.department,
      institution: a.institution,
      city:        a.city,
      state:       a.state,
      country:     a.country,
    };
  });

  const primaryCountry = addressRows[0]?.country ?? null;

  const subspecialties = parseArray<string>(raw.subspecialty);
  const meshTerms      = parseArray<MeshTerm>(raw.mesh_terms);

  return (
    <div style={{ padding: '4px 0 80px' }}>
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        marginBottom: '0',
      }}>
        <StamkortHeader
          specialties={matchedSpecialties}
          currentSpecialty={ACTIVE_SPECIALTY}
          subspecialties={subspecialties}
          primaryCountry={primaryCountry}
        />

        <StamkortHeadline
          articleType={raw.article_type as string | null}
          shortHeadline={raw.short_headline as string | null}
          title={raw.title as string | null}
          journalTitle={raw.journal_title as string | null}
          pubmedIndexedAt={raw.pubmed_indexed_at as string | null}
          pubmedId={raw.pubmed_id as string | null}
          authors={authorRows}
          addresses={addressRows}
        />

        <StamkortScoring scores={null} />

        <StamkortSARI
          subject={raw.sari_subject as string | null}
          action={raw.sari_action as string | null}
          result={raw.sari_result as string | null}
          implication={raw.sari_implication as string | null}
        />

        <StamkortResume
          shortResume={raw.short_resume as string | null}
          bottomLine={raw.bottom_line as string | null}
        />

        <StamkortMeshTerms meshTerms={meshTerms} />

        <StamkortBibliometri
          impactFactor={raw.impact_factor  as number | null}
          journalHIndex={raw.journal_h_index as number | null}
          citationCount={raw.citation_count as number | null}
          fwci={raw.fwci as number | null}
        />

        <div style={{ padding: '16px 0 12px' }}>
          <StamkortPubmedDrawer
            volume={raw.volume as string | null}
            issue={raw.issue as string | null}
            doi={raw.doi as string | null}
            meshTermsText={raw.mesh_terms_text as string | null}
            keywords={raw.keywords as string[] | null}
            grants={parseArray(raw.grants)}
            coiStatement={raw.coi_statement as string | null}
            substances={parseArray(raw.substances)}
            language={raw.language as string | null}
            publicationTypes={raw.publication_types as string[] | null}
            issnElectronic={raw.issn_electronic as string | null}
            issnPrint={raw.issn_print as string | null}
            articleNumber={raw.article_number as string | null}
          />
        </div>
      </div>
    </div>
  );
}
