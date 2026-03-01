# PulseFeed — Gap Analysis
*Baseret på neuro-news v1 → pulsefeed v2 migration*
*Dato: 23. februar 2026*

---

## A. HVAD VIRKER I NEURO-NEWS ✅

Neuro-news er en production-ready platform med en gennemtestet pipeline. Disse dele skal porteres direkte til pulsefeed.

### Data Pipeline (Python)
| Script | Funktion | Status |
|--------|----------|--------|
| `fetch_articles.py` | PubMed → PostgreSQL via PubMed eUtils + Europe PMC citations | ✅ Virker |
| `enrich_articles.py` | Claude Haiku → summary, news_value (1-10), subspecialty, PICO | ✅ Virker |
| `fetch_impact_factors.py` | OpenAlex API → journal impact factors | ✅ Virker |
| `weekly_select.py` | Claude Haiku → AI ranking af top 25 artikler | ✅ Virker |
| `generate_newsletter.py` | Claude Sonnet → professionelt HTML email | ✅ Virker |

### Database Schema (Supabase/PostgreSQL)
- **`articles`** — 35+ kolonner inkl. AI-berigede felter (summary, news_value, subspecialty, PICO, clinical_relevance, article_type)
- **`journals`** — Journal metadata med impact factors (OpenAlex)
- **`weekly_selection`** — AI-ranking med rationale, selected_for_newsletter flag
- **`subscribers`** — UUID-baseret, status/source/notes, unsubscribe tracking

### Admin Dashboard (Next.js 16 + React 19)
- **Home metrics** — 7 KPI-kort (artikler, praksis-ændrende, IF≥5, subscribers, seneste import, seneste newsletter)
- **Weekly selection UI** — Vis 25 AI-rangerede artikler, vælg 5 til newsletter, enforcer max 5
- **Send workflow** — Test email → Send til alle subscribers med success/fail tracking
- **Browse** — Avanceret søgning med 8+ filtre (subspecialty, clinical_relevance, date, IF, open access)
- **Subscriber management** — CRUD, status toggle, CSV export

### Newsletter Format
- Table-based HTML med inline CSS (Outlook-kompatibel)
- Subspecialty farvekodede badges (8 farver)
- Impact factor badges (guld ≥5, sølv ≥3)
- News value som stjerne-rating (⭐ ud af 5)
- "Bottom line" callout box med 💡 praksis-indsigt
- Resend som email delivery service
- Individuel afsendelse (privacy — ingen BCC)

### Tech Stack (bevist i produktion)
- **Frontend**: Next.js 16.1.6, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Python 3, psycopg2, Anthropic SDK, dotenv
- **Database**: Supabase (PostgreSQL)
- **Email**: Resend
- **AI**: Claude Haiku (enrichment/ranking) + Claude Sonnet (HTML generation)
- **Data sources**: PubMed eUtils, Europe PMC, OpenAlex

---

## B. PROBLEMER AT FIXE I PULSEFEED ⚠️

### 1. Dårlig datakvalitet — ~70% irrelevante artikler
**Problem**: PubMed returnerer op til 200 artikler/uge, men mange er ikke klinisk relevante.
- Hardcoded MeSH query er for bred (inkluderer basic research, case reports med lav klinisk værdi)
- Ingen pre-filter på `news_value` før AI enrichment (spild af API-kald)
- `article_type = "Case report"` og `clinical_relevance = "Research only"` fylder listen

**Fix**:
- Pre-filter: Kræv structured abstract (`hasabstract`) + minimum journal quality signal
- Post-fetch filter: Kassér artikler med `news_value < 4` automatisk
- Bedre MeSH query pr. specialty med ekspert-validerede søgetermer
- Tilføj `is_relevant` boolean kolonne til at markere irrelevante artikler uden sletning

### 2. Kun neurosurgery — skal være multi-specialty
**Problem**: Hele systemet er hardkodet til neurosurgery:
- `fetch_articles.py` linje ~15-30: Hardcoded MeSH termer
- `enrich_articles.py`: Subspecialty-kategorierne er neurosurgery-specifikke
- Newsletter template og farver er neurosurgery-branded

