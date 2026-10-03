import { useState, useEffect, useCallback } from "react";

const BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:3000";

// ── Tag colors ──────────────────────────────────────────────────────────────
const TAG_PALETTE = [
  "#6366f1","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#10b981",
  "#3b82f6","#a855f7","#06b6d4","#84cc16",
];
function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffffffff;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

// ── Pill component ──────────────────────────────────────────────────────────
function TagPill({ tag, onClick, active }) {
  const c = tagColor(tag);
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${c}22` : "rgba(255,255,255,0.04)",
        color: active ? c : "var(--text-secondary)",
        border: `1px solid ${active ? c : "var(--border-subtle)"}`,
        borderRadius: 20,
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.18s",
        letterSpacing: 0.3,
      }}
    >
      {tag}
    </button>
  );
}

// ── Skill Card ──────────────────────────────────────────────────────────────
function SkillCard({ skill, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onSelect(skill)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "rgba(99,102,241,0.08)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${hovered ? "rgba(99,102,241,0.35)" : "var(--border-subtle)"}`,
        borderRadius: 14,
        padding: "20px 22px",
        cursor: "pointer",
        transition: "all 0.22s ease",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* glow strip on hover */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: hovered ? "linear-gradient(90deg,#6366f1,#8b5cf6)" : "transparent",
        transition: "all 0.22s",
      }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", lineHeight: 1.3 }}>
            {skill.name}
          </div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginTop: 3 }}>
            /{skill.slug}
          </div>
        </div>
        <div style={{
          background: "rgba(99,102,241,0.12)",
          color: "#a5b4fc",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 6,
          padding: "2px 8px",
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          v{skill.version || "1.0.0"}
        </div>
      </div>

      {/* Description */}
      <div style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.55,
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {skill.description}
      </div>

      {/* Tags */}
      {skill.tags && skill.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {skill.tags.slice(0, 5).map(t => (
            <span key={t} style={{
              background: `${tagColor(t)}15`,
              color: tagColor(t),
              border: `1px solid ${tagColor(t)}30`,
              borderRadius: 12,
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "lowercase",
            }}>
              {t}
            </span>
          ))}
          {skill.tags.length > 5 && (
            <span style={{ fontSize: 10, color: "var(--text-dim)", padding: "2px 4px" }}>
              +{skill.tags.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
          {skill.is_builtin && (
            <span style={{ background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
              BUILT-IN
            </span>
          )}
          {skill.author && <span>by {skill.author}</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          {skill.usage_count > 0 ? `${skill.usage_count.toLocaleString()} uses` : "unused"}
        </div>
      </div>
    </div>
  );
}

// ── Skill Detail Modal ──────────────────────────────────────────────────────
function SkillDetailModal({ skill, onClose, BASE_URL: BU }) {
  const [related, setRelated]  = useState([]);
  const [loading, setLoading]  = useState(false);
  const [copied, setCopied]    = useState(false);

  useEffect(() => {
    if (!skill) return;
    setLoading(true);
    fetch(`${BU}/skills/${skill.id}/related?limit=4`)
      .then(r => r.json())
      .then(d => setRelated(d.related || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [skill, BU]);

  if (!skill) return null;

  const copySlug = () => {
    navigator.clipboard.writeText(skill.slug).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const invoke = async () => {
    try {
      await fetch(`${BU}/skills/${skill.id}/invoke`, { method: "POST", headers: { "Content-Type": "application/json" } });
    } catch {}
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 18,
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)",
        }}
      >
        {/* Modal header */}
        <div style={{
          padding: "22px 28px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          flexShrink: 0,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))",
            border: "1px solid rgba(99,102,241,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            🧠
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text-primary)" }}>
              {skill.name}
            </div>
            <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginTop: 3 }}>
              {skill.slug} · v{skill.version || "1.0.0"}
              {skill.author && ` · by ${skill.author}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={copySlug} style={{
              background: copied ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${copied ? "rgba(16,185,129,0.4)" : "var(--border-subtle)"}`,
              color: copied ? "#10b981" : "var(--text-secondary)",
              borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              transition: "all 0.18s",
            }}>
              {copied ? "✓ Copied!" : "Copy Slug"}
            </button>
            <button onClick={invoke} style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.3)",
              color: "#a5b4fc",
              borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              + Use Skill
            </button>
            <button onClick={onClose} style={{
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-dim)",
              borderRadius: 8, padding: "6px 12px", fontSize: 16, cursor: "pointer",
            }}>
              ×
            </button>
          </div>
        </div>

        {/* Modal body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* Description */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Description</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{skill.description}</div>
          </div>

          {/* Tags */}
          {skill.tags && skill.tags.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {skill.tags.map(t => (
                  <span key={t} style={{
                    background: `${tagColor(t)}15`, color: tagColor(t),
                    border: `1px solid ${tagColor(t)}30`,
                    borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                  }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* SKILL.md content */}
          {skill.raw_content && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                SKILL.md Preview
              </div>
              <div style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                padding: "16px 18px",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.65,
                maxHeight: 260,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {skill.raw_content.slice(0, 1800)}
                {skill.raw_content.length > 1800 && "\n\n… (truncated)"}
              </div>
            </div>
          )}

          {/* Related skills */}
          {(loading || related.length > 0) && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Related Skills
              </div>
              {loading ? (
                <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Loading…</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {related.map(r => (
                    <div key={r.id} style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>/{r.slug}</div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                        {(r.semantic_score * 100).toFixed(0)}% match
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Skills Page ─────────────────────────────────────────────────────────
export default function Skills() {
  const [skills, setSkills]           = useState([]);
  const [allTags, setAllTags]         = useState([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [searching, setSearching]     = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags]   = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [reindexing, setReindexing]   = useState(false);
  const [reindexMsg, setReindexMsg]   = useState("");

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 100, status: "active" });
      if (activeTags.length > 0) params.set("tags", activeTags.join(","));
      const res = await fetch(`${BASE_URL}/skills?${params}`);
      const data = await res.json();
      const list = data.skills || [];
      setSkills(list);
      setTotal(data.total || list.length);
      // Collect all tags
      const tagSet = new Set();
      list.forEach(s => (s.tags || []).forEach(t => tagSet.add(t)));
      setAllTags([...tagSet].sort());
    } catch {}
    setLoading(false);
  }, [activeTags]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  // Debounced semantic search
  useEffect(() => {
    if (!searchQuery.trim()) { fetchSkills(); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${BASE_URL}/skills/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, limit: 20 }),
        });
        const data = await res.json();
        setSkills(data.results || []);
        setTotal(data.count || 0);
      } catch {}
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleTag = (tag) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    setSearchQuery("");
  };

  const triggerReindex = async () => {
    setReindexing(true);
    setReindexMsg("");
    try {
      const res = await fetch(`${BASE_URL}/skills/index`, { method: "POST" });
      const data = await res.json();
      setReindexMsg(data.message || "Re-indexing started");
      setTimeout(() => { fetchSkills(); setReindexMsg(""); }, 3000);
    } catch (err) {
      setReindexMsg("Re-index failed — check server logs");
    }
    setReindexing(false);
  };

  const builtinCount = skills.filter(s => s.is_builtin).length;

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Hero Bar ── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)",
        border: "1px solid rgba(99,102,241,0.18)",
        borderRadius: 16,
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 28 }}>🧠</span>
            <span style={{ fontWeight: 800, fontSize: 22, color: "var(--text-primary)", letterSpacing: -0.5 }}>
              Skills Registry
            </span>
            <span style={{
              background: "rgba(99,102,241,0.15)",
              color: "var(--accent-primary)",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
            }}>
              {total} skills
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 480 }}>
            Discover and search agent skills indexed from your local skill directories.
            {builtinCount > 0 && ` ${builtinCount} built-in skills from Antigravity.`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Stats pills */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "Total", value: total, color: "#6366f1" },
              { label: "Built-in", value: builtinCount, color: "#8b5cf6" },
              { label: "Custom", value: total - builtinCount, color: "#14b8a6" },
            ].map(s => (
              <div key={s.label} style={{
                background: `${s.color}12`,
                border: `1px solid ${s.color}30`,
                borderRadius: 10,
                padding: "8px 14px",
                textAlign: "center",
              }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: s.color, fontFamily: "var(--font-mono)" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Re-index button */}
          <button
            onClick={triggerReindex}
            disabled={reindexing}
            style={{
              background: reindexing ? "rgba(99,102,241,0.05)" : "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.3)",
              color: reindexing ? "var(--text-dim)" : "#a5b4fc",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 700,
              cursor: reindexing ? "not-allowed" : "pointer",
              transition: "all 0.18s",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {reindexing ? "⏳ Indexing…" : "⚡ Re-index"}
          </button>
        </div>
      </div>

      {reindexMsg && (
        <div style={{
          background: "rgba(16,185,129,0.1)",
          border: "1px solid rgba(16,185,129,0.25)",
          borderRadius: 10,
          padding: "10px 16px",
          fontSize: 13,
          color: "#10b981",
          fontWeight: 600,
        }}>
          ✓ {reindexMsg}
        </div>
      )}

      {/* ── Search Bar ── */}
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
          fontSize: 18, pointerEvents: "none",
        }}>
          {searching ? "⏳" : "🔍"}
        </span>
        <input
          type="text"
          placeholder="Semantic search — 'web scraping', 'code review', 'deep research'…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            padding: "14px 16px 14px 48px",
            fontSize: 14,
            color: "var(--text-primary)",
            outline: "none",
            transition: "border-color 0.18s",
            boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = "rgba(99,102,241,0.5)"}
          onBlur={e => e.target.style.borderColor = "var(--border-subtle)"}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{
              position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
              background: "transparent", border: "none", color: "var(--text-dim)",
              cursor: "pointer", fontSize: 18, lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {/* ── Tag filters ── */}
      {allTags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, marginRight: 4 }}>FILTER:</span>
          {allTags.slice(0, 30).map(t => (
            <TagPill
              key={t}
              tag={t}
              active={activeTags.includes(t)}
              onClick={() => toggleTag(t)}
            />
          ))}
          {activeTags.length > 0 && (
            <button
              onClick={() => setActiveTags([])}
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#f87171",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Skills Grid ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)", fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div>
          Loading skills…
        </div>
      ) : skills.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 0",
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed var(--border-subtle)",
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 600 }}>
            {searchQuery ? `No skills matching "${searchQuery}"` : "No skills indexed yet"}
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
            Click ⚡ Re-index to scan your SKILLS_DIRS, or configure SKILLS_DIRS in .env
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Showing {skills.length} of {total} skill{total !== 1 ? "s" : ""}
            {searchQuery && ` · semantic search: "${searchQuery}"`}
            {activeTags.length > 0 && ` · filtered by [${activeTags.join(", ")}]`}
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}>
            {skills.map(skill => (
              <SkillCard key={skill.id} skill={skill} onSelect={setSelectedSkill} />
            ))}
          </div>
        </>
      )}

      {/* ── Skill Detail Modal ── */}
      {selectedSkill && (
        <SkillDetailModal
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          BASE_URL={BASE_URL}
        />
      )}
    </div>
  );
}
