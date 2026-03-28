export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_usage: {
        Row: {
          article_id: string | null
          called_at: string | null
          completion_tokens: number
          cost_usd: number | null
          id: string
          model_key: string
          prompt_tokens: number
          task: string | null
          total_tokens: number
        }
        Insert: {
          article_id?: string | null
          called_at?: string | null
          completion_tokens: number
          cost_usd?: number | null
          id?: string
          model_key: string
          prompt_tokens: number
          task?: string | null
          total_tokens: number
        }
        Update: {
          article_id?: string | null
          called_at?: string | null
          completion_tokens?: number
          cost_usd?: number | null
          id?: string
          model_key?: string
          prompt_tokens?: number
          task?: string | null
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_authors: {
        Row: {
          article_id: string
          author_id: string
          is_corresponding: boolean | null
          orcid_on_paper: string | null
          position: number | null
        }
        Insert: {
          article_id: string
          author_id: string
          is_corresponding?: boolean | null
          orcid_on_paper?: string | null
          position?: number | null
        }
        Update: {
          article_id?: string
          author_id?: string
          is_corresponding?: boolean | null
          orcid_on_paper?: string | null
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "article_authors_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_authors_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
      article_events: {
        Row: {
          article_id: string
          created_at: string | null
          event_type: string
          id: string
          payload: Json
          sequence: number
        }
        Insert: {
          article_id: string
          created_at?: string | null
          event_type: string
          id?: string
          payload?: Json
          sequence?: number
        }
        Update: {
          article_id?: string
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_events_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_type_categories: {
        Row: {
          active: boolean | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      article_type_rules: {
        Row: {
          article_type: string
          created_at: string
          id: string
          is_active: boolean
          publication_type: string
          updated_at: string
        }
        Insert: {
          article_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          publication_type: string
          updated_at?: string
        }
        Update: {
          article_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          publication_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          abstract: string | null
          ai_decision: string | null
          ai_location_attempted: boolean | null
          approval_method: string | null
          article_cities: string[] | null
          article_countries: string[] | null
          article_institutions: string[] | null
          article_number: string | null
          article_regions: string[] | null
          article_type_ai: string | null
          article_type_confidence: number | null
          article_type_method: string | null
          article_type_model_version: string | null
          article_type_rationale: string | null
          article_type_scored_at: string | null
          article_type_validated: boolean | null
          authors: Json
          auto_tagged_at: string | null
          bottom_line: string | null
          circle: number | null
          citation_count: number | null
          citations_fetched_at: string | null
          classification_model_version: string | null
          classification_reason: string | null
          classification_scored_at: string | null
          clinical_relevance: string | null
          coi_statement: string | null
          condensed_at: string | null
          condensed_model_version: string | null
          country: string | null
          date_completed: string | null
          doi: string | null
          enriched_at: string | null
          evidence_score: number | null
          first_author_city: string | null
          first_author_country: string | null
          first_author_department: string | null
          first_author_institution: string | null
          first_author_region: string | null
          full_text_available: boolean | null
          fwci: number | null
          geo_city: string | null
          geo_city_certain: boolean | null
          geo_continent: string | null
          geo_country: string | null
          geo_country_certain: boolean | null
          geo_institution: string | null
          geo_institution_certain: boolean | null
          geo_region: string | null
          geo_state: string | null
          geo_state_certain: boolean | null
          geographic_region: string | null
          grants: Json
          id: string
          impact_factor: number | null
          impact_factor_fetched_at: string | null
          imported_at: string
          indexed_date: string | null
          indexed_month: number | null
          indexed_week: number | null
          indexed_year: number | null
          issn_electronic: string | null
          issn_print: string | null
          issue: string | null
          journal_abbr: string | null
          journal_h_index: number | null
          journal_title: string | null
          keywords: string[] | null
          language: string | null
          last_author_city: string | null
          last_author_country: string | null
          last_author_department: string | null
          last_author_institution: string | null
          last_author_region: string | null
          location_confidence: string | null
          location_parsed_at: string | null
          long_resume: string | null
          mesh_terms: Json
          mesh_terms_text: string | null
          model_version: string | null
          news_value: number | null
          openalex_work_id: string | null
          patient_population: string | null
          pico: Json | null
          pico_comparison: string | null
          pico_intervention: string | null
          pico_outcome: string | null
          pico_population: string | null
          pmc_id: string | null
          publication_types: string[] | null
          published_date: string | null
          published_year: number | null
          pubmed_date: string | null
          pubmed_id: string
          pubmed_indexed_at: string | null
          sample_size: number | null
          short_headline: string | null
          short_resume: string | null
          source_id: string | null
          specialty_confidence: number | null
          specialty_reasoning: string | null
          specialty_scored_at: string | null
          specialty_tags: string[]
          status: string | null
          study_design_ai: string[] | null
          subspecialty: string | null
          subspecialty_ai: string[] | null
          substances: Json
          time_to_read: number | null
          title: string
          trial_registration: string | null
          verified: boolean | null
          volume: string | null
        }
        Insert: {
          abstract?: string | null
          ai_decision?: string | null
          ai_location_attempted?: boolean | null
          approval_method?: string | null
          article_cities?: string[] | null
          article_countries?: string[] | null
          article_institutions?: string[] | null
          article_number?: string | null
          article_regions?: string[] | null
          article_type_ai?: string | null
          article_type_confidence?: number | null
          article_type_method?: string | null
          article_type_model_version?: string | null
          article_type_rationale?: string | null
          article_type_scored_at?: string | null
          article_type_validated?: boolean | null
          authors?: Json
          auto_tagged_at?: string | null
          bottom_line?: string | null
          circle?: number | null
          citation_count?: number | null
          citations_fetched_at?: string | null
          classification_model_version?: string | null
          classification_reason?: string | null
          classification_scored_at?: string | null
          clinical_relevance?: string | null
          coi_statement?: string | null
          condensed_at?: string | null
          condensed_model_version?: string | null
          country?: string | null
          date_completed?: string | null
          doi?: string | null
          enriched_at?: string | null
          evidence_score?: number | null
          first_author_city?: string | null
          first_author_country?: string | null
          first_author_department?: string | null
          first_author_institution?: string | null
          first_author_region?: string | null
          full_text_available?: boolean | null
          fwci?: number | null
          geo_city?: string | null
          geo_city_certain?: boolean | null
          geo_continent?: string | null
          geo_country?: string | null
          geo_country_certain?: boolean | null
          geo_institution?: string | null
          geo_institution_certain?: boolean | null
          geo_region?: string | null
          geo_state?: string | null
          geo_state_certain?: boolean | null
          geographic_region?: string | null
          grants?: Json
          id?: string
          impact_factor?: number | null
          impact_factor_fetched_at?: string | null
          imported_at?: string
          indexed_date?: string | null
          indexed_month?: number | null
          indexed_week?: number | null
          indexed_year?: number | null
          issn_electronic?: string | null
          issn_print?: string | null
          issue?: string | null
          journal_abbr?: string | null
          journal_h_index?: number | null
          journal_title?: string | null
          keywords?: string[] | null
          language?: string | null
          last_author_city?: string | null
          last_author_country?: string | null
          last_author_department?: string | null
          last_author_institution?: string | null
          last_author_region?: string | null
          location_confidence?: string | null
          location_parsed_at?: string | null
          long_resume?: string | null
          mesh_terms?: Json
          mesh_terms_text?: string | null
          model_version?: string | null
          news_value?: number | null
          openalex_work_id?: string | null
          patient_population?: string | null
          pico?: Json | null
          pico_comparison?: string | null
          pico_intervention?: string | null
          pico_outcome?: string | null
          pico_population?: string | null
          pmc_id?: string | null
          publication_types?: string[] | null
          published_date?: string | null
          published_year?: number | null
          pubmed_date?: string | null
          pubmed_id: string
          pubmed_indexed_at?: string | null
          sample_size?: number | null
          short_headline?: string | null
          short_resume?: string | null
          source_id?: string | null
          specialty_confidence?: number | null
          specialty_reasoning?: string | null
          specialty_scored_at?: string | null
          specialty_tags?: string[]
          status?: string | null
          study_design_ai?: string[] | null
          subspecialty?: string | null
          subspecialty_ai?: string[] | null
          substances?: Json
          time_to_read?: number | null
          title: string
          trial_registration?: string | null
          verified?: boolean | null
          volume?: string | null
        }
        Update: {
          abstract?: string | null
          ai_decision?: string | null
          ai_location_attempted?: boolean | null
          approval_method?: string | null
          article_cities?: string[] | null
          article_countries?: string[] | null
          article_institutions?: string[] | null
          article_number?: string | null
          article_regions?: string[] | null
          article_type_ai?: string | null
          article_type_confidence?: number | null
          article_type_method?: string | null
          article_type_model_version?: string | null
          article_type_rationale?: string | null
          article_type_scored_at?: string | null
          article_type_validated?: boolean | null
          authors?: Json
          auto_tagged_at?: string | null
          bottom_line?: string | null
          circle?: number | null
          citation_count?: number | null
          citations_fetched_at?: string | null
          classification_model_version?: string | null
          classification_reason?: string | null
          classification_scored_at?: string | null
          clinical_relevance?: string | null
          coi_statement?: string | null
          condensed_at?: string | null
          condensed_model_version?: string | null
          country?: string | null
          date_completed?: string | null
          doi?: string | null
          enriched_at?: string | null
          evidence_score?: number | null
          first_author_city?: string | null
          first_author_country?: string | null
          first_author_department?: string | null
          first_author_institution?: string | null
          first_author_region?: string | null
          full_text_available?: boolean | null
          fwci?: number | null
          geo_city?: string | null
          geo_city_certain?: boolean | null
          geo_continent?: string | null
          geo_country?: string | null
          geo_country_certain?: boolean | null
          geo_institution?: string | null
          geo_institution_certain?: boolean | null
          geo_region?: string | null
          geo_state?: string | null
          geo_state_certain?: boolean | null
          geographic_region?: string | null
          grants?: Json
          id?: string
          impact_factor?: number | null
          impact_factor_fetched_at?: string | null
          imported_at?: string
          indexed_date?: string | null
          indexed_month?: number | null
          indexed_week?: number | null
          indexed_year?: number | null
          issn_electronic?: string | null
          issn_print?: string | null
          issue?: string | null
          journal_abbr?: string | null
          journal_h_index?: number | null
          journal_title?: string | null
          keywords?: string[] | null
          language?: string | null
          last_author_city?: string | null
          last_author_country?: string | null
          last_author_department?: string | null
          last_author_institution?: string | null
          last_author_region?: string | null
          location_confidence?: string | null
          location_parsed_at?: string | null
          long_resume?: string | null
          mesh_terms?: Json
          mesh_terms_text?: string | null
          model_version?: string | null
          news_value?: number | null
          openalex_work_id?: string | null
          patient_population?: string | null
          pico?: Json | null
          pico_comparison?: string | null
          pico_intervention?: string | null
          pico_outcome?: string | null
          pico_population?: string | null
          pmc_id?: string | null
          publication_types?: string[] | null
          published_date?: string | null
          published_year?: number | null
          pubmed_date?: string | null
          pubmed_id?: string
          pubmed_indexed_at?: string | null
          sample_size?: number | null
          short_headline?: string | null
          short_resume?: string | null
          source_id?: string | null
          specialty_confidence?: number | null
          specialty_reasoning?: string | null
          specialty_scored_at?: string | null
          specialty_tags?: string[]
          status?: string | null
          study_design_ai?: string[] | null
          subspecialty?: string | null
          subspecialty_ai?: string[] | null
          substances?: Json
          time_to_read?: number | null
          title?: string
          trial_registration?: string | null
          verified?: boolean | null
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "circle_2_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      author_events: {
        Row: {
          author_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          sequence: number
        }
        Insert: {
          author_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          sequence?: number
        }
        Update: {
          author_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "author_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
      author_follows: {
        Row: {
          author_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "author_follows_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      author_linking_logs: {
        Row: {
          articles_processed: number | null
          authors_linked: number | null
          authors_processed: number
          completed_at: string | null
          duplicates: number
          errors: Json | null
          id: string
          import_log_id: string | null
          new_authors: number
          rejected: number
          started_at: string | null
          status: string | null
        }
        Insert: {
          articles_processed?: number | null
          authors_linked?: number | null
          authors_processed?: number
          completed_at?: string | null
          duplicates?: number
          errors?: Json | null
          id?: string
          import_log_id?: string | null
          new_authors?: number
          rejected?: number
          started_at?: string | null
          status?: string | null
        }
        Update: {
          articles_processed?: number | null
          authors_linked?: number | null
          authors_processed?: number
          completed_at?: string | null
          duplicates?: number
          errors?: Json | null
          id?: string
          import_log_id?: string | null
          new_authors?: number
          rejected?: number
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "author_linking_logs_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      author_merge_log: {
        Row: {
          created_at: string
          deleted_author_ids: string[]
          id: string
          merged_by_user_id: string
          primary_author_id: string
          resolved_fields: Json
        }
        Insert: {
          created_at?: string
          deleted_author_ids: string[]
          id?: string
          merged_by_user_id: string
          primary_author_id: string
          resolved_fields?: Json
        }
        Update: {
          created_at?: string
          deleted_author_ids?: string[]
          id?: string
          merged_by_user_id?: string
          primary_author_id?: string
          resolved_fields?: Json
        }
        Relationships: [
          {
            foreignKeyName: "author_merge_log_merged_by_user_id_fkey"
            columns: ["merged_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          affiliations: string[] | null
          ai_geo_parsed: boolean | null
          article_count: number | null
          author_score: number | null
          city: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          department: string | null
          display_name: string
          display_name_normalized: string | null
          email: string | null
          first_article_date: string | null
          geo_source: string | null
          hospital: string | null
          id: string
          institution_type: string | null
          last_article_date: string | null
          match_confidence: number | null
          openalex_author_id: string | null
          openalex_enriched_at: string | null
          openalex_id: string | null
          orcid: string | null
          orcid_enriched_at: string | null
          ror_enriched_at: string | null
          ror_id: string | null
          state: string | null
          updated_at: string | null
          verified_by: string | null
        }
        Insert: {
          affiliations?: string[] | null
          ai_geo_parsed?: boolean | null
          article_count?: number | null
          author_score?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          department?: string | null
          display_name: string
          display_name_normalized?: string | null
          email?: string | null
          first_article_date?: string | null
          geo_source?: string | null
          hospital?: string | null
          id?: string
          institution_type?: string | null
          last_article_date?: string | null
          match_confidence?: number | null
          openalex_author_id?: string | null
          openalex_enriched_at?: string | null
          openalex_id?: string | null
          orcid?: string | null
          orcid_enriched_at?: string | null
          ror_enriched_at?: string | null
          ror_id?: string | null
          state?: string | null
          updated_at?: string | null
          verified_by?: string | null
        }
        Update: {
          affiliations?: string[] | null
          ai_geo_parsed?: boolean | null
          article_count?: number | null
          author_score?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          department?: string | null
          display_name?: string
          display_name_normalized?: string | null
          email?: string | null
          first_article_date?: string | null
          geo_source?: string | null
          hospital?: string | null
          id?: string
          institution_type?: string | null
          last_article_date?: string | null
          match_confidence?: number | null
          openalex_author_id?: string | null
          openalex_enriched_at?: string | null
          openalex_id?: string | null
          orcid?: string | null
          orcid_enriched_at?: string | null
          ror_enriched_at?: string | null
          ror_id?: string | null
          state?: string | null
          updated_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      circle_2_sources: {
        Row: {
          active: boolean | null
          confidence_prior: number | null
          created_at: string | null
          description: string | null
          id: string
          last_run_at: string | null
          max_results: number | null
          specialty: string
          type: string
          value: string
        }
        Insert: {
          active?: boolean | null
          confidence_prior?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          max_results?: number | null
          specialty: string
          type: string
          value: string
        }
        Update: {
          active?: boolean | null
          confidence_prior?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          max_results?: number | null
          specialty?: string
          type?: string
          value?: string
        }
        Relationships: []
      }
      circle_3_sources: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          last_run_at: string | null
          max_results: number
          specialty: string
          type: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          last_run_at?: string | null
          max_results?: number
          specialty?: string
          type?: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          last_run_at?: string | null
          max_results?: number
          specialty?: string
          type?: string
          value?: string
        }
        Relationships: []
      }
      city_aliases: {
        Row: {
          alias: string
          canonical: string
          created_at: string
          id: string
        }
        Insert: {
          alias: string
          canonical: string
          created_at?: string
          id?: string
        }
        Update: {
          alias?: string
          canonical?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      country_aliases: {
        Row: {
          alias: string
          canonical: string
          created_at: string
          id: string
        }
        Insert: {
          alias: string
          canonical: string
          created_at?: string
          id?: string
        }
        Update: {
          alias?: string
          canonical?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      geo_cities: {
        Row: {
          admin1_code: string | null
          ascii_name: string | null
          country: string | null
          country_code: string
          geonameid: number
          latitude: number | null
          longitude: number | null
          name: string
          population: number | null
          state: string | null
        }
        Insert: {
          admin1_code?: string | null
          ascii_name?: string | null
          country?: string | null
          country_code: string
          geonameid: number
          latitude?: number | null
          longitude?: number | null
          name: string
          population?: number | null
          state?: string | null
        }
        Update: {
          admin1_code?: string | null
          ascii_name?: string | null
          country?: string | null
          country_code?: string
          geonameid?: number
          latitude?: number | null
          longitude?: number | null
          name?: string
          population?: number | null
          state?: string | null
        }
        Relationships: []
      }
      geo_city_state_cache: {
        Row: {
          city: string
          country: string
          id: string
          looked_up_at: string | null
          source: string | null
          state: string | null
        }
        Insert: {
          city: string
          country: string
          id?: string
          looked_up_at?: string | null
          source?: string | null
          state?: string | null
        }
        Update: {
          city?: string
          country?: string
          id?: string
          looked_up_at?: string | null
          source?: string | null
          state?: string | null
        }
        Relationships: []
      }
      geo_institution_overrides: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          id: string
          institution: string | null
          raw_segment: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          institution?: string | null
          raw_segment: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          institution?: string | null
          raw_segment?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          articles_fetched: number
          articles_imported: number
          articles_skipped: number
          author_slots_imported: number
          circle: number | null
          completed_at: string | null
          errors: Json | null
          filter_id: string | null
          id: string
          started_at: string
          status: string
          trigger: string | null
        }
        Insert: {
          articles_fetched?: number
          articles_imported?: number
          articles_skipped?: number
          author_slots_imported?: number
          circle?: number | null
          completed_at?: string | null
          errors?: Json | null
          filter_id?: string | null
          id?: string
          started_at?: string
          status: string
          trigger?: string | null
        }
        Update: {
          articles_fetched?: number
          articles_imported?: number
          articles_skipped?: number
          author_slots_imported?: number
          circle?: number | null
          completed_at?: string | null
          errors?: Json | null
          filter_id?: string | null
          id?: string
          started_at?: string
          status?: string
          trigger?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_filter_id_fkey"
            columns: ["filter_id"]
            isOneToOne: false
            referencedRelation: "pubmed_filters"
            referencedColumns: ["id"]
          },
        ]
      }
      import_quality_checks: {
        Row: {
          check_type: string | null
          checks: Json
          created_at: string | null
          failed_checks: number
          id: string
          import_log_id: string | null
          passed: boolean
          total_checks: number
        }
        Insert: {
          check_type?: string | null
          checks?: Json
          created_at?: string | null
          failed_checks?: number
          id?: string
          import_log_id?: string | null
          passed?: boolean
          total_checks?: number
        }
        Update: {
          check_type?: string | null
          checks?: Json
          created_at?: string | null
          failed_checks?: number
          id?: string
          import_log_id?: string | null
          passed?: boolean
          total_checks?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_quality_checks_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_decisions: {
        Row: {
          ai_confidence: number | null
          ai_decision: string | null
          article_id: string | null
          author_id: string | null
          decided_at: string | null
          decision: string
          disagreement_reason: string | null
          id: string
          model_version: string | null
          module: string
          session_id: string | null
          specialty: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_decision?: string | null
          article_id?: string | null
          author_id?: string | null
          decided_at?: string | null
          decision: string
          disagreement_reason?: string | null
          id?: string
          model_version?: string | null
          module: string
          session_id?: string | null
          specialty: string
        }
        Update: {
          ai_confidence?: number | null
          ai_decision?: string | null
          article_id?: string | null
          author_id?: string | null
          decided_at?: string | null
          decision?: string
          disagreement_reason?: string | null
          id?: string
          model_version?: string | null
          module?: string
          session_id?: string | null
          specialty?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_decisions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_decisions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_decisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lab_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_sessions: {
        Row: {
          articles_approved: number | null
          articles_rejected: number | null
          articles_reviewed: number | null
          completed_at: string | null
          id: string
          module: string
          specialty: string
          started_at: string | null
          user_id: string | null
        }
        Insert: {
          articles_approved?: number | null
          articles_rejected?: number | null
          articles_reviewed?: number | null
          completed_at?: string | null
          id?: string
          module: string
          specialty: string
          started_at?: string | null
          user_id?: string | null
        }
        Update: {
          articles_approved?: number | null
          articles_rejected?: number | null
          articles_reviewed?: number | null
          completed_at?: string | null
          id?: string
          module?: string
          specialty?: string
          started_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      model_optimization_runs: {
        Row: {
          base_version: string
          created_at: string | null
          fn_count: number | null
          fn_patterns: Json | null
          fp_count: number | null
          fp_patterns: Json | null
          id: string
          improved_prompt: string | null
          module: string
          recommended_changes: string | null
          refinement_iterations: Json | null
          specialty: string
          total_decisions: number | null
        }
        Insert: {
          base_version: string
          created_at?: string | null
          fn_count?: number | null
          fn_patterns?: Json | null
          fp_count?: number | null
          fp_patterns?: Json | null
          id?: string
          improved_prompt?: string | null
          module: string
          recommended_changes?: string | null
          refinement_iterations?: Json | null
          specialty: string
          total_decisions?: number | null
        }
        Update: {
          base_version?: string
          created_at?: string | null
          fn_count?: number | null
          fn_patterns?: Json | null
          fp_count?: number | null
          fp_patterns?: Json | null
          id?: string
          improved_prompt?: string | null
          module?: string
          recommended_changes?: string | null
          refinement_iterations?: Json | null
          specialty?: string
          total_decisions?: number | null
        }
        Relationships: []
      }
      model_versions: {
        Row: {
          activated_at: string | null
          active: boolean
          base_prompt_text: string | null
          generated_by: string
          id: string
          module: string
          notes: string | null
          prompt_text: string
          specialty: string
          version: string
        }
        Insert: {
          activated_at?: string | null
          active?: boolean
          base_prompt_text?: string | null
          generated_by?: string
          id?: string
          module: string
          notes?: string | null
          prompt_text: string
          specialty: string
          version: string
        }
        Update: {
          activated_at?: string | null
          active?: boolean
          base_prompt_text?: string | null
          generated_by?: string
          id?: string
          module?: string
          notes?: string | null
          prompt_text?: string
          specialty?: string
          version?: string
        }
        Relationships: []
      }
      newsletter_feedback: {
        Row: {
          article_id: string | null
          article_rank: number | null
          article_type: string | null
          clinical_relevance: string | null
          decided_at: string | null
          decision: string | null
          id: string
          impact_factor: number | null
          news_value: number | null
          week_number: number
          year: number
        }
        Insert: {
          article_id?: string | null
          article_rank?: number | null
          article_type?: string | null
          clinical_relevance?: string | null
          decided_at?: string | null
          decision?: string | null
          id?: string
          impact_factor?: number | null
          news_value?: number | null
          week_number: number
          year: number
        }
        Update: {
          article_id?: string | null
          article_rank?: number | null
          article_type?: string | null
          clinical_relevance?: string | null
          decided_at?: string | null
          decision?: string | null
          id?: string
          impact_factor?: number | null
          news_value?: number | null
          week_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          link: string | null
          message: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_type_rules: {
        Row: {
          active: boolean | null
          article_type: string | null
          created_at: string | null
          id: string
          pubmed_type: string
          study_design: string | null
        }
        Insert: {
          active?: boolean | null
          article_type?: string | null
          created_at?: string | null
          id?: string
          pubmed_type: string
          study_design?: string | null
        }
        Update: {
          active?: boolean | null
          article_type?: string | null
          created_at?: string | null
          id?: string
          pubmed_type?: string
          study_design?: string | null
        }
        Relationships: []
      }
      pubmed_filters: {
        Row: {
          active: boolean
          circle: number | null
          created_at: string
          id: string
          journal_list: string[] | null
          last_run_at: string | null
          max_results: number
          name: string
          query_string: string
          specialty: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          circle?: number | null
          created_at?: string
          id?: string
          journal_list?: string[] | null
          last_run_at?: string | null
          max_results?: number
          name: string
          query_string: string
          specialty: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          circle?: number | null
          created_at?: string
          id?: string
          journal_list?: string[] | null
          last_run_at?: string | null
          max_results?: number
          name?: string
          query_string?: string
          specialty?: string
          updated_at?: string
        }
        Relationships: []
      }
      reading_history: {
        Row: {
          article_id: string | null
          id: string
          user_id: string | null
          visited_at: string | null
        }
        Insert: {
          article_id?: string | null
          id?: string
          user_id?: string | null
          visited_at?: string | null
        }
        Update: {
          article_id?: string | null
          id?: string
          user_id?: string | null
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_history_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rejected_authors: {
        Row: {
          article_id: string | null
          created_at: string | null
          id: string
          linking_log_id: string | null
          position: number | null
          pubmed_id: string | null
          raw_data: Json | null
          reason: string | null
        }
        Insert: {
          article_id?: string | null
          created_at?: string | null
          id?: string
          linking_log_id?: string | null
          position?: number | null
          pubmed_id?: string | null
          raw_data?: Json | null
          reason?: string | null
        }
        Update: {
          article_id?: string | null
          created_at?: string | null
          id?: string
          linking_log_id?: string | null
          position?: number | null
          pubmed_id?: string | null
          raw_data?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rejected_authors_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejected_authors_linking_log_id_fkey"
            columns: ["linking_log_id"]
            isOneToOne: false
            referencedRelation: "author_linking_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_articles: {
        Row: {
          article_id: string | null
          id: string
          project_id: string | null
          saved_at: string | null
          user_id: string | null
        }
        Insert: {
          article_id?: string | null
          id?: string
          project_id?: string | null
          saved_at?: string | null
          user_id?: string | null
        }
        Update: {
          article_id?: string | null
          id?: string
          project_id?: string | null
          saved_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_articles_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_articles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_articles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      study_design_categories: {
        Row: {
          active: boolean | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          active: boolean | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          message: string
          title: string
          type: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message: string
          title: string
          type?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          title?: string
          type?: string | null
        }
        Relationships: []
      }
      tagging_rule_combos: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          approve_rate: number
          approved: number
          created_at: string
          id: string
          min_decisions: number
          rejected: number
          source_count: number
          specialty: string
          status: string
          term_1: string
          term_2: string
          total_decisions: number
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          approve_rate?: number
          approved?: number
          created_at?: string
          id?: string
          min_decisions?: number
          rejected?: number
          source_count?: number
          specialty: string
          status?: string
          term_1: string
          term_2: string
          total_decisions?: number
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          approve_rate?: number
          approved?: number
          created_at?: string
          id?: string
          min_decisions?: number
          rejected?: number
          source_count?: number
          specialty?: string
          status?: string
          term_1?: string
          term_2?: string
          total_decisions?: number
          updated_at?: string
        }
        Relationships: []
      }
      tagging_rules: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          approve_rate: number
          approved: number
          created_at: string
          id: string
          min_decisions: number
          rejected: number
          source_count: number
          specialty: string
          status: string
          term: string
          total_decisions: number
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          approve_rate?: number
          approved?: number
          created_at?: string
          id?: string
          min_decisions?: number
          rejected?: number
          source_count?: number
          specialty: string
          status?: string
          term: string
          total_decisions?: number
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          approve_rate?: number
          approved?: number
          created_at?: string
          id?: string
          min_decisions?: number
          rejected?: number
          source_count?: number
          specialty?: string
          status?: string
          term?: string
          total_decisions?: number
          updated_at?: string
        }
        Relationships: []
      }
      unsubscribe_log: {
        Row: {
          email: string
          id: string
          ip_address: string | null
          resubscribed_at: string | null
          unsubscribed_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          email: string
          id?: string
          ip_address?: string | null
          resubscribed_at?: string | null
          unsubscribed_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          email?: string
          id?: string
          ip_address?: string | null
          resubscribed_at?: string | null
          unsubscribed_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unsubscribe_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_keywords: {
        Row: {
          created_at: string
          id: string
          keyword: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          keyword: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          keyword?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_keywords_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          author_id: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          department: string | null
          email: string
          email_format: string
          email_notifications: boolean | null
          first_name: string | null
          frequency: string
          hospital: string | null
          id: string
          is_public: boolean | null
          last_name: string | null
          name: string
          notes: string
          onboarding_completed: boolean
          paused_until: string | null
          referral_code: string | null
          referred_by_id: string | null
          role: string
          role_type: string | null
          source: string
          specialty_slugs: string[]
          state: string | null
          status: string
          subscribed_at: string
          subspecialties: Json
          title: string | null
          unsubscribe_token: string | null
          unsubscribed_at: string | null
          updated_at: string
          welcome_sent_at: string | null
        }
        Insert: {
          author_id?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email: string
          email_format?: string
          email_notifications?: boolean | null
          first_name?: string | null
          frequency?: string
          hospital?: string | null
          id: string
          is_public?: boolean | null
          last_name?: string | null
          name?: string
          notes?: string
          onboarding_completed?: boolean
          paused_until?: string | null
          referral_code?: string | null
          referred_by_id?: string | null
          role?: string
          role_type?: string | null
          source?: string
          specialty_slugs?: string[]
          state?: string | null
          status?: string
          subscribed_at?: string
          subspecialties?: Json
          title?: string | null
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          welcome_sent_at?: string | null
        }
        Update: {
          author_id?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string
          email_format?: string
          email_notifications?: boolean | null
          first_name?: string | null
          frequency?: string
          hospital?: string | null
          id?: string
          is_public?: boolean | null
          last_name?: string | null
          name?: string
          notes?: string
          onboarding_completed?: boolean
          paused_until?: string | null
          referral_code?: string | null
          referred_by_id?: string | null
          role?: string
          role_type?: string | null
          source?: string
          specialty_slugs?: string[]
          state?: string | null
          status?: string
          subscribed_at?: string
          subspecialties?: Json
          title?: string | null
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          welcome_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_referred_by_id_fkey"
            columns: ["referred_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_author_scores: { Args: never; Returns: undefined }
      count_article_type_not_validated: { Args: never; Returns: number }
      count_classification_not_validated: {
        Args: { p_specialty: string }
        Returns: number
      }
      count_condensation_not_validated: {
        Args: { p_specialty: string }
        Returns: number
      }
      count_pico_not_validated: {
        Args: { p_specialty: string }
        Returns: number
      }
      count_scored_not_validated: {
        Args: { p_specialty: string }
        Returns: number
      }
      count_unlinked_articles: { Args: never; Returns: number }
      count_unlinked_author_slots: { Args: never; Returns: number }
      fetch_unlinked_articles: {
        Args: { p_limit: number; p_offset: number }
        Returns: {
          authors: Json
          doi: string
          id: string
          pubmed_id: string
        }[]
      }
      find_author_duplicates:
        | {
            Args: {
              p_country?: string
              p_exact_lastname?: boolean
              p_exclude_countries?: string[]
              p_last_name_chars?: number
              p_match_city?: boolean
              p_match_country?: boolean
              p_match_firstname_initial?: boolean
              p_match_hospital?: boolean
              p_match_state?: boolean
              p_max_group_size?: number
            }
            Returns: {
              author_ids: string[]
              display_names: string[]
              group_size: number
            }[]
          }
        | {
            Args: {
              p_exclude_countries?: string[]
              p_last_name_chars?: number
              p_match_city?: boolean
              p_match_country?: boolean
              p_match_hospital?: boolean
              p_match_state?: boolean
              p_max_group_size?: number
            }
            Returns: {
              author_ids: string[]
              display_names: string[]
              group_size: number
            }[]
          }
      generate_referral_code: { Args: never; Returns: string }
      get_article_type_not_validated_articles: {
        Args: { p_limit?: number }
        Returns: {
          abstract: string
          article_type_ai: string
          article_type_confidence: number
          article_type_model_version: string
          article_type_rationale: string
          authors: Json
          circle: number
          id: string
          journal_abbr: string
          journal_title: string
          mesh_terms: Json
          publication_types: string[]
          published_date: string
          pubmed_id: string
          title: string
        }[]
      }
      get_author_verification_stats: {
        Args: never
        Returns: {
          human: number
          uverificeret: number
        }[]
      }
      get_authors_city_not_in_geonames: {
        Args: { p_limit?: number }
        Returns: {
          affiliations: string[]
          article_count: number
          city: string
          country: string
          department: string
          display_name: string
          hospital: string
          id: string
          state: string
        }[]
      }
      get_authors_affiliation_too_long: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
        }[]
      }
      get_classification_not_validated_articles: {
        Args: { p_limit?: number; p_specialty: string }
        Returns: {
          abstract: string
          article_type_ai: string
          authors: Json
          circle: number
          classification_model_version: string
          classification_reason: string
          id: string
          journal_abbr: string
          journal_title: string
          published_date: string
          pubmed_id: string
          study_design_ai: string
          subspecialty_ai: string
          title: string
        }[]
      }
      get_combo_article_counts: {
        Args: { p_specialty: string }
        Returns: {
          co_occurrences: number
          pending_count: number
          term_1: string
          term_2: string
        }[]
      }
      get_combo_pending_articles: {
        Args: { p_specialty: string }
        Returns: {
          id: string
          journal_abbr: string
          matched_combos: Json
          published_date: string
          title: string
        }[]
      }
      get_condensation_not_validated_articles: {
        Args: { p_limit?: number; p_specialty: string }
        Returns: {
          abstract: string
          authors: Json
          bottom_line: string
          circle: number
          condensed_model_version: string
          id: string
          journal_abbr: string
          journal_title: string
          pico_comparison: string
          pico_intervention: string
          pico_outcome: string
          pico_population: string
          published_date: string
          pubmed_id: string
          sample_size: number
          short_headline: string
          short_resume: string
          title: string
        }[]
      }
      get_distinct_specialty_tags: {
        Args: never
        Returns: {
          tag: string
        }[]
      }
      get_geo_articles: {
        Args: { p_city?: string; p_since?: string }
        Returns: {
          id: string
          journal_abbr: string
          published_date: string
          title: string
        }[]
      }
      get_geo_articles_week: {
        Args: { p_city: string; p_since: string }
        Returns: {
          id: string
          journal_abbr: string
          published_date: string
          title: string
        }[]
      }
      get_geo_cities:
        | {
            Args: { p_country?: string; p_since?: string }
            Returns: {
              city: string
              count: number
            }[]
          }
        | {
            Args: { p_country?: string; p_since?: string; p_state?: string }
            Returns: {
              city: string
              count: number
            }[]
          }
      get_geo_cities_week: {
        Args: { p_country: string; p_since: string }
        Returns: {
          city: string
          count: number
        }[]
      }
      get_geo_continents: {
        Args: { p_since?: string }
        Returns: {
          continent: string
          count: number
        }[]
      }
      get_geo_countries: {
        Args: { p_region?: string; p_since?: string }
        Returns: {
          count: number
          country: string
        }[]
      }
      get_geo_countries_week: {
        Args: { p_since: string }
        Returns: {
          count: number
          country: string
          region: string
        }[]
      }
      get_geo_regions: {
        Args: { p_continent?: string; p_since?: string }
        Returns: {
          count: number
          region: string
        }[]
      }
      get_geo_regions_week: {
        Args: { p_since: string }
        Returns: {
          count: number
          region: string
        }[]
      }
      get_geo_states: {
        Args: { p_country?: string; p_since?: string }
        Returns: {
          count: number
          state: string
        }[]
      }
      get_kpi_geo_hierarchy: {
        Args: {
          p_city?: string
          p_continent?: string
          p_country?: string
          p_period: string
          p_region?: string
          p_subspecialty?: string
        }
        Returns: Json
      }
      get_kpi_overview: {
        Args: { p_period: string; p_subspecialty?: string }
        Returns: Json
      }
      get_mesh_co_occurrences: {
        Args: { p_min_count: number; p_specialty: string }
        Returns: {
          pair_count: number
          term_1: string
          term_2: string
        }[]
      }
      get_pico_not_validated_articles: {
        Args: { p_limit?: number; p_specialty: string }
        Returns: {
          abstract: string
          authors: Json
          condensed_model_version: string
          id: string
          journal_abbr: string
          journal_title: string
          pico_comparison: string
          pico_intervention: string
          pico_outcome: string
          pico_population: string
          published_date: string
          pubmed_id: string
          sample_size: number
          title: string
        }[]
      }
      get_scored_not_validated_articles: {
        Args: { p_limit?: number; p_specialty: string }
        Returns: {
          abstract: string
          ai_decision: string
          authors: Json
          circle: number
          id: string
          journal_abbr: string
          journal_title: string
          published_date: string
          pubmed_id: string
          specialty_confidence: number
          title: string
        }[]
      }
      get_single_borderline_articles: {
        Args: { p_specialty: string }
        Returns: {
          article_id: string
          journal_abbr: string
          matched_terms: Json
          published_date: string
          title: string
        }[]
      }
      get_single_ready_articles: {
        Args: { p_specialty: string }
        Returns: {
          article_id: string
          journal_abbr: string
          matched_terms: Json
          published_date: string
          title: string
        }[]
      }
      get_specialty_article_stats: {
        Args: { specialty_slug: string }
        Returns: {
          antal: number
          circle: number
          status: string
        }[]
      }
      get_tagging_kpis: { Args: { p_specialty: string }; Returns: Json }
      get_top_subspecialties: {
        Args: { p_limit?: number }
        Returns: {
          count: number
          tag: string
        }[]
      }
      merge_author_duplicates_geo: {
        Args: never
        Returns: {
          duplicates_merged: number
          group_name: string
          primary_id: string
        }[]
      }
      merge_author_duplicates_orcid: {
        Args: never
        Returns: {
          duplicates_merged: number
          group_name: string
          primary_id: string
        }[]
      }
      merge_authors: {
        Args: { p_master_id: string; p_slave_ids: string[] }
        Returns: undefined
      }
      merge_authors_user: {
        Args: {
          p_primary_id: string
          p_resolved_fields?: Json
          p_slave_ids: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      recalculate_tagging_rule_combos: {
        Args: { p_include_c1?: boolean; p_specialty: string }
        Returns: undefined
      }
      recalculate_tagging_rules:
        | { Args: { p_specialty: string }; Returns: undefined }
        | {
            Args: { p_include_c1?: boolean; p_specialty: string }
            Returns: undefined
          }
      replace_article_specialty_tags: {
        Args: {
          p_article_id: string
          p_status?: string
          p_tags: string[]
          p_verified?: boolean
        }
        Returns: undefined
      }
      run_exact_dupe_cleanup: {
        Args: never
        Returns: {
          authors_deleted: number
          pairs_merged: number
        }[]
      }
      search_articles_by_mesh: { Args: { p_term: string }; Returns: string[] }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
      unlinked_author_slots_for_import_logs: {
        Args: { p_ids: string[] }
        Returns: {
          import_log_id: string
          slots: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
