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
          template_id: string | null
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
          template_id?: string | null
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
          template_id?: string | null
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
      token_efficiency_metrics: {
        Row: {
          template_id: string | null
          template_name: string
          template_type: string
          avg_tokens: number
          min_tokens: number
          max_tokens: number
          usage_count: number
          efficiency_ratio: number
          calculated_at: string
        }
      }
      token_metrics_timeseries: {
        Row: {
          day: string
          task_type: string
          task_count: number
          avg_tokens: number
          total_tokens: number
          templates_used: number
          day_over_day_efficiency: number | null
        }
      }
    }
    Functions: {
      refresh_token_efficiency_metrics: {
        Args: Record<PropertyKey, never>
        Returns: void
      }
    }
    Enums: {
      metric_type: 'token_usage' | 'template_usage' | 'efficiency_ratio' | 'task_complexity' | 'template_effectiveness' | 'rate_limit'
    }
  }
}