export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      api_keys: {
        Row: {
          id: string
          key_hash: string
          name: string
          user_id: string
          created_at: string
          expires_at: string | null
          last_used_at: string | null
        }
        Insert: {
          id?: string
          key_hash: string
          name: string
          user_id: string
          created_at?: string
          expires_at?: string | null
          last_used_at?: string | null
        }
        Update: {
          id?: string
          key_hash?: string
          name?: string
          user_id?: string
          created_at?: string
          expires_at?: string | null
          last_used_at?: string | null
        }
      }
      tasks: {
        Row: {
          id: string
          status: string
          prompt: string
          context: string | null
          implementation: string | null
          error: Json | null
          token_usage: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          status: string
          prompt: string
          context?: string | null
          implementation?: string | null
          error?: Json | null
          token_usage?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          status?: string
          prompt?: string
          context?: string | null
          implementation?: string | null
          error?: Json | null
          token_usage?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      templates: {
        Row: {
          id: string
          name: string
          type: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
      }
      metrics: {
        Row: {
          id: string
          metric_type: string
          value: Json
          timestamp: string
        }
        Insert: {
          id?: string
          metric_type: string
          value: Json
          timestamp?: string
        }
        Update: {
          id?: string
          metric_type?: string
          value?: Json
          timestamp?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}