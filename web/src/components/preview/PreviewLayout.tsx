import Link from 'next/link';
import { C, F, EYEBROW, countryToIso2 } from './tokens';
import PreviewHeader  from './Header';
import Score          from './Score';
import Geo            from './Geo';
import Authors        from './Authors';
import Sari           from './Sari';
import EditorResume   from './EditorResume';
import Abstract       from './Abstract';
import MeshTerms      from './MeshTerms';
import PubMedMetadata from './PubMedMetadata';
import { ACTIVE_SPECIALTY } from '@/lib/auth/specialties';

interface AuthorRaw { lastName?: string; foreName?: string; orcid?: string | null }
interface MeshTerm  { descriptor?: string; major?: boolean; qualifiers?: string[] }

function castArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export interface PreviewData {
  article:         Record<string, unknown>;
  specialties:     string[];
  primaryAddress: {
    city:        string | null;
    country:     string | null;
    institution: string | null;
    department:  string | null;
    state:       string | null;
  } | null;
  allAddresses:    { institution: string | null }[];
  geoCoords:       { latitude: number | null; longitude: number | null; countryCode: string | null } | null;
  countryCode:     string | null;
}

interface Props {
  id:   string;
  data: PreviewData;
}

export default function PreviewLayout({ id, data }: Props) {
  const a = data.article;
  const r = (k: string) => a[k] as unknown;

  const shortHeadline = r('short_headline') as string | null;
  const title         = r('title')         as string | null;
  const headline      = shortHeadline ?? title ?? '—';
  const originalTitle = shortHeadline ? title : null; // only show PubMed line if short_headline was used

  const authors    = castArr<AuthorRaw>(r('authors'));
  const meshTerms  = castArr<MeshTerm>(r('mesh_terms'));
  const subspecialties = castArr<string>(r('subspecialty'));

  const primaryAddr = data.primaryAddress;
  const countryCode = data.countryCode;
  const iso2        = countryToIso2(primaryAddr?.country ?? null) ?? countryCode;

  // Distinct institution count from all addresses
  const institutions = Array.from(new Set(
    data.allAddresses.map(a => a.institution).filter(Boolean)
  ));

  const leadOrcid = authors[0]?.orcid ?? null;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: F.sans }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 3rem' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <Link href={`/admin/articles/${id}`} style={{ fontSize: '12px', color: C.sec, textDecoration: 'none', fontFamily: F.sans }}>
            ← Edit in admin
          </Link>
          <span style={{ ...EYEBROW(C.red), fontSize: '10px' }}>Editorial preview</span>
        </div>

        {/* 1. Header */}
        <PreviewHeader
          specialty={data.specialties[0] ?? ACTIVE_SPECIALTY}
          articleType={r('article_type') as string | null}
          subspecialties={subspecialties}
          headline={headline}
          originalTitle={originalTitle}
          journalAbbr={r('journal_abbr') as string | null}
          publishedDate={r('published_date') as string | null}
          pubmedId={r('pubmed_id') as string | null}
          primaryCountry={primaryAddr?.country ?? null}
        />

        {/* 2. Score */}
        <Score />

        {/* 3. Geo */}
        <Geo
          city={primaryAddr?.city ?? null}
          country={primaryAddr?.country ?? null}
          countryCode={iso2}
          institution={primaryAddr?.institution ?? null}
          latitude={data.geoCoords?.latitude ?? null}
          longitude={data.geoCoords?.longitude ?? null}
          institutionCount={institutions.length}
          leadOrcid={leadOrcid}
        />

        {/* 4. Authors */}
        <Authors authors={authors} />

        {/* 5. SARI */}
        <Sari
          subject={r('sari_subject')     as string | null}
          action={r('sari_action')       as string | null}
          result={r('sari_result')       as string | null}
          implication={r('sari_implication') as string | null}
        />

        {/* 6. Editor's resume */}
        <EditorResume
          shortResume={r('short_resume') as string | null}
          bottomLine={r('bottom_line')   as string | null}
        />

        {/* 7. Abstract */}
        <Abstract
          abstract={r('abstract')             as string | null}
          fullTextAvailable={!!(r('full_text_available'))}
          pmcId={r('pmc_id')                  as string | null}
        />

        {/* 8. MeSH terms */}
        <MeshTerms meshTerms={meshTerms} />

        {/* 9. PubMed metadata */}
        <PubMedMetadata
          pubmedId={r('pubmed_id')             as string | null}
          doi={r('doi')                        as string | null}
          pmcId={r('pmc_id')                   as string | null}
          fullTextAvail={r('full_text_available') as boolean | null}
          volume={r('volume')                  as string | null}
          issue={r('issue')                    as string | null}
          articleNumber={r('article_number')   as string | null}
          issnElectronic={r('issn_electronic') as string | null}
          issnPrint={r('issn_print')           as string | null}
          language={r('language')              as string | null}
          publicationTypes={r('publication_types') as string[] | null}
          retracted={r('retracted')            as boolean | null}
          publishedDate={r('published_date')   as string | null}
          pubmedIndexedAt={r('pubmed_indexed_at') as string | null}
          dateCompleted={r('date_completed')   as string | null}
          pubmedModifiedAt={r('pubmed_modified_at') as string | null}
          impactFactor={r('impact_factor')     as number | null}
          journalHIndex={r('journal_h_index')  as number | null}
          citationCount={r('citation_count')   as number | null}
          fwci={r('fwci')                      as number | null}
          sampleSize={r('sample_size')         as number | null}
          patientPop={r('patient_population')  as string | null}
          trialReg={r('trial_registration')    as string | null}
          timeToRead={r('time_to_read')        as number | null}
          keywords={r('keywords')              as string[] | null}
          grants={castArr(r('grants'))}
          substances={castArr(r('substances'))}
          coiStatement={r('coi_statement')     as string | null}
        />

      </div>
    </div>
  );
}
