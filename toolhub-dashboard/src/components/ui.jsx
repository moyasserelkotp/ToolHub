export const CAT_COLOR = {
  research: "var(--accent-primary)",
  development: "var(--accent-secondary)",
  communication: "#10b981",
  data: "var(--warning)",
  media: "#ec4899",
  language: "#8b5cf6",
  storage: "var(--text-secondary)",
};

export const secColor = (s) => (s >= 80 ? "#10b981" : s >= 60 ? "var(--warning)" : "var(--error)");
export const msColor = (m) => (m > 2000 ? "var(--error)" : m > 500 ? "var(--warning)" : "#10b981");

export const S = {
  p: { color: "var(--text-secondary)", fontSize: "14px", lineHeight: "1.7", marginBottom: "16px" },
};

export function Card({ label, value, sub, c }) {
  return (
    <div className="glass-card animate-fade-in" style={{ padding: "20px 24px", flex: 1, minWidth: "160px" }}>
      <div style={{ color: "var(--text-secondary)", fontSize: "11px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "28px", fontWeight: 800, color: c || "var(--text-primary)", letterSpacing: "-0.5px" }}>
        {value}
      </div>
      {sub && <div style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

export function ScoreBadge({ s }) {
  const c = secColor(s);
  return (
    <span style={{ 
      background: `${c}15`, 
      color: c, 
      border: `1px solid ${c}33`, 
      borderRadius: "var(--radius-sm)", 
      padding: "2px 8px", 
      fontSize: "11px", 
      fontFamily: "var(--font-mono)", 
      fontWeight: 700,
      backdropFilter: "blur(4px)"
    }}>
      {s}/100
    </span>
  );
}

export function Pill({ cat }) {
  const c = CAT_COLOR[cat] || "var(--text-secondary)";
  return (
    <span style={{ 
      background: `${c}12`, 
      color: c, 
      border: `1px solid ${c}25`, 
      borderRadius: "20px", 
      padding: "2px 10px", 
      fontSize: "10px", 
      textTransform: "uppercase", 
      letterSpacing: "0.5px",
      fontWeight: 600
    }}>
      {cat}
    </span>
  );
}

export function Feed({ calls }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
      {calls.map((c, i) => (
        <div key={c.id} className="glass animate-fade-in" style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "12px", 
          padding: "10px 14px", 
          borderRadius: "var(--radius-md)",
          animationDelay: `${i * 0.05}s`,
          background: i === 0 ? "rgba(99,102,241,0.08)" : "var(--bg-card)",
          borderColor: i === 0 ? "var(--border-glow)" : "var(--border-subtle)"
        }}>
          <span style={{ fontSize: "14px" }}>{c.success ? "✅" : "❌"}</span>
          <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "13px", flex: 1, fontWeight: 500 }}>
            {c.tool_name}
          </span>
          <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{c.agent_id}</span>
          <span style={{ color: msColor(c.latency_ms), fontFamily: "var(--font-mono)", fontSize: "12px", width: "60px", textAlign: "right", fontWeight: 600 }}>
            {c.latency_ms}ms
          </span>
          <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>{new Date(c.timestamp).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

export function Box({ title, children, transparent }) {
  return (
    <div className={transparent ? "" : "glass"} style={{ padding: "24px", height: "100%" }}>
      {title && (
        <div style={{ 
          fontSize: "11px", 
          fontWeight: 700, 
          color: "var(--text-secondary)", 
          marginBottom: "20px", 
          textTransform: "uppercase", 
          letterSpacing: "1.5px", 
          fontFamily: "var(--font-mono)",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <div style={{ width: "4px", height: "14px", background: "var(--accent-primary)", borderRadius: "2px" }} />
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function Section({ title, icon, children }) {
  return (
    <div className="glass" style={{ padding: "28px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <span style={{ fontSize: "20px" }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: "18px", color: "var(--text-primary)", letterSpacing: "-0.4px" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function Pre({ children }) {
  return (
    <pre style={{ 
      background: "#080b11", 
      border: "1px solid var(--border-subtle)", 
      borderRadius: "var(--radius-md)", 
      padding: "16px 20px", 
      fontFamily: "var(--font-mono)", 
      fontSize: "13px", 
      color: "#a5f3fc", 
      overflowX: "auto", 
      lineHeight: "1.7", 
      marginBottom: "16px", 
      whiteSpace: "pre-wrap", 
      wordBreak: "break-word" 
    }}>
      {children}
    </pre>
  );
}

export function Mono({ children }) {
  return (
    <span style={{ 
      fontFamily: "var(--font-mono)", 
      fontSize: "12px", 
      color: "var(--accent-secondary)", 
      background: "rgba(14,165,233,0.1)", 
      borderRadius: "var(--radius-sm)", 
      padding: "2px 6px",
      border: "1px solid rgba(14,165,233,0.2)"
    }}>
      {children}
    </span>
  );
}

export function Note({ children }) {
  return (
    <div style={{ 
      background: "rgba(210,153,34,0.06)", 
      border: "1px solid rgba(210,153,34,0.2)", 
      borderRadius: "var(--radius-md)", 
      padding: "14px 18px", 
      fontSize: "13px", 
      color: "var(--warning)", 
      lineHeight: "1.6",
      display: "flex",
      gap: "10px"
    }}>
      <span>💡</span>
      <span>{children}</span>
    </div>
  );
}
export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
      <div className="glass-card animate-fade-in" style={{ width: "100%", maxWidth: "700px", maxHeight: "90vh", overflowY: "auto", position: "relative", padding: "32px", border: "1px solid var(--border-glow)", boxShadow: "0 0 40px rgba(99,102,241,0.2)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "20px", right: "20px", background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "20px" }}>✕</button>
        {title && <h2 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "24px", color: "var(--text-primary)", letterSpacing: "-0.5px" }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

import { useState } from "react";

export function RegisterToolModal({ isOpen, onClose, onRegister, BASE_URL }) {
  const [prompt, setPrompt] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [tool, setTool] = useState({ name: "", description: "", category: "research", json_schema: {}, auth_type: "none", endpoint_url: "", version: "1.0.0" });
  const [audit, setAudit] = useState(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoadingAI(true);
    try {
      const res = await fetch(`${BASE_URL}/tools/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (res.ok) {
        const data = await res.json();
        setTool({ ...tool, ...data });
      }
    } catch(err) { console.error(err); }
    setLoadingAI(false);
  };

  const handleAudit = async () => {
    setLoadingAI(true);
    try {
      const res = await fetch(`${BASE_URL}/tools/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tool.name, json_schema: tool.json_schema })
      });
      if (res.ok) setAudit(await res.json());
    } catch(err) { console.error(err); }
    setLoadingAI(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onRegister(tool);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register New AI Tool">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <Box title="AI Agent Assistant" transparent>
          <div style={{ display: "flex", gap: "10px" }}>
            <input 
              type="text" 
              placeholder="Describe what the tool does (e.g. 'a tool for searching Google')..." 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="glass"
              style={{ flex: 1, background: "var(--bg-card)", color: "var(--text-primary)", padding: "12px 16px", borderRadius: "var(--radius-md)", fontSize: "14px", border: "1px solid var(--border-subtle)" }}
            />
            <button 
              onClick={handleGenerate} 
              disabled={loadingAI}
              style={{ background: "var(--accent-primary)", color: "white", border: "none", padding: "0 20px", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}
            >
              {loadingAI ? "..." : "AI Generate"}
            </button>
          </div>
        </Box>

        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "8px", fontWeight: 700 }}>Tool Name</label>
            <input required type="text" value={tool.name} onChange={e => setTool({...tool, name: e.target.value})} className="glass" style={{ width: "100%", background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: "14px", border: "1px solid var(--border-subtle)" }} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "8px", fontWeight: 700 }}>Description</label>
            <textarea required value={tool.description} onChange={e => setTool({...tool, description: e.target.value})} className="glass" style={{ width: "100%", height: "80px", background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: "14px", border: "1px solid var(--border-subtle)", resize: "none" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "8px", fontWeight: 700 }}>Category</label>
            <select value={tool.category} onChange={e => setTool({...tool, category: e.target.value})} className="glass" style={{ width: "100%", background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: "14px", border: "1px solid var(--border-subtle)" }}>
              {Object.keys(CAT_COLOR).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "8px", fontWeight: 700 }}>Auth Type</label>
            <select value={tool.auth_type} onChange={e => setTool({...tool, auth_type: e.target.value})} className="glass" style={{ width: "100%", background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: "14px", border: "1px solid var(--border-subtle)" }}>
              {['none', 'api_key', 'bearer_token', 'oauth'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "8px", fontWeight: 700 }}>Endpoint URL</label>
            <input required type="text" value={tool.endpoint_url} onChange={e => setTool({...tool, endpoint_url: e.target.value})} className="glass" style={{ width: "100%", background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: "14px", border: "1px solid var(--border-subtle)" }} />
          </div>
          
          <div style={{ gridColumn: "1 / -1" }}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
               <label style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>JSON Schema</label>
               <button type="button" onClick={handleAudit} style={{ background: "transparent", border: "none", color: "var(--accent-secondary)", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>🛡️ AI Audit</button>
             </div>
             <Pre>
               {JSON.stringify(tool.json_schema, null, 2)}
             </Pre>
          </div>

          {audit && (
            <div style={{ gridColumn: "1 / -1" }} className="animate-fade-in">
              <Note>
                <div style={{ fontWeight: 700, color: secColor(audit.security_score) }}>Security Score: {audit.security_score}/100</div>
                {audit.vulnerabilities.length > 0 && <div style={{ marginTop: 4 }}>• {audit.vulnerabilities[0]}</div>}
              </Note>
            </div>
          )}

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "12px", marginTop: "12px" }}>
            <button type="submit" style={{ flex: 1, background: "var(--accent-primary)", color: "white", border: "none", padding: "14px", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 800, fontSize: "15px", boxShadow: "0 4px 12px var(--accent-glow)" }}>Register Tool</button>
            <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", padding: "12px 24px", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
