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
      battle_profiles: {
        Row: {
          battle_name: string | null
          created_at: string
          draws: number
          elo: number
          games_played: number
          id: string
          league: string
          losses: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          battle_name?: string | null
          created_at?: string
          draws?: number
          elo?: number
          games_played?: number
          id?: string
          league?: string
          losses?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          battle_name?: string | null
          created_at?: string
          draws?: number
          elo?: number
          games_played?: number
          id?: string
          league?: string
          losses?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      feature_usage: {
        Row: {
          count: number
          feature: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          feature: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          feature?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flashcard_reviews: {
        Row: {
          created_at: string
          ease_factor: number
          flashcard_id: string
          id: string
          interval_days: number
          last_reviewed_at: string | null
          next_review_at: string
          repetitions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ease_factor?: number
          flashcard_id: string
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          repetitions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ease_factor?: number
          flashcard_id?: string
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          repetitions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          created_at: string
          deck_name: string
          front_english: string
          front_french: string
          front_lari: string
          front_mandombe: string
          front_portuguese: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_name?: string
          front_english?: string
          front_french?: string
          front_lari?: string
          front_mandombe?: string
          front_portuguese?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_name?: string
          front_english?: string
          front_french?: string
          front_lari?: string
          front_mandombe?: string
          front_portuguese?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lifetime_unlocks: {
        Row: {
          amount_cents: number | null
          product: string
          purchased_at: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          product: string
          purchased_at?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          product?: string
          purchased_at?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          city: string | null
          country: string | null
          country_code: string | null
          device: string | null
          id: string
          page_path: string
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          visited_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          country_code?: string | null
          device?: string | null
          id?: string
          page_path: string
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          visited_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          country_code?: string | null
          device?: string | null
          id?: string
          page_path?: string
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          visited_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_premium: boolean
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_premium?: boolean
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_premium?: boolean
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      translation_corrections: {
        Row: {
          corrected_ipa: string | null
          corrected_mandombe: string | null
          corrected_translation: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          source_lang: string
          source_text: string
          target_lang: string
        }
        Insert: {
          corrected_ipa?: string | null
          corrected_mandombe?: string | null
          corrected_translation: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          source_lang: string
          source_text: string
          target_lang: string
        }
        Update: {
          corrected_ipa?: string | null
          corrected_mandombe?: string | null
          corrected_translation?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          source_lang?: string
          source_text?: string
          target_lang?: string
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
          role?: Database["public"]["Enums"]["app_role"]
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
      compute_league: { Args: { _elo: number }; Returns: string }
      has_lifetime_access: {
        Args: { _product: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_premium_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
