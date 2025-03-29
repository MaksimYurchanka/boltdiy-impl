import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface EfficiencyMetrics {
  templateId: string | null;
  templateName: string | null;
  templateType: string;
  avgTokens: number;
  minTokens: number;
  maxTokens: number;
  usageCount: number;
  efficiencyRatio: number;
  calculatedAt: string;
}

export interface TimeseriesMetrics {
  day: string;
  taskType: string;
  taskCount: number;
  avgTokens: number;
  totalTokens: number;
  templatesUsed: number;
  dayOverDayEfficiency: number | null;
}

export class TokenMetricsService {
  constructor(
    private readonly supabase: SupabaseClient<Database>
  ) {}

  async recordTokenUsage(
    taskId: string,
    tokenUsage: TokenUsage,
    templateId?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('metrics')
      .insert({
        metric_type: 'token_usage',
        value: {
          taskId,
          templateId,
          ...tokenUsage,
          timestamp: new Date().toISOString()
        }
      });

    if (error) {
      throw new Error(`Failed to record token usage: ${error.message}`);
    }

    // Update task with token usage
    const { error: updateError } = await this.supabase
      .from('tasks')
      .update({ token_usage: tokenUsage })
      .eq('id', taskId);

    if (updateError) {
      throw new Error(`Failed to update task token usage: ${updateError.message}`);
    }
  }

  async getEfficiencyMetrics(
    templateType?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<EfficiencyMetrics[]> {
    let query = this.supabase
      .from('token_efficiency_metrics')
      .select('*');

    if (templateType) {
      query = query.eq('template_type', templateType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch efficiency metrics: ${error.message}`);
    }

    return data.map(metric => ({
      templateId: metric.template_id,
      templateName: metric.template_name,
      templateType: metric.template_type,
      avgTokens: metric.avg_tokens,
      minTokens: metric.min_tokens,
      maxTokens: metric.max_tokens,
      usageCount: metric.usage_count,
      efficiencyRatio: metric.efficiency_ratio,
      calculatedAt: metric.calculated_at
    }));
  }

  async getTimeseriesMetrics(
    startDate: Date,
    endDate: Date,
    taskType?: string
  ): Promise<TimeseriesMetrics[]> {
    let query = this.supabase
      .from('token_metrics_timeseries')
      .select('*')
      .gte('day', startDate.toISOString())
      .lte('day', endDate.toISOString());

    if (taskType) {
      query = query.eq('task_type', taskType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch timeseries metrics: ${error.message}`);
    }

    return data.map(metric => ({
      day: metric.day,
      taskType: metric.task_type,
      taskCount: metric.task_count,
      avgTokens: metric.avg_tokens,
      totalTokens: metric.total_tokens,
      templatesUsed: metric.templates_used,
      dayOverDayEfficiency: metric.day_over_day_efficiency
    }));
  }

  async calculateTaskComplexity(prompt: string): Promise<number> {
    // Implement complexity calculation based on:
    // - Token count
    // - Code block detection
    // - Technical term density
    // - Nested structure detection
    const tokenCount = prompt.split(/\s+/).length;
    const codeBlocks = (prompt.match(/```[\s\S]*?```/g) || []).length;
    const technicalTerms = (prompt.match(/\b(function|class|interface|import|export|async|await)\b/g) || []).length;
    const nestingLevel = Math.max(
      (prompt.match(/[{([]]/g) || []).length,
      (prompt.match(/[})\]]/g) || []).length
    );

    const complexity = (
      tokenCount * 0.3 +
      codeBlocks * 10 +
      technicalTerms * 5 +
      nestingLevel * 3
    ) / 100;

    return Math.min(Math.max(complexity, 1), 10);
  }

  async recordTaskComplexity(
    taskId: string,
    complexity: number
  ): Promise<void> {
    const { error } = await this.supabase
      .from('metrics')
      .insert({
        metric_type: 'task_complexity',
        value: {
          taskId,
          complexity,
          timestamp: new Date().toISOString()
        }
      });

    if (error) {
      throw new Error(`Failed to record task complexity: ${error.message}`);
    }
  }

  async getTemplateEffectiveness(templateId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('token_efficiency_metrics')
      .select('*')
      .eq('template_id', templateId)
      .single();

    if (error || !data) {
      throw new Error(`Failed to get template effectiveness: ${error?.message}`);
    }

    return data.efficiency_ratio;
  }

  async exportMetrics(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const { data: metrics, error } = await this.supabase
      .from('metrics')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString());

    if (error) {
      throw new Error(`Failed to export metrics: ${error.message}`);
    }

    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['metric_type', 'timestamp', 'value'];
      const rows = metrics.map(m => [
        m.metric_type,
        m.timestamp,
        JSON.stringify(m.value)
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    return JSON.stringify(metrics, null, 2);
  }
}