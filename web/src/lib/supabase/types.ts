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
          called_at: string | null
          completion_tokens: number
          cost_usd: number | null
          id: string
          model_key: string
          prompt_tokens: number
          total_tokens: number
        }
        Insert: {
          called_at?: string | null
          completion_tokens: number
          cost_usd?: number | null
          id?: string
          model_key: string
          prompt_tokens: number
          total_tokens: number
        }
        Update: {
          called_at?: string | null
          completion_tokens?: number
          cost_usd?: number | null
          id?: string
          model_key?: string
          prompt_tokens?: number
          total_tokens?: number
        }
        Relationships: []
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
      articles: {
        Row: {
          abstract: string | null
          ai_decision: string | null
          article_number: string | null
          authors: Json
          circle: number | null
          clinical_relevance: string | null
          coi_statement: string | null
          date_completed: string | null
          doi: string | null
          enriched_at: string | null
          grants: Json
          id: string
          imported_at: string
          indexed_month: number | null
          indexed_week: number | null
          indexed_year: number | null
          issn_electronic: string | null
          issn_print: string | null
          issue: string | null
          journal_abbr: string | null
          journal_title: string | null
          keywords: string[] | null
          language: string | null
          long_resume: string | null
          mesh_terms: Json
          model_version: string | null
          news_value: number | null
          pico: Json | null
          pmc_id: string | null
          publication_types: string[] | null
          published_date: string | null
          published_year: number | null
          pubmed_date: string | null
          pubmed_id: string
          pubmed_indexed_at: string | null
          short_resume: string | null
          source_id: string | null
          specialty_confidence: number | null
          specialty_scored_at: string | null
          specialty_tags: string[]
          status: string | null
          subspecialty: string | null
          subspecialty_ai: string | null
          article_type_ai: string | null
          study_design_ai: string | null
          classification_reason: string | null
          classification_scored_at: string | null
          classification_model_version: string | null
          substances: Json
          title: string
          fwci: number | null
          openalex_work_id: string | null
          verified: boolean | null
          volume: string | null
        }
        Insert: {
          abstract?: string | null
          ai_decision?: string | null
          article_number?: string | null
          authors?: Json
          circle?: number | null
          clinical_relevance?: string | null
          coi_statement?: string | null
          date_completed?: string | null
          doi?: string | null
          enriched_at?: string | null
          grants?: Json
          id?: string
          imported_at?: string
          indexed_month?: number | null
          indexed_week?: number | null
          indexed_year?: number | null
          issn_electronic?: string | null
          issn_print?: string | null
          issue?: string | null
          journal_abbr?: string | null
          journal_title?: string | null
          keywords?: string[] | null
          language?: string | null
          long_resume?: string | null
          mesh_terms?: Json
          model_version?: string | null
          news_value?: number | null
          pico?: Json | null
          pmc_id?: string | null
          publication_types?: string[] | null
          published_date?: string | null
          published_year?: number | null
          pubmed_date?: string | null
          pubmed_id: string
          pubmed_indexed_at?: string | null
          short_resume?: string | null
          source_id?: string | null
          specialty_confidence?: number | null
          specialty_scored_at?: string | null
          specialty_tags?: string[]
          status?: string | null
          subspecialty?: string | null
          subspecialty_ai?: string | null
          article_type_ai?: string | null
          study_design_ai?: string | null
          classification_reason?: string | null
          classification_scored_at?: string | null
          classification_model_version?: string | null
          fwci?: number | null
          openalex_work_id?: string | null
          substances?: Json
          title: string
          verified?: boolean | null
          volume?: string | null
        }
        Update: {
          abstract?: string | null
          ai_decision?: string | null
          article_number?: string | null
          authors?: Json
          circle?: number | null
          clinical_relevance?: string | null
          coi_statement?: string | null
          date_completed?: string | null
          doi?: string | null
          enriched_at?: string | null
          grants?: Json
          id?: string
          imported_at?: string
          indexed_month?: number | null
          indexed_week?: number | null
          indexed_year?: number | null
          issn_electronic?: string | null
          issn_print?: string | null
          issue?: string | null
          journal_abbr?: string | null
          journal_title?: string | null
          keywords?: string[] | null
          language?: string | null
          long_resume?: string | null
          mesh_terms?: Json
          model_version?: string | null
          news_value?: number | null
          pico?: Json | null
          pmc_id?: string | null
          publication_types?: string[] | null
          published_date?: string | null
          published_year?: number | null
          pubmed_date?: string | null
          pubmed_id?: string
          pubmed_indexed_at?: string | null
          short_resume?: string | null
          source_id?: string | null
          specialty_confidence?: number | null
          specialty_scored_at?: string | null
          specialty_tags?: string[]
          status?: string | null
          subspecialty?: string | null
          subspecialty_ai?: string | null
          article_type_ai?: string | null
          study_design_ai?: string | null
          classification_reason?: string | null
          classification_scored_at?: string | null
          classification_model_version?: string | null
          fwci?: number | null
          openalex_work_id?: string | null
          substances?: Json
          title?: string
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
      author_linking_logs: {
        Row: {
          articles_processed: number | null
          authors_linked: number | null
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
      authors: {
        Row: {
          affiliations: string[] | null
          article_count: number | null
          city: string | null
          country: string | null
          created_at: string | null
          department: string | null
          display_name: string
          hospital: string | null
          id: string
          match_confidence: number | null
          openalex_id: string | null
          orcid: string | null
          updated_at: string | null
        }
        Insert: {
          affiliations?: string[] | null
          article_count?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          department?: string | null
          display_name: string
          hospital?: string | null
          id?: string
          match_confidence?: number | null
          openalex_id?: string | null
          orcid?: string | null
          updated_at?: string | null
        }
        Update: {
          affiliations?: string[] | null
          article_count?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          department?: string | null
          display_name?: string
          hospital?: string | null
          id?: string
          match_confidence?: number | null
          openalex_id?: string | null
          orcid?: string | null
          updated_at?: string | null
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
      import_logs: {
        Row: {
          articles_fetched: number
          articles_imported: number
          articles_skipped: number
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
      lab_decisions: {
        Row: {
          ai_confidence: number | null
          ai_decision: string | null
          article_id: string | null
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
      model_versions: {
        Row: {
          activated_at: string | null
          active: boolean
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
      author_follows: {
        Row: {
          id: string
          user_id: string | null
          author_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          author_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          author_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "author_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_follows_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string | null
          type: string
          title: string
          message: string | null
          link: string | null
          read: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          type: string
          title: string
          message?: string | null
          link?: string | null
          read?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          type?: string
          title?: string
          message?: string | null
          link?: string | null
          read?: boolean | null
          created_at?: string | null
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
          id: string
          user_id: string | null
          name: string
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          created_at?: string | null
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
      reading_history: {
        Row: {
          id: string
          user_id: string | null
          article_id: string | null
          visited_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          article_id?: string | null
          visited_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          article_id?: string | null
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_history_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_articles: {
        Row: {
          id: string
          user_id: string | null
          article_id: string | null
          project_id: string | null
          saved_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          article_id?: string | null
          project_id?: string | null
          saved_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          article_id?: string | null
          project_id?: string | null
          saved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_articles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
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
      count_unlinked_articles: { Args: never; Returns: number }
      fetch_unlinked_articles: {
        Args: { p_limit: number; p_offset: number }
        Returns: {
          authors: Json
          id: string
          pubmed_id: string
        }[]
      }
      generate_referral_code: { Args: never; Returns: string }
      replace_article_specialty_tags: {
        Args: {
          p_article_id: string
          p_tags: string[]
          p_verified?: boolean
          p_status?: string
        }
        Returns: undefined
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