**Fix**: Se sektion C (Multi-specialty feature)

### 3. Ingen personalisering
**Problem**: Alle subscribers modtager identisk newsletter uanset interesser.
- Ingen preference data gemt på subscribers
- Ingen subspecialty-filtrering pr. bruger
- Ingen read-tracking eller engagement data

**Fix**: Se sektion C (Preference center + personalisering)

### 4. Email design er kedeligt
**Problem**:
- Enkelt kolonne, ensartet layout for alle 5 artikler
- Mørk header-gradient ser generisk ud
- Ingen billeder/illustrationer
- Ingen "featured article" differentiering
- Footer mangler social proof og engagement hooks

**Fix**:
- Nyt responsive email design med featured top article
- Specialty-specifik branding pr. newsletter type
- Tilføj Open Graph billeder fra DOI/journal (hvor tilgængeligt)
- Forbedret footer med "Del med en kollega" (referral-link), feedback rating

### 5. Mangler analytics
**Problem**: Ingen data om email performance:
- Ingen åbningsrate tracking
- Ingen klik-tracking på artikellinks
- Ingen bounce/unsubscribe rate over tid
- Ingen artikel-popularitet data på tværs af subscribers

**Fix**:
- Resend webhook integration (open, click events)
- `newsletter_events` tabel: subscriber_id, newsletter_id, event_type, article_id, timestamp
- Analytics dashboard: Åbningsrate, klik pr. artikel, top subspecialties, retention kurve

---

## C. NYE FEATURES TIL PULSEFEED 🚀

### 1. Multi-Specialty Support
Arkitektur til at understøtte enhver medicinsk specialty:

**Database**:
```sql
specialties (
  id UUID PRIMARY KEY,
  slug VARCHAR UNIQUE,           -- 'neurosurgery', 'cardiology', 'oncology'
  name VARCHAR,                  -- "Neurosurgery"
  description TEXT,
  pubmed_query TEXT,             -- Specialty-specifik MeSH query
  subspecialties JSONB,          -- ["Oncology", "Vascular", "Spine", ...]
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP
)

articles.specialty_slug → FK til specialties
```

**Pipeline**:
- `fetch_articles.py` parameteriseres med `--specialty` flag
- Enrichment respekterer subspecialty-kategorier pr. specialty
- Separat weekly_selection pr. specialty

**Launch specialties (prioriteret)**:
1. Neurosurgery (port direkte fra neuro-news)
2. Cardiology
3. Oncology
4. Orthopaedics
5. Emergency Medicine

### 2. Onboarding Flow
Ny subscriber journey:

```
Landing page
  → Email input
  → Specialty valg (multi-select med ikoner)
  → Subspecialty interesser (optional, vises pr. valgt specialty)
  → Frekvens præference (weekly/bi-weekly/monthly)
  → Bekræftelsesmail med double opt-in
  → Welcome email med første "best of" digest
```

**Database**:
```sql
subscribers.onboarding_completed BOOLEAN
subscribers.specialty_slugs TEXT[]  -- ['neurosurgery', 'cardiology']
subscribers.subspecialties JSONB    -- {'neurosurgery': ['Spine', 'Oncology']}
subscribers.frequency VARCHAR       -- 'weekly' | 'biweekly' | 'monthly'
subscribers.welcome_sent_at TIMESTAMP
```

### 3. Preference Center
Self-service side til subscribers (`/preferences?token=...`):

- **Specialty toggles** — Tilføj/fjern specialties
- **Subspecialty checkboxes** — Granular interesse-kontrol
- **Frekvens** — Skift til bi-weekly/monthly
- **Email format** — Full digest vs. headlines-only
- **Pause** — "Tag en pause i X uger" (undgår unsubscribes)
- **Unsubscribe** — Med exit survey (1-click)

**Token-baseret auth** — UUID token i URL, ingen login krævet

### 4. Referral Program
Viral vækst-loop:

