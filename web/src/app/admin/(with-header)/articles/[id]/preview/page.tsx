import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import PreviewLayout from '@/components/preview/PreviewLayout';
import type { PreviewData } from '@/components/preview/PreviewLayout';

export default async function ArticlePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin  = createAdminClient();

  const [articleRes, specialtiesRes, addressesRes] = await Promise.all([
    admin.from('articles').select('*').eq('id', id).maybeSingle(),
    admin.from('article_specialties')
      .select('specialty')
      .eq('article_id', id)
      .eq('specialty_match', true),
    admin.from('article_geo_addresses')
      .select('position, city, state, country, institution, department')
      .eq('article_id', id)
      .order('position', { ascending: true }),
  ]);

  if (!articleRes.data) notFound();

  const primaryAddrRaw = (addressesRes.data ?? [])[0] ?? null;
  type AddrRaw = { position: number; city: string | null; state: string | null; country: string | null; institution: string | null; department: string | null };

  // City geo lookup — try name then ascii_name
  let geoCoords: { latitude: number | null; longitude: number | null; countryCode: string | null } | null = null;
  if (primaryAddrRaw?.city && primaryAddrRaw?.country) {
    const { data: nameMatch } = await admin
      .from('geo_cities')
      .select('latitude, longitude, country_code')
      .ilike('country', (primaryAddrRaw as AddrRaw).country!)
      .ilike('name', (primaryAddrRaw as AddrRaw).city!)
      .order('population', { ascending: false })
      .limit(1)
      .maybeSingle();

    const cityRow = nameMatch ?? (await admin
      .from('geo_cities')
      .select('latitude, longitude, country_code')
      .ilike('country', (primaryAddrRaw as AddrRaw).country!)
      .ilike('ascii_name', (primaryAddrRaw as AddrRaw).city!)
      .order('population', { ascending: false })
      .limit(1)
      .maybeSingle()).data;

    if (cityRow) {
      geoCoords = {
        latitude:    cityRow.latitude,
        longitude:   cityRow.longitude,
        countryCode: cityRow.country_code?.toLowerCase() ?? null,
      };
    }
  }

  // Country code fallback
  let countryCode = geoCoords?.countryCode ?? null;
  if (!countryCode && (primaryAddrRaw as AddrRaw | null)?.country) {
    const { data } = await admin
      .from('geo_cities')
      .select('country_code')
      .ilike('country', (primaryAddrRaw as AddrRaw).country!)
      .limit(1)
      .maybeSingle();
    countryCode = data?.country_code?.toLowerCase() ?? null;
  }

  const primaryAddr = primaryAddrRaw ? {
    city:        (primaryAddrRaw as AddrRaw).city,
    country:     (primaryAddrRaw as AddrRaw).country,
    institution: (primaryAddrRaw as AddrRaw).institution,
    department:  (primaryAddrRaw as AddrRaw).department,
    state:       (primaryAddrRaw as AddrRaw).state,
  } : null;

  const previewData: PreviewData = {
    article:      articleRes.data as Record<string, unknown>,
    specialties:  (specialtiesRes.data ?? []).map(r => r.specialty),
    primaryAddress: primaryAddr,
    allAddresses: (addressesRes.data ?? []).map(r => ({ institution: (r as AddrRaw).institution })),
    geoCoords,
    countryCode,
  };

  return <PreviewLayout id={id} data={previewData} />;
}
