import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';

// Validation schemas
export const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  content: z.string().min(10, "Content must be at least 10 characters"),
  metadata: z.record(z.unknown()).optional(),
});

export type Template = z.infer<typeof templateSchema>;

export class TemplateManager {
  constructor(
    private readonly supabase: SupabaseClient<Database>
  ) {}

  async createTemplate(template: Template): Promise<string> {
    const validatedTemplate = templateSchema.parse(template);
    
    const { data, error } = await this.supabase
      .from('templates')
      .insert({
        name: validatedTemplate.name,
        type: validatedTemplate.type,
        content: validatedTemplate.content,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create template: ${error.message}`);
    }

    return data.id;
  }

  async getTemplate(id: string): Promise<Template> {
    const { data, error } = await this.supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new Error(`Failed to fetch template: ${error?.message}`);
    }

    return templateSchema.parse(data);
  }

  async listTemplates(type?: string): Promise<Template[]> {
    let query = this.supabase
      .from('templates')
      .select('*');

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list templates: ${error.message}`);
    }

    return data.map(template => templateSchema.parse(template));
  }

  async updateTemplate(id: string, template: Partial<Template>): Promise<void> {
    const { error } = await this.supabase
      .from('templates')
      .update(template)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update template: ${error.message}`);
    }
  }

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('templates')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete template: ${error.message}`);
    }
  }

  validateTemplate(template: Template): boolean {
    try {
      templateSchema.parse(template);
      return this.validatePlaceholders(template.content);
    } catch {
      return false;
    }
  }

  private validatePlaceholders(content: string): boolean {
    const placeholders = this.extractPlaceholders(content);
    const requiredPlaceholders = ['description', 'type', 'complexity'];

    return requiredPlaceholders.every(placeholder => 
      placeholders.includes(placeholder)
    );
  }

  extractPlaceholders(content: string): string[] {
    const placeholderRegex = /\{([^}]+)\}/g;
    const placeholders: string[] = [];
    let match;

    while ((match = placeholderRegex.exec(content)) !== null) {
      placeholders.push(match[1]);
    }

    return placeholders;
  }

  fillTemplate(template: Template, data: Record<string, unknown>): string {
    return template.content.replace(/\{([^}]+)\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  async recordTemplateUsage(templateId: string, taskId: string, metrics: {
    tokenCount: number;
    baselineTokenCount: number;
    efficiencyRatio: number;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('metrics')
      .insert({
        metric_type: 'template_usage',
        value: {
          templateId,
          taskId,
          tokenCount: metrics.tokenCount,
          baselineTokenCount: metrics.baselineTokenCount,
          efficiencyRatio: metrics.efficiencyRatio,
          timestamp: new Date().toISOString()
        }
      });

    if (error) {
      console.error('Failed to record template usage metrics:', error);
    }
  }
}