```sql
referrals (
  id UUID PRIMARY KEY,
  referrer_id UUID → subscribers,
  referred_email TEXT,
  referred_id UUID → subscribers NULL,
  referral_code VARCHAR UNIQUE,
  status VARCHAR,  -- 'pending' | 'confirmed' | 'rewarded'
  created_at TIMESTAMP,
  confirmed_at TIMESTAMP NULL
)
```

**Flow**:
- Unik referral-link i footer: `pulsefeed.dk/r/ABC123`
- 3 bekræftede referrals → "Supporter" badge i emailen
- 10 referrals → Tidlig adgang til nye specialties
- Monthly leaderboard i newsletter (top referrers)

**Metrics**: Referral rate, conversion rate, k-factor

### 5. Bedre Søgning og Filtering

**Browse-side forbedringer**:
- **Semantic search** — Embed abstracts med text-embedding-3-small, find "similar articles"
- **Saved filters** — Gem søgning som "alert" der mailer nye matches
- **Article collections** — Subscriber kan gemme artikler til personlig "reading list"
- **Citation graph** — Vis "articles that cite this" og "articles cited by this"

**API**:
```
GET /api/articles?q=&specialty=&subspecialty=&if_min=&date_from=&relevance=&type=
GET /api/articles/[id]/similar
POST /api/articles/[id]/save
GET /api/me/saved-articles
```

---

## D. TEKNISK ROADMAP 📋

### Week 1 — Core Funktionalitet (Port fra neuro-news)

**Mål**: Pulsefeed virker identisk med neuro-news for neurosurgery

| Opgave | Detaljer | Estimat |
|--------|----------|---------|
| Supabase setup | Opret projekt, opsæt schema (copy fra neuro-news) | 2t |
| Port Python scripts | Parameterisér fetch/enrich/select/generate med specialty config | 4t |
| Next.js scaffolding | Opret projekt, Tailwind, Supabase client, env vars | 2t |
| Database types | Generer TypeScript types fra Supabase schema | 1t |
| Home dashboard | Port metrics dashboard (7 KPI-kort) | 3t |
| Browse side | Port artikel-liste med filtre | 4t |
| Admin newsletter | Port weekly selection UI + send workflow | 4t |
| Admin subscribers | Port subscriber CRUD | 3t |
| Deployment | Vercel deploy + env vars + domæne | 2t |

**Deliverable**: Fungerende pulsefeed.dk med neurosurgery digest

---

### Week 2 — Fix Datakvalitet

**Mål**: Reducér irrelevante artikler fra ~70% til <20%

| Opgave | Detaljer | Estimat |
|--------|----------|---------|
| MeSH query audit | Gennemgå og forfin neurosurgery query med ekspert | 3t |
| Pre-fetch filter | `hasabstract + [pt]Journal Article` krav | 1t |
| Post-enrich filter | Auto-kassér `news_value < 4` fra newsletter-pool | 1t |
| `is_relevant` kolonne | Soft-delete irrelevante artikler, bevar i DB | 1t |
| Enrich prompt tuning | Forbedre Claude-prompt for mere præcis news_value scoring | 3t |
| Impact factor backfill | Kør `fetch_impact_factors.py` på eksisterende artikler | 1t |
| Quality metrics | Dashboard-widget: % relevant, gennemsnit news_value, IF distribution | 2t |

**Deliverable**: 80%+ relevante artikler i ugentlig pool

---

### Week 3 — Multi-Specialty Support

**Mål**: Tilføj Cardiology og Oncology som live specialties

| Opgave | Detaljer | Estimat |
|--------|----------|---------|
| `specialties` tabel | Schema + seed data (5 specialties, inactive) | 2t |
| Parameterisér pipeline | `--specialty` flag i alle Python scripts | 4t |
| Subspecialty config | JSONB subspecialties pr. specialty, opdater AI prompts | 3t |
| Specialty landing pages | `/[specialty]` route med branding og subscribe CTA | 4t |
| Multi-specialty browse | Filter på tværs af specialties, specialty-tabs | 3t |
| Cardiology MeSH query | Research + validér MeSH terms for cardiology | 3t |
| Oncology MeSH query | Research + validér MeSH terms for oncology | 3t |
| Specialty-specifik design | Email template farver/branding pr. specialty | 2t |

