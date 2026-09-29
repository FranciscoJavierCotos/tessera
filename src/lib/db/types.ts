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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          properties: Json
          qualified_name: string
          tags: string[]
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          properties?: Json
          qualified_name: string
          tags?: string[]
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          properties?: Json
          qualified_name?: string
          tags?: string[]
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_entity_fk"
            columns: ["id", "workspace_id", "type"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id", "workspace_id", "type"]
          },
        ]
      }
      dataset_columns: {
        Row: {
          asset_id: string
          asset_kind: Database["public"]["Enums"]["asset_kind"]
          created_at: string
          data_type: string
          description: string
          id: string
          is_pii: boolean
          name: string
          ordinal: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asset_id: string
          asset_kind?: Database["public"]["Enums"]["asset_kind"]
          created_at?: string
          data_type?: string
          description?: string
          id?: string
          is_pii?: boolean
          name: string
          ordinal: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asset_id?: string
          asset_kind?: Database["public"]["Enums"]["asset_kind"]
          created_at?: string
          data_type?: string
          description?: string
          id?: string
          is_pii?: boolean
          name?: string
          ordinal?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataset_columns_asset_fk"
            columns: ["asset_id", "workspace_id", "asset_kind"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "workspace_id", "kind"]
          },
          {
            foreignKeyName: "dataset_columns_asset_fk"
            columns: ["asset_id", "workspace_id", "asset_kind"]
            isOneToOne: false
            referencedRelation: "catalog_assets"
            referencedColumns: ["id", "workspace_id", "kind"]
          },
        ]
      }
      entities: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          project_id: string | null
          title: string
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string
          project_id?: string | null
          title: string
          type: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          project_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_project_fk"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "entities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          created_at: string
          discipline: Database["public"]["Enums"]["discipline"] | null
          display_name: string | null
          handle: string | null
          id: string
          links: Json
          onboarded_at: string | null
          skills: string[]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          discipline?: Database["public"]["Enums"]["discipline"] | null
          display_name?: string | null
          handle?: string | null
          id: string
          links?: Json
          onboarded_at?: string | null
          skills?: string[]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          discipline?: Database["public"]["Enums"]["discipline"] | null
          display_name?: string | null
          handle?: string | null
          id?: string
          links?: Json
          onboarded_at?: string | null
          skills?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      project_assets: {
        Row: {
          added_at: string
          added_by: string | null
          asset_id: string
          project_id: string
          workspace_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          asset_id: string
          project_id: string
          workspace_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          asset_id?: string
          project_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assets_asset_fk"
            columns: ["asset_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_assets_asset_fk"
            columns: ["asset_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "catalog_assets"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_assets_project_fk"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          added_at?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          added_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_fk"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_workspace_member_fk"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["workspace_id", "user_id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string
          id: string
          slug: string
          status: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string
          id: string
          slug: string
          status?: Database["public"]["Enums"]["project_status"]
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string
          id?: string
          slug?: string
          status?: Database["public"]["Enums"]["project_status"]
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_entity_fk"
            columns: ["id", "workspace_id", "type"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id", "workspace_id", "type"]
          },
        ]
      }
      workspace_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      catalog_assets: {
        Row: {
          column_count: number | null
          created_at: string | null
          description: string | null
          id: string | null
          kind: Database["public"]["Enums"]["asset_kind"] | null
          name: string | null
          owner_handle: string | null
          owner_id: string | null
          owner_name: string | null
          pii_column_count: number | null
          project_ids: string[] | null
          properties: Json | null
          qualified_name: string | null
          tags: string[] | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invite: { Args: { token: string }; Returns: string }
      accept_pending_invite: { Args: { invite_id: string }; Returns: string }
      create_asset: {
        Args: {
          columns?: Json
          description?: string
          kind: Database["public"]["Enums"]["asset_kind"]
          name: string
          owner?: string
          properties?: Json
          qualified_name: string
          tags?: string[]
          workspace: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          properties: Json
          qualified_name: string
          tags: string[]
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_project: {
        Args: {
          description?: string
          is_private?: boolean
          name: string
          slug: string
          status?: Database["public"]["Enums"]["project_status"]
          workspace: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          description: string
          id: string
          slug: string
          status: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace: {
        Args: { name: string; slug: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invite_preview: {
        Args: { token: string }
        Returns: {
          email_matches: boolean
          expires_at: string
          invited_by_name: string
          is_member: boolean
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      is_handle_available: { Args: { handle: string }; Returns: boolean }
      my_pending_invites: {
        Args: never
        Returns: {
          expires_at: string
          id: string
          invited_by_name: string
          role: Database["public"]["Enums"]["workspace_role"]
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      set_dataset_columns: {
        Args: { asset: string; columns: Json }
        Returns: {
          asset_id: string
          asset_kind: Database["public"]["Enums"]["asset_kind"]
          created_at: string
          data_type: string
          description: string
          id: string
          is_pii: boolean
          name: string
          ordinal: number
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "dataset_columns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_asset: {
        Args: {
          asset: string
          columns?: Json
          description: string
          name: string
          owner: string
          properties: Json
          qualified_name: string
          tags: string[]
        }
        Returns: {
          created_at: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          properties: Json
          qualified_name: string
          tags: string[]
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_project: {
        Args: {
          description: string
          is_private: boolean
          name: string
          project: string
          slug: string
          status: Database["public"]["Enums"]["project_status"]
        }
        Returns: {
          archived_at: string | null
          created_at: string
          description: string
          id: string
          slug: string
          status: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      asset_kind: "dataset" | "dashboard" | "source_system" | "ml_model"
      discipline:
        | "data_analyst"
        | "data_scientist"
        | "data_engineer"
        | "analytics_engineer"
        | "lead"
      entity_type: "project" | "asset" | "page"
      project_role: "lead" | "contributor" | "viewer"
      project_status: "planning" | "active" | "paused" | "done"
      visibility: "private" | "project" | "workspace"
      workspace_role: "owner" | "admin" | "member" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      asset_kind: ["dataset", "dashboard", "source_system", "ml_model"],
      discipline: [
        "data_analyst",
        "data_scientist",
        "data_engineer",
        "analytics_engineer",
        "lead",
      ],
      entity_type: ["project", "asset", "page"],
      project_role: ["lead", "contributor", "viewer"],
      project_status: ["planning", "active", "paused", "done"],
      visibility: ["private", "project", "workspace"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
