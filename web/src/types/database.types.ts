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
      articles: {
        Row: {
          abstract: string | null
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
          issn_electronic: string | null
          issn_print: string | null
          issue: string | null
          journal_abbr: string | null
          journal_title: string | null
          keywords: string[] | null
          language: string | null
          long_resume: string | null
          mesh_terms: Json
          news_value: number | null
          pico: Json | null
          pmc_id: string | null
          publication_types: string[] | null
          published_date: string | null
          published_year: number | null
          pubmed_date: string | null
          pubmed_id: string
          short_resume: string | null
          source_id: string | null
          specialty_tags: string[]
          subspecialty: string | null
          substances: Json
          title: string
          verified: boolean | null
          volume: string | null
        }
        Insert: {
          abstract?: string | null
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
          issn_electronic?: string | null
          issn_print?: string | null
          issue?: string | null
          journal_abbr?: string | null
          journal_title?: string | null
          keywords?: string[] | null
          language?: string | null
          long_resume?: string | null
          mesh_terms?: Json
          news_value?: number | null
          pico?: Json | null
          pmc_id?: string | null
          publication_types?: string[] | null
          published_date?: string | null
          published_year?: number | null
          pubmed_date?: string | null
          pubmed_id: string
          short_resume?: string | null
          source_id?: string | null
          specialty_tags?: string[]
          subspecialty?: string | null
          substances?: Json
          title: string
          verified?: boolean | null
          volume?: string | null
        }
        Update: {
          abstract?: string | null
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
          issn_electronic?: string | null
          issn_print?: string | null
          issue?: string | null
          journal_abbr?: string | null
          journal_title?: string | null
          keywords?: string[] | null
          language?: string | null
          long_resume?: string | null
          mesh_terms?: Json
          news_value?: number | null
          pico?: Json | null
          pmc_id?: string | null
          publication_types?: string[] | null
          published_date?: string | null
          published_year?: number | null
          pubmed_date?: string | null
          pubmed_id?: string
          short_resume?: string | null
          source_id?: string | null
          specialty_tags?: string[]
          subspecialty?: string | null
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
      lab_decisions: {
        Row: {
          id: string
          article_id: string | null
          specialty: string
          editor_verdict: string | null
          ai_verdict: string | null
          ai_confidence: number | null
          agreement: boolean | null
          disagreement_reason: string | null
          decided_at: string
        }
        Insert: {
          id?: string
          article_id?: string | null
          specialty: string
          editor_verdict?: string | null
          ai_verdict?: string | null
          ai_confidence?: number | null
          agreement?: boolean | null
          disagreement_reason?: string | null
          decided_at?: string
        }
        Update: {
          id?: string
          article_id?: string | null
          specialty?: string
          editor_verdict?: string | null
          ai_verdict?: string | null
          ai_confidence?: number | null
          agreement?: boolean | null
          disagreement_reason?: string | null
          decided_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_decisions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_2_sources: {
        Row: {
          id: string
          specialty: string
          type: string
          value: string
          description: string | null
          confidence_prior: number | null
          max_results: number | null
          active: boolean | null
          last_run_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          specialty: string
          type: string
          value: string
          description?: string | null
          confidence_prior?: number | null
          max_results?: number | null
          active?: boolean | null
          last_run_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          specialty?: string
          type?: string
          value?: string
          description?: string | null
          confidence_prior?: number | null
          max_results?: number | null
          active?: boolean | null
          last_run_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          articles_imported: number
          articles_skipped: number
          completed_at: string | null
          errors: Json | null
          filter_id: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          articles_imported?: number
          articles_skipped?: number
          completed_at?: string | null
          errors?: Json | null
          filter_id?: string | null
          id?: string
          started_at?: string
          status: string
        }
        Update: {
          articles_imported?: number
          articles_skipped?: number
          completed_at?: string | null
          errors?: Json | null
          filter_id?: string | null
          id?: string
          started_at?: string
          status?: string
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
          circle: number
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
          circle?: number
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
          circle?: number
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
      users: {
        Row: {
          created_at: string
          email: string
          email_format: string
          frequency: string
          id: string
          name: string
          notes: string
          onboarding_completed: boolean
          paused_until: string | null
          referral_code: string | null
          referred_by_id: string | null
          role: string
          source: string
          specialty_slugs: string[]
          status: string
          subscribed_at: string
          subspecialties: Json
          unsubscribe_token: string | null
          unsubscribed_at: string | null
          updated_at: string
          welcome_sent_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          email_format?: string
          frequency?: string
          id: string
          name?: string
          notes?: string
          onboarding_completed?: boolean
          paused_until?: string | null
          referral_code?: string | null
          referred_by_id?: string | null
          role?: string
          source?: string
          specialty_slugs?: string[]
          status?: string
          subscribed_at?: string
          subspecialties?: Json
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          welcome_sent_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          email_format?: string
          frequency?: string
          id?: string
          name?: string
          notes?: string
          onboarding_completed?: boolean
          paused_until?: string | null
          referral_code?: string | null
          referred_by_id?: string | null
          role?: string
          source?: string
          specialty_slugs?: string[]
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
      generate_referral_code: { Args: never; Returns: string }
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