**Deliverable**: 3 aktive specialties med uafhængige pipelines

---

### Week 4 — Personalisering

**Mål**: Subscribers modtager relevant indhold baseret på præferencer

| Opgave | Detaljer | Estimat |
|--------|----------|---------|
| Subscriber preferences schema | `specialty_slugs`, `subspecialties`, `frequency` kolonner | 2t |
| Onboarding flow | Multi-step signup: email → specialty → subspecialty | 5t |
| Preference center | `/preferences` side med token-auth | 4t |
| Personaliseret email | Filtrer artikel-valg baseret på subscriber subspecialties | 4t |
| Analytics foundation | Resend webhooks, `newsletter_events` tabel | 3t |
| Analytics dashboard | Åbningsrate, klik pr. artikel, retention | 4t |
| Referral system | `referrals` tabel, unik kode pr. subscriber, footer link | 4t |

**Deliverable**: Personaliserede newsletters + grundlæggende analytics

---

## Teknisk Arkitektur — Pulsefeed v2

```
pulsefeed/
├── web/                          # Next.js 16 app
│   ├── app/
│   │   ├── [specialty]/          # /neurosurgery, /cardiology, ...
│   │   │   ├── page.tsx          # Specialty landing
│   │   │   └── browse/           # Specialty-filtered browse
│   │   ├── admin/
│   │   │   ├── page.tsx          # Newsletter admin
│   │   │   └── subscribers/      # Subscriber management
│   │   ├── preferences/          # Preference center (token-auth)
│   │   ├── r/[code]/             # Referral redirect
│   │   └── api/
│   │       ├── articles/
│   │       ├── subscribers/
│   │       ├── newsletter/
│   │       └── referrals/
│   ├── components/
│   │   ├── articles/
│   │   ├── admin/
│   │   ├── onboarding/
│   │   └── preferences/
│   └── lib/
│       ├── supabase.ts
│       ├── email.ts
│       └── types.ts              # Auto-generated fra Supabase
│
├── pipeline/                     # Python scripts (parameteriserede)
│   ├── fetch_articles.py         # --specialty flag
│   ├── enrich_articles.py        # --specialty flag
│   ├── fetch_impact_factors.py
│   ├── weekly_select.py          # --specialty flag
│   ├── generate_newsletter.py    # --specialty --subscriber-id (personaliseret)
│   └── config/
│       ├── neurosurgery.json     # MeSH query + subspecialties
│       ├── cardiology.json
│       └── oncology.json
│
└── GAP_ANALYSIS.md
```

---

## Dependency Oversigt

| Dependency | Nuværende (neuro-news) | Pulsefeed |
|-----------|----------------------|-----------|
| Next.js | 16.1.6 | 16.1.6 (samme) |
| React | 19.2.3 | 19.2.3 (samme) |
| Supabase | @supabase/supabase-js ^2.96 | Samme |
| Email | resend ^6.9.2 | Samme + webhooks |
| AI | @anthropic-ai/sdk ^0.76 | Samme |
| XML parsing | fast-xml-parser ^5.3.6 | Samme |
| Ny: Auth | — | @supabase/auth-helpers-nextjs |
| Ny: Analytics | — | Resend webhooks (built-in) |

---

## Kritiske Beslutninger der Skal Tages

1. **Domæne og branding** — Er "PulseFeed" det endelige navn? Påvirker email sender-adresse og SEO
2. **Mono-repo vs. separate repos** — Pipeline (Python) og Web (Next.js) i samme repo?
3. **Specialty launch-rækkefølge** — Neurosurgery first, eller launch 2-3 specialties samtidig?
4. **Personalisering model** — Filtrer eksisterende 25 artikler pr. subscriber, eller generer separate selections?
5. **Betalingsmodel** — Freemium (gratis basis, premium for multi-specialty)? Påvirker subscriber schema

---

*Kilde: Fuld kode-analyse af neuro-news (8 Python scripts, 15+ Next.js komponenter, 10+ API routes)*
