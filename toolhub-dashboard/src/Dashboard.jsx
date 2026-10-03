import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Card, ScoreBadge, Pill, Feed, Box, Section, Pre, Mono, Note, secColor, RegisterToolModal } from "./components/ui";
import { HourlyVolumeChart, SecurityDistributionChart } from "./components/AnalyticsCharts";
import Marketplace from "./pages/Marketplace";
import Skills from "./pages/Skills";

// ── Constants ─────────────────────────────────────────────────────────────────
// Set VITE_API_URL in .env to override for non-localhost deployments
const BASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:3000";
const socket = io(BASE_URL);

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState("overview");
  const [data, setData]         = useState(null);       // analytics overview
  const [allTools, setAllTools] = useState([]);         // full tool registry list
  const [marketplaceTools, setMarketplaceTools] = useState([]); // public tools
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tick, setTick]         = useState(0);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [approvalQueue, setApprovalQueue] = useState([]);

  const handleApprove = async (id, action) => {
    try {
      await fetch(`${BASE_URL}/tools/calls/${id}/${action}`, { method: 'POST' });
      setApprovalQueue(q => q.filter(x => x.id !== id));
    } catch(err) { console.error(err); }
  };

  const handleRegister = async (newTool) => {
    try {
      const res = await fetch(`${BASE_URL}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTool)
      });
      if (res.ok) {
        fetchData();
        alert("Tool registered successfully!");
      } else {
        const error = await res.json();
        alert(`Failed to register: ${error.error}`);
      }
    } catch(err) { console.error(err); }
  };

  const fetchData = async () => {
    try {
      const [overviewResp, toolsResp, mktResp, pendingResp] = await Promise.all([
        fetch(`${BASE_URL}/analytics/overview`),
        fetch(`${BASE_URL}/tools?limit=100`),
        fetch(`${BASE_URL}/marketplace/tools?limit=100`),
        fetch(`${BASE_URL}/tools/calls/pending`),
      ]);
      if (!overviewResp.ok || !toolsResp.ok || !mktResp.ok || !pendingResp.ok) throw new Error("API error");
      const [overview, toolList, mktList, pendingList] = await Promise.all([
        overviewResp.json(),
        toolsResp.json(),
        mktResp.json(),
        pendingResp.json(),
      ]);
      setData(overview);
      setAllTools(toolList.tools || []);
      setMarketplaceTools(mktList.tools || []);
      setApprovalQueue(pendingList || []);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error("Dashboard fetch failed:", err);
      setError("Cannot reach ToolHub server at " + BASE_URL);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleLiveCall = (call) => {
      setData(prev => {
        if (!prev) return prev;
        const newCalls = [call, ...(prev.recent_calls || [])].slice(0, 50);
        return { ...prev, recent_calls: newCalls };
      });
    };

    const handleApproval = (req) => setApprovalQueue(prev => [req, ...prev]);

    socket.on("live_call", handleLiveCall);
    socket.on("tool_registered", fetchData);
    socket.on("approval_requested", handleApproval);

    const id = setInterval(() => {
      fetchData();
      setTick(t => t + 1);
    }, 10000); // Poll every 10s

    return () => {
      clearInterval(id);
      socket.off("live_call", handleLiveCall);
      socket.off("tool_registered", fetchData);
      socket.off("approval_requested", handleApproval);
    };
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight:"100vh", background:"#070b14", color:"#64748b", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace" }}>
        <div style={{ animation:"pulse 2s infinite" }}>LOADING TOOLHUB TELEMETRY...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight:"100vh", background:"#070b14", color:"#64748b", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"monospace", gap:12 }}>
        <div style={{ fontSize:20 }}>⚠️</div>
        <div style={{ color:"#f59e0b" }}>{error || "No data"}</div>
        <div style={{ fontSize:12 }}>Start the server: <span style={{color:"#a5b4fc"}}>cd server &amp;&amp; npm start</span></div>
        <button onClick={fetchData} style={{ marginTop:8, padding:"6px 16px", background:"#1e293b", border:"1px solid #334155", color:"#94a3b8", borderRadius:6, cursor:"pointer", fontSize:12 }}>Retry</button>
      </div>
    );
  }

  const { top_tools: tools, recent_calls: calls, error_heatmap, hourly_volume } = data;

  const totalCalls   = tools.reduce((s,t) => s + (parseInt(t.calls_24h) || 0), 0);
  const avgScore     = tools.length > 0 ? Math.round(tools.reduce((s,t) => s + (t.security_score || 0), 0) / tools.length) : 0;
  const errPct       = tools.length > 0
    ? (tools.reduce((s,t) => s + (parseFloat(t.error_rate) || 0), 0) / tools.length * 100).toFixed(1)
    : "0.0";
  const uniqueAgents = [...new Set((calls || []).map(c => c.agent_id).filter(Boolean))].length;
  const successCalls = (calls || []).filter(c => c.success).length;
  const TABS = ["overview", "approvals", "marketplace", "skills", "tools", "security", "calls", "how to use"];


  return (
    <div className="animate-fade-in" style={{ minHeight:"100vh" }}>
      {/* Header */}
      <div className="glass" style={{ position:"sticky", top:0, zIndex:50, padding:"0 24px", borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
        <div style={{ maxWidth:"1400px", margin:"0 auto", display:"flex", alignItems:"center", height:64, gap:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, boxShadow: "0 0 15px var(--accent-glow)" }}>⚙</div>
            <span style={{ fontWeight:800, fontSize:18, letterSpacing:-0.6, color: "var(--text-primary)" }}>ToolHub</span>
            <span style={{ background:"rgba(99,102,241,0.1)", color:"var(--accent-primary)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:4, padding:"1px 6px", fontSize:10, fontFamily:"var(--font-mono)", fontWeight: 600 }}>v2.0</span>
          </div>
          <div style={{ display:"flex", gap:4, flex:1, marginLeft: 12 }}>
            {TABS.map(t => (
              <button key={t} onClick={()=>setTab(t)} style={{
                background: tab===t ? "rgba(99,102,241,0.12)" : "transparent",
                border:     "1px solid transparent",
                borderColor: tab===t ? "rgba(99,102,241,0.3)" : "transparent",
                color:      tab===t ? "var(--accent-primary)" : "var(--text-secondary)",
                borderRadius:8, padding:"6px 16px", fontSize:13, cursor:"pointer",
                textTransform:"capitalize", fontWeight:600,
                transition: "all 0.2s ease"
              }}>{t}</button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div className="glow-point" />
            <span style={{ color:"#10b981", fontSize:12, fontFamily:"var(--font-mono)", fontWeight: 600 }}>LIVE · {tick}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:"1400px", margin:"0 auto", padding:"32px 24px" }}>

        {/* ── OVERVIEW ── */}
        {tab==="overview" && (
          <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:24 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:16 }}>
              <Card label="Registered Tools"  value={allTools.length || tools.length} sub="All active"    c="var(--accent-primary)"/>
              <Card label="Calls 24h"  value={totalCalls.toLocaleString()} sub="All tools" c="var(--accent-secondary)"/>
              <Card label="Avg Security" value={`${avgScore}/100`}  sub="Platform avg"  c="#10b981"/>
              <Card label="Error Rate" value={`${errPct}%`}         sub="Last 24h"      c={parseFloat(errPct)>5?"var(--error)":"var(--warning)"}/>
              <Card label="Active Agents" value={uniqueAgents || "—"} sub="Last 24h"   c="#8b5cf6"/>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
              <Box title="Hourly Volume (24h)">
                <div style={{ height: 260 }}>
                  <HourlyVolumeChart data={hourly_volume} />
                </div>
              </Box>

              <Box title="Security Leaderboard">
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {[...tools].sort((a,b)=>b.security_score-a.security_score).map((t,i)=>(
                    <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, padding: "8px 0", borderBottom: i < tools.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                      <span style={{ color:"var(--text-dim)", width:24, fontSize:11, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{String(i+1).padStart(2, '0')}</span>
                      <span style={{ flex:1, fontSize:13, color:"var(--text-primary)", fontFamily:"var(--font-mono)", fontWeight: 500 }}>{t.name}</span>
                      <div style={{ width:100, background:"var(--bg-deep)", borderRadius:4, height:6, overflow:"hidden", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ width:`${t.security_score}%`, height:"100%", background:secColor(t.security_score), borderRadius:4 }}/>
                      </div>
                      <ScoreBadge s={t.security_score}/>
                    </div>
                  ))}
                </div>
              </Box>
            </div>

            <Box title="Real-Time Call Feed">
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Live telemetry stream from all connected agents</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div className="glow-point" />
                  <span style={{ color:"#10b981", fontSize:11, fontFamily:"var(--font-mono)", fontWeight: 600 }}>active stream</span>
                </div>
              </div>
              <Feed calls={calls}/>
            </Box>
          </div>
        )}

        {/* ── APPROVALS ── */}
        {tab==="approvals" && (
          <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <h1 style={{ fontSize:28, color:"var(--text-primary)", fontWeight:800, margin:0, letterSpacing:"-0.5px" }}>Human-in-the-Loop Queue</h1>
                <p style={{ color:"var(--text-dim)", fontSize:14, margin:0 }}>Review high-risk tool executions before they are routed to external providers.</p>
              </div>
              <div style={{ background:"rgba(245,158,11,0.1)", color:"var(--warning)", border:"1px solid rgba(245,158,11,0.2)", padding:"6px 12px", borderRadius:6, fontSize:13, fontWeight:700 }}>
                {approvalQueue.length} Pending
              </div>
            </div>

            {approvalQueue.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-dim)", fontFamily:"var(--font-mono)" }}>
                No pending executions. Your agents are running smoothly.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {approvalQueue.map(req => (
                  <div key={req.id} className="glass" style={{ borderLeft:"4px solid var(--warning)", padding:20, display:"flex", flexDirection:"column", gap:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                          <span style={{ fontSize:18, fontWeight:700, color:"var(--text-primary)" }}>{req.tool_name}</span>
                          <span style={{ background:"var(--bg-deep)", border:"1px solid var(--border-subtle)", padding:"2px 8px", borderRadius:4, fontSize:11, fontFamily:"var(--font-mono)", color:"var(--text-secondary)" }}>{req.agent_id}</span>
                          <span style={{ color:"var(--text-dim)", fontSize:11 }}>{new Date(req.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ fontSize:13, color:"var(--text-secondary)" }}>An autonomous agent requested to execute this tool. Please verify the arguments payload.</div>
                      </div>
                      <div style={{ display:"flex", gap:12 }}>
                        <button onClick={() => handleApprove(req.id, 'reject')} style={{ background:"rgba(248,81,73,0.1)", color:"var(--error)", border:"1px solid rgba(248,81,73,0.2)", padding:"8px 16px", borderRadius:6, cursor:"pointer", fontWeight:700, fontSize:13 }}>Reject</button>
                        <button onClick={() => handleApprove(req.id, 'approve')} style={{ background:"rgba(16,185,129,0.15)", color:"#10b981", border:"1px solid rgba(16,185,129,0.3)", padding:"8px 20px", borderRadius:6, cursor:"pointer", fontWeight:800, fontSize:13, boxShadow:"0 0 10px rgba(16,185,129,0.2)" }}>Approve Execution</button>
                      </div>
                    </div>
                    <Pre>{JSON.stringify(req.payload, null, 2)}</Pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MARKETPLACE ── */}
        {tab==="marketplace" && <Marketplace />}

        {/* ── SKILLS ── */}
        {tab==="skills" && <Skills />}

        {/* ── TOOLS ── */}
        {tab==="tools" && (
          <Box>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:32 }}>
              <div>
                <h1 style={{ fontSize:32, color:"var(--text-primary)", fontWeight:800, margin:0, letterSpacing:"-1px" }}>ToolHub Registry</h1>
                <p style={{ color:"var(--text-dim)", fontSize:14, margin:0, fontFamily:"var(--font-mono)" }}>Node: cluster-01 · v2.4.0-stable</p>
              </div>
              <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                <button 
                  onClick={() => setIsRegisterOpen(true)}
                  style={{ 
                    background: "var(--accent-primary)", 
                    color: "white", 
                    border: "none", 
                    padding: "10px 20px", 
                    borderRadius: "var(--radius-md)", 
                    fontWeight: 700, 
                    cursor: "pointer",
                    boxShadow: "0 4px 12px var(--accent-glow)"
                  }}
                >
                  + Register Tool
                </button>
                <div className="glass" style={{ padding:"8px 16px", borderRadius:"var(--radius-md)", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:10, color:"var(--text-dim)", textTransform:"uppercase", fontWeight:700 }}>System Status</div>
                    <div style={{ fontSize:13, color:"#10b981", fontWeight:700 }}>Operational</div>
                  </div>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 10px #10b981" }} />
                </div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width:"100%", borderCollapse:"separate", borderSpacing: "0 8px" }}>
                <thead>
                  <tr>
                    {["Tool","Category","Auth Type","Usage","Security","Status"].map(h=>(
                      <th key={h} style={{ padding:"12px 16px", textAlign:"left", color:"var(--text-dim)", fontSize:11, fontFamily:"var(--font-mono)", textTransform:"uppercase", letterSpacing:1, fontWeight:600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                  {allTools.map((t,i)=>(
                    <tr key={t.id} className="glass-card" style={{ cursor: "pointer" }}>
                      <td style={{ padding:"14px 16px", color:"var(--text-primary)", fontWeight: 600 }}>{t.name}</td>
                      <td style={{ padding:"14px 16px" }}><Pill cat={t.category}/></td>
                      <td style={{ padding:"14px 16px", color:"var(--text-secondary)", fontSize:12 }}>{t.auth_type || '—'}</td>
                      <td style={{ padding:"14px 16px", color:"var(--text-secondary)" }}>{(t.usage_count || 0).toLocaleString()}</td>
                      <td style={{ padding:"14px 16px" }}><ScoreBadge s={t.security_score}/></td>
                      <td style={{ padding:"14px 16px" }}>
                        <span style={{ 
                          background: t.health_status === 'degraded' ? 'rgba(248,81,73,0.1)' : 'rgba(16,185,129,0.1)', 
                          color: t.health_status === 'degraded' ? 'var(--error)' : '#10b981', 
                          border: `1px solid ${t.health_status === 'degraded' ? 'rgba(248,81,73,0.2)' : 'rgba(16,185,129,0.2)'}`, 
                          borderRadius: "var(--radius-sm)", 
                          padding:"3px 8px", 
                          fontSize:11, 
                          fontWeight: 700 
                        }}>
                          {t.health_status || t.status || 'active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        )}

        {/* ── SECURITY ── */}
        {tab==="security" && (
          <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:24 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:16 }}>
              <Card label="Avg Score" value={`${avgScore}/100`} c="#10b981"/>
              <Card label="Auth Gap" value={`${tools.filter(t=>!t.auth_type||t.auth_type==='none').length === 0 ? '0%' : Math.round(tools.filter(t=>!t.auth_type||t.auth_type==='none').length/tools.length*100)+'%'}`} sub={tools.filter(t=>!t.auth_type||t.auth_type==='none').length === 0 ? 'All tools authenticated' : 'Tools without auth'} c={tools.filter(t=>!t.auth_type||t.auth_type==='none').length === 0 ? "#10b981" : "var(--error)"}/>
              <Card label="Min Score" value={tools.length > 0 ? `${Math.min(...tools.map(t=>t.security_score||0))}/100` : '—'} sub="Lowest in registry" c="var(--warning)"/>
              <Card label="Threshold" value="40/100" sub="Registration minimum" c="var(--accent-primary)"/>
            </div>
            <Box title="Score Distribution">
              <div style={{ height: 300, marginBottom: 20 }}>
                <SecurityDistributionChart tools={tools} />
              </div>
              <div style={{ padding:20, background:"rgba(16,185,129,0.04)", border:"1px solid rgba(16,185,129,0.15)", borderRadius: "var(--radius-md)" }}>
                <div style={{ color:"#10b981", fontSize:14, fontWeight:700, marginBottom: 6 }}>✅ ToolHub Architecture Security Analysis</div>
                <div style={{ color:"var(--text-secondary)", fontSize:13, lineHeight: 1.6 }}>
                  Tools scoring below 40/100 are automatically quarantined at registration. 
                  OAuth-enabled tools receive a baseline score of 80+, while unauthenticated tools are penalized.
                  The platform currently secures 100% of tool-to-agent communication via AES-256-GCM.
                </div>
              </div>
            </Box>
          </div>
        )}

        {/* ── CALLS ── */}
        {tab==="calls" && (
          <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:24 }}>
            <Box title="Live Analytics Stream">
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                <span style={{ color:"#10b981", fontSize:11, fontFamily:"var(--font-mono)", background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.2)", borderRadius:4, padding:"3px 10px", fontWeight: 700 }}>
                  {successCalls}/{(calls||[]).length} SUCCESSFUL REQUESTS
                </span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div className="glow-point" />
                  <span style={{ color:"#10b981", fontSize:11, fontFamily:"var(--font-mono)", fontWeight: 700 }}>active telemetry · {tick}</span>
                </div>
              </div>
              <Feed calls={calls||[]}/>
            </Box>

            <Box title="Error Rate Heatmap (24h)">
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {(error_heatmap||[]).map(t=>(
                  <div key={t.name} style={{ display:"flex", alignItems:"center", gap:16 }}>
                    <span style={{ width:180, fontSize:13, color:"var(--text-primary)", fontFamily:"var(--font-mono)", fontWeight: 500 }}>{t.name}</span>
                    <div style={{ flex:1, background:"var(--bg-deep)", borderRadius:4, height:8, overflow:"hidden", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ width:`${Math.min((parseFloat(t.error_pct)||0)*10,100)}%`, height:"100%", background:(t.error_pct||0)>5?"var(--error)":(t.error_pct||0)>2?"var(--warning)":"#10b981", borderRadius:4, minWidth:(t.error_pct||0)>0?4:0 }}/>
                    </div>
                    <span style={{ width:48, textAlign:"right", fontSize:12, fontFamily:"var(--font-mono)", color:(t.error_pct||0)>5?"var(--error)":"var(--text-secondary)", fontWeight: 600 }}>{parseFloat(t.error_pct||0).toFixed(1)}%</span>
                  </div>
                ))}
                {(!error_heatmap || error_heatmap.length === 0) && (
                  <div style={{ color:"var(--text-dim)", fontSize:14, textAlign:"center", padding:"40px 0", fontFamily: "var(--font-mono)" }}>No telemetry data received yet. Invoke tools to see activity.</div>
                )}
              </div>
            </Box>
          </div>
        )}

        {/* ── HOW TO USE ── */}
        {tab==="how to use" && (
          <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:24, maxWidth:1000 }}>

            <div style={{ background:"linear-gradient(135deg, rgba(99,102,241,0.1), rgba(14,165,233,0.05))", border:"1px solid var(--border-glow)", borderRadius:16, padding:32, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize:24, fontWeight:800, marginBottom:12, letterSpacing:-0.8, color: "var(--text-primary)" }}>⚙ ToolHub Developer Guide</div>
              <p style={{ color:"var(--text-secondary)", fontSize:15, lineHeight:1.7, margin:0 }}>The universal middleware for AI Agent tool discovery and execution. Built with security-first architecture, semantic vector search, and real-time observability.</p>
            </div>

            <Section title="1 — Orchestrate the Backbone" icon="🗄️">
              <p style={S.p}>Initialize the environment and start the core services. Ensure PostgreSQL and Redis are active.</p>
              <Pre>{`cd server
npm install
npm run migrate            # Initialize schema (Postgres)
npm run seed               # Populate baseline registry
npm start                  # Port :3000`}</Pre>
            </Section>

            <Section title="2 — SDK Integration (Python)" icon="🐍">
              <p style={S.p}>Connect your agent to ToolHub using the official Python SDK for secure tool discovery and execution.</p>
              <Pre>{`from toolhub_sdk import ToolHub

hub = ToolHub(
    base_url="http://localhost:3000",
    operator_id="eng-team-alpha", 
    agent_id="discovery-agent-01"
)`}</Pre>
            </Section>

            <Section title="3 — Secure Execution Pipeline" icon="🔐">
              <p style={S.p}>Register credentials once. ToolHub handles AES-256-GCM encryption and server-side injection, keeping API keys out of LLM context.</p>
              <Pre>{`# Register sensitive key
hub.register_credential(
    tool_id="google_search",
    api_key="sk_live_...",
    auth_type="api_key"
)

# Semantic search and invocation
search_tool = hub.search("I need to find latest news")[0]
result = hub.invoke(search_tool.id, {"q": "AI news"})`}</Pre>
              <Note>ToolHub automatically retries transient network failures with exponential backoff (3 attempts).</Note>
            </Section>

            <Section title="API Documentation" icon="📋">
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:12 }}>
                {[
                  ["POST /tools/generate",     "AI Tool Schema Generation [NEW]"],
                  ["POST /tools/search",       "Semantic Vector Search"],
                  ["POST /tools/:id/invoke",   "Secure Proxy with Credential Injection"],
                  ["GET  /analytics/overview", "Real-time Telemetry Aggregation"],
                  ["POST /credentials",        "AES-256-GCM Vault Entry"],
                  ["POST /webhooks",           "Event Subscription (HMAC Signed)"],
                ].map(([r,d])=>(
                  <div key={r} className="glass" style={{ padding:"16px 20px" }}>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--accent-secondary)", marginBottom:4, fontWeight: 700 }}>{r}</div>
                    <div style={{ fontSize:13, color:"var(--text-secondary)" }}>{d}</div>
                  </div>
                ))}
              </div>
            </Section>

          </div>
        )}

      </div>

      <footer style={{ marginTop:48, padding:24, borderTop:"1px solid var(--border-subtle)", textAlign:"center", color:"var(--text-dim)", fontSize:12 }}>
        ToolHub Architecture v2.4.0-stable · © 2026 Professional AI Infrastructure
      </footer>

      <RegisterToolModal 
        isOpen={isRegisterOpen} 
        onClose={() => setIsRegisterOpen(false)} 
        onRegister={handleRegister}
        BASE_URL={BASE_URL}
      />
    </div>
  );
}
