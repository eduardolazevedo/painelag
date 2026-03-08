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
      audit_log: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      demographic_weights: {
        Row: {
          category: string
          census_proportion: number
          dimension: string
          id: string
          panel_proportion: number | null
          reference_source: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          category: string
          census_proportion: number
          dimension: string
          id?: string
          panel_proportion?: number | null
          reference_source?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          category?: string
          census_proportion?: number
          dimension?: string
          id?: string
          panel_proportion?: number | null
          reference_source?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_year: number | null
          created_at: string
          display_name: string | null
          education_level: string | null
          gender: string | null
          id: string
          income_bracket: string | null
          municipality: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          birth_year?: number | null
          created_at?: string
          display_name?: string | null
          education_level?: string | null
          gender?: string | null
          id?: string
          income_bracket?: string | null
          municipality?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          birth_year?: number | null
          created_at?: string
          display_name?: string | null
          education_level?: string | null
          gender?: string | null
          id?: string
          income_bracket?: string | null
          municipality?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_options: {
        Row: {
          display_order: number
          id: string
          option_text: string
          question_id: string
          value: string | null
        }
        Insert: {
          display_order?: number
          id?: string
          option_text: string
          question_id: string
          value?: string | null
        }
        Update: {
          display_order?: number
          id?: string
          option_text?: string
          question_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          config: Json | null
          created_at: string
          display_order: number
          id: string
          is_required: boolean | null
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
          survey_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean | null
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
          survey_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean | null
          question_text?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      response_answers: {
        Row: {
          answered_at: string
          id: string
          numeric_value: number | null
          question_id: string
          ranking_order: string[] | null
          response_id: string
          selected_option_id: string | null
          selected_option_ids: string[] | null
          text_value: string | null
        }
        Insert: {
          answered_at?: string
          id?: string
          numeric_value?: number | null
          question_id: string
          ranking_order?: string[] | null
          response_id: string
          selected_option_id?: string | null
          selected_option_ids?: string[] | null
          text_value?: string | null
        }
        Update: {
          answered_at?: string
          id?: string
          numeric_value?: number | null
          question_id?: string
          ranking_order?: string[] | null
          response_id?: string
          selected_option_id?: string | null
          selected_option_ids?: string[] | null
          text_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "response_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          completed_at: string | null
          duration_seconds: number | null
          id: string
          is_valid: boolean | null
          quality_flags: string[] | null
          quality_score: number | null
          started_at: string
          survey_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          duration_seconds?: number | null
          id?: string
          is_valid?: boolean | null
          quality_flags?: string[] | null
          quality_score?: number | null
          started_at?: string
          survey_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          duration_seconds?: number | null
          id?: string
          is_valid?: boolean | null
          quality_flags?: string[] | null
          quality_score?: number | null
          started_at?: string
          survey_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_quotas: {
        Row: {
          category: string
          created_at: string
          current_count: number
          dimension: string
          id: string
          is_closed: boolean
          survey_id: string
          target_count: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          current_count?: number
          dimension: string
          id?: string
          is_closed?: boolean
          survey_id: string
          target_count: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          current_count?: number
          dimension?: string
          id?: string
          is_closed?: boolean
          survey_id?: string
          target_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_quotas_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_suggestions: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          status: string | null
          title: string
          upvotes: number | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string | null
          title: string
          upvotes?: number | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string | null
          title?: string
          upvotes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      surveys: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          estimated_duration_minutes: number | null
          id: string
          is_public_results: boolean | null
          minimum_duration_seconds: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["survey_status"]
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_public_results?: boolean | null
          minimum_duration_seconds?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["survey_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_public_results?: boolean | null
          minimum_duration_seconds?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["survey_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_raking_weights: {
        Args: {
          p_convergence_threshold?: number
          p_max_iterations?: number
          p_max_weight?: number
          p_survey_id: string
        }
        Returns: Json
      }
      calculate_response_quality: {
        Args: { p_response_id: string }
        Returns: Json
      }
      check_and_update_quota: {
        Args: { p_survey_id: string; p_user_id: string }
        Returns: Json
      }
      cross_tabulate: {
        Args: {
          p_dimension: string
          p_question_id: string
          p_survey_id: string
          p_weights?: Json
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "analyst" | "panelist"
      question_type:
        | "multiple_choice_single"
        | "multiple_choice_multiple"
        | "likert"
        | "nps"
        | "ranking"
        | "open_text"
      survey_status: "draft" | "active" | "closed" | "archived"
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
    Enums: {
      app_role: ["admin", "editor", "analyst", "panelist"],
      question_type: [
        "multiple_choice_single",
        "multiple_choice_multiple",
        "likert",
        "nps",
        "ranking",
        "open_text",
      ],
      survey_status: ["draft", "active", "closed", "archived"],
    },
  },
} as const
