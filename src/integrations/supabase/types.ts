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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      loan_officers: {
        Row: {
          branch: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          user_id: string
        }
        Insert: {
          branch?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          user_id: string
        }
        Update: {
          branch?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          amount: number
          created_at: string
          daily_repayment_amount: number | null
          disbursement_date: string | null
          duration: number
          id: string
          interest: number
          officer_id: string
          outstanding_balance: number
          status: string
          total_with_interest: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          daily_repayment_amount?: number | null
          disbursement_date?: string | null
          duration: number
          id?: string
          interest?: number
          officer_id: string
          outstanding_balance?: number
          status?: string
          total_with_interest?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          daily_repayment_amount?: number | null
          disbursement_date?: string | null
          duration?: number
          id?: string
          interest?: number
          officer_id?: string
          outstanding_balance?: number
          status?: string
          total_with_interest?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "loan_officers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      repayment_schedules: {
        Row: {
          actual_amount: number | null
          created_at: string
          due_date: string
          expected_amount: number
          id: string
          loan_id: string
          paid_date: string | null
          status: string
        }
        Insert: {
          actual_amount?: number | null
          created_at?: string
          due_date: string
          expected_amount?: number
          id?: string
          loan_id: string
          paid_date?: string | null
          status?: string
        }
        Update: {
          actual_amount?: number | null
          created_at?: string
          due_date?: string
          expected_amount?: number
          id?: string
          loan_id?: string
          paid_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "repayment_schedules_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          loan_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          id?: string
          loan_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          loan_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      calculate_officer_risk_score: {
        Args: { _officer_id: string }
        Returns: number
      }
      generate_repayment_schedule: {
        Args: {
          _duration_days: number
          _loan_id: string
          _start_date: string
          _total_amount: number
        }
        Returns: undefined
      }
      get_officer_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_officer_for_loan: {
        Args: { _loan_id: string; _user_id: string }
        Returns: boolean
      }
      is_officer_for_transaction: {
        Args: { _txn_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "loan_officer" | "staff"
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
      app_role: ["super_admin", "loan_officer", "staff"],
    },
  },
} as const
