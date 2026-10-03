import axios, { AxiosInstance } from 'axios';

// ── Skill type ────────────────────────────────────────────────────────────────

export interface Skill {
  id:             string;
  name:           string;
  slug:           string;
  description:    string;
  tags:           string[];
  author?:        string;
  version:        string;
  status:         string;
  usage_count:    number;
  is_builtin:     boolean;
  frontmatter:    Record<string, unknown>;
  raw_content?:   string;
  semantic_score?: number;
  score?:         number;
}

export interface SkillSearchResult {
  query:   string;
  count:   number;
  results: Skill[];
}

export interface SkillListResult {
  skills: Skill[];
  total:  number;
  limit:  number;
  offset: number;
}

export interface RelatedSkillsResult {
  related: Skill[];
  count:   number;
}

// ── Client config ─────────────────────────────────────────────────────────────

export interface SkillsClientConfig {
  baseUrl?:    string;
  adminToken?: string;
}

// ── SkillsClient ──────────────────────────────────────────────────────────────

export class SkillsClient {
  private client: AxiosInstance;

  constructor(config: SkillsClientConfig = {}) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'http://localhost:3000',
      headers: { 'Content-Type': 'application/json' },
    });
    if (config.adminToken) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${config.adminToken}`;
    }
  }

  /**
   * Semantically search the Skills Registry.
   *
   * @example
   * const skills = await client.search("web scraping automation", 5);
   * skills.forEach(s => console.log(s.name, s.score));
   */
  async search(query: string, limit = 5): Promise<Skill[]> {
    const res = await this.client.post<SkillSearchResult>('/skills/search', {
      query,
      limit: Math.min(limit, 20),
    });
    return res.data.results;
  }

  /**
   * List all active skills with optional filters.
   */
  async list(opts: {
    status?:    string;
    tags?:      string[];
    isBuiltin?: boolean;
    limit?:     number;
    offset?:    number;
  } = {}): Promise<SkillListResult> {
    const params: Record<string, string | number> = {
      status: opts.status  ?? 'active',
      limit:  opts.limit   ?? 50,
      offset: opts.offset  ?? 0,
    };
    if (opts.tags && opts.tags.length > 0) params.tags = opts.tags.join(',');
    if (opts.isBuiltin !== undefined) params.is_builtin = String(opts.isBuiltin);

    const res = await this.client.get<SkillListResult>('/skills', { params });
    return res.data;
  }

  /**
   * Get full skill details by UUID.
   */
  async get(skillId: string): Promise<Skill> {
    const res = await this.client.get<Skill>(`/skills/${skillId}`);
    return res.data;
  }

  /**
   * Get full skill details by folder slug (e.g. "deep-research").
   *
   * @example
   * const skill = await client.getBySlug("deep-research");
   * console.log(skill.raw_content);
   */
  async getBySlug(slug: string): Promise<Skill> {
    const res = await this.client.get<Skill>(`/skills/slug/${slug}`);
    return res.data;
  }

  /**
   * Get semantically related skills by embedding similarity.
   */
  async related(skillId: string, limit = 5): Promise<Skill[]> {
    const res = await this.client.get<RelatedSkillsResult>(
      `/skills/${skillId}/related`,
      { params: { limit } }
    );
    return res.data.related;
  }

  /**
   * Manually register a skill. Requires adminToken.
   */
  async register(skill: {
    name:        string;
    slug:        string;
    description: string;
    tags?:       string[];
    author?:     string;
    version?:    string;
    rawContent?: string;
    sourcePath?: string;
  }): Promise<Skill> {
    const res = await this.client.post<{ skill: Skill }>('/skills', {
      name:        skill.name,
      slug:        skill.slug,
      description: skill.description,
      tags:        skill.tags        ?? [],
      author:      skill.author,
      version:     skill.version     ?? '1.0.0',
      raw_content: skill.rawContent,
      source_path: skill.sourcePath,
    });
    return res.data.skill;
  }

  /**
   * Increment usage_count for a skill (mark as used). Requires adminToken.
   */
  async invoke(skillId: string): Promise<{ success: boolean; usage_count: number }> {
    const res = await this.client.post(`/skills/${skillId}/invoke`);
    return res.data;
  }

  /**
   * Trigger a re-index of all SKILLS_DIRS on the server. Requires adminToken.
   */
  async reindex(): Promise<{ message: string; dirs: string[] }> {
    const res = await this.client.post('/skills/index');
    return res.data;
  }

  /**
   * Delete a skill from the registry. Requires adminToken.
   */
  async delete(skillId: string): Promise<boolean> {
    const res = await this.client.delete<{ deleted: boolean }>(`/skills/${skillId}`);
    return res.data.deleted;
  }
}
