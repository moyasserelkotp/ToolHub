import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { io } from "socket.io-client";

// ── Constants ─────────────────────────────────────────────────────────────────
// Set VITE_API_URL in .env to override for non-localhost deployments
const BASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:3000";
const socket = io(BASE_URL);

const CAT_COLOR = {
  research:"#6366f1", development:"#0ea5e9", communication:"#10b981",
  data:"#f59e0b", media:"#ec4899", language:"#8b5cf6", storage:"#64748b",
};
const secColor = s => s >= 80 ? "#10b981" : s >= 60 ? "#f59e0b" : "#ef4444";
const msColor  = m => m > 2000 ? "#ef4444" : m > 500 ? "#f59e0b" : "#10b981";

// ── Mini components ───────────────────────────────────────────────────────────
const S = { p: { color:"#94a3b8", fontSize:13, lineHeight:1.7, marginBottom:12 } };

function Card({ label, value, sub, c }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"18px 22px", flex:1, minWidth:140 }}>
      <div style={{ color:"#64748b", fontSize:10, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, color:c||"#f1f5f9" }}>{value}</div>
      {sub && <div style={{ color:"#475569", fontSize:11, marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function ScoreBadge({ s }) {
  const c = secColor(s);
  return <span style={{ background:`${c}22`, color:c, border:`1px solid ${c}44`, borderRadius:4, padding:"2px 7px", fontSize:11, fontFamily:"monospace", fontWeight:700 }}>{s}/100</span>;
}

function Pill({ cat }) {
  const c = CAT_COLOR[cat]||"#64748b";
  return <span style={{ background:`${c}22`, color:c, border:`1px solid ${c}44`, borderRadius:20, padding:"2px 9px", fontSize:10, textTransform:"uppercase", letterSpacing:0.5 }}>{cat}</span>;
}

function Feed({ calls }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:340, overflowY:"auto" }}>
      {calls.map((c,i) => (
        <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:7,
          background: i===0 ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
          border:     i===0 ? "1px solid rgba(99,102,241,0.25)" : "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ fontSize:12 }}>{c.success?"✅":"❌"}</span>
          <span style={{ color:"#e2e8f0", fontFamily:"monospace", fontSize:12, flex:1 }}>{c.tool_name}</span>
          <span style={{ color:"#64748b", fontSize:11 }}>{c.agent_id}</span>
          <span style={{ color:msColor(c.latency_ms), fontFamily:"monospace", fontSize:11, width:54, textAlign:"right" }}>{c.latency_ms}ms</span>
          {c.error_type && <span style={{ color:"#ef4444", fontSize:10 }}>{c.error_type}</span>}
          <span style={{ color:"#334155", fontSize:10 }}>{new Date(c.timestamp).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

function Box({ title, children }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:22 }}>
      {title && <div style={{ fontSize:10, fontWeight:600, color:"#94a3b8", marginBottom:16, textTransform:"uppercase", letterSpacing:1, fontFamily:"monospace" }}>{title}</div>}
      {children}
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:24 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
        <span style={{ fontSize:18 }}>{icon}</span>
        <span style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Pre({ children }) {
  return <pre style={{ background:"#0d1117", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"13px 15px", fontFamily:"monospace", fontSize:12, color:"#a5f3fc", overflowX:"auto", lineHeight:1.65, marginBottom:12, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{children}</pre>;
}

function Mono({ children }) {
  return <span style={{ fontFamily:"monospace", fontSize:12, color:"#a5b4fc", background:"rgba(99,102,241,0.15)", borderRadius:3, padding:"1px 5px" }}>{children}</span>;
}

function Note({ children }) {
  return <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#fcd34d", lineHeight:1.6 }}>💡 {children}</div>;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState("overview");
  const [data, setData]         = useState(null);       // analytics overview
  const [allTools, setAllTools] = useState([]);         // full tool registry list
  const [marketplaceTools, setMarketplaceTools] = useState([]); // public tools
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tick, setTick]         = useState(0);

  const fetchData = async () => {
    try {
      const [overviewResp, toolsResp, mktResp] = await Promise.all([
        fetch(`${BASE_URL}/analytics/overview`),
        fetch(`${BASE_URL}/tools?limit=100`),
        fetch(`${BASE_URL}/marketplace/tools?limit=100`),
      ]);
      if (!overviewResp.ok || !toolsResp.ok || !mktResp.ok) throw new Error("API error");
      const [overview, toolList, mktList] = await Promise.all([
        overviewResp.json(),
        toolsResp.json(),
        mktResp.json(),
      ]);
      setData(overview);
      setAllTools(toolList.tools || []);
      setMarketplaceTools(mktList.tools || []);
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

    socket.on("live_call", handleLiveCall);
    socket.on("tool_registered", fetchData);

    const id = setInterval(() => {
      fetchData();
      setTick(t => t + 1);
    }, 10000); // Poll every 10s

    return () => {
      clearInterval(id);
      socket.off("live_call", handleLiveCall);
      socket.off("tool_registered", fetchData);
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
  const TABS = ["overview", "marketplace", "tools", "security", "calls", "how to use"];


  return (
    <div style={{ minHeight:"100vh", background:"#070b14", color:"#e2e8f0", fontFamily:"system-ui,sans-serif" }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}
      </style>

      {/* Header */}
      <div style={{ borderBottom:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(16px)", position:"sticky", top:0, zIndex:50, padding:"0 24px" }}>
        <div style={{ maxWidth:"100%", margin:"0 auto", display:"flex", alignItems:"center", height:54, gap:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#6366f1,#0ea5e9)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>⚙</div>
            <span style={{ fontWeight:800, fontSize:16, letterSpacing:-0.5 }}>ToolHub</span>
            <span style={{ background:"#6366f120", color:"#818cf8", border:"1px solid #6366f140", borderRadius:4, padding:"1px 5px", fontSize:10, fontFamily:"monospace" }}>v1.0</span>
          </div>
          <div style={{ display:"flex", gap:2, flex:1 }}>
            {TABS.map(t => (
              <button key={t} onClick={()=>setTab(t)} style={{
                background: tab===t ? "rgba(99,102,241,0.15)" : "transparent",
                border:     tab===t ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
                color:      tab===t ? "#a5b4fc" : "#64748b",
                borderRadius:6, padding:"4px 12px", fontSize:12, cursor:"pointer",
                textTransform:"capitalize", fontWeight:500,
              }}>{t}</button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#10b981", animation:"pulse 2s infinite" }}/>
            <span style={{ color:"#10b981", fontSize:11, fontFamily:"monospace" }}>LIVE · {tick}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:"100%", margin:"0 auto", padding:"26px 24px" }}>

        {/* ── OVERVIEW ── */}
        {tab==="overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <Card label="Registered Tools"  value={allTools.length || tools.length} sub="All active"    c="#6366f1"/>
              <Card label="Calls 24h"  value={totalCalls.toLocaleString()} sub="All tools" c="#0ea5e9"/>
              <Card label="Avg Security" value={`${avgScore}/100`}  sub="Platform avg"  c="#10b981"/>
              <Card label="Error Rate" value={`${errPct}%`}         sub="Last 24h"      c={parseFloat(errPct)>5?"#ef4444":"#f59e0b"}/>
              <Card label="Active Agents" value={uniqueAgents || "—"} sub="Last 24h"   c="#8b5cf6"/>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
              <Box title="Hourly Volume (24h)">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={hourly_volume} barSize={7}>
                    <XAxis dataKey="hour" tickFormatter={(h) => new Date(h).getHours() + 'h'} tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false} interval={3}/>
                    <YAxis tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,color:"#e2e8f0",fontSize:11}}/>
                    <Bar dataKey="calls" radius={[3,3,0,0]}>
                      {hourly_volume.map((_,i)=><Cell key={i} fill={`rgba(99,102,241,${0.3+(i/24)*0.6})`}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>

              <Box title="Security Leaderboard">
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[...tools].sort((a,b)=>b.security_score-a.security_score).map((t,i)=>(
                    <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ color:"#334155", width:18, fontSize:10 }}>#{i+1}</span>
                      <span style={{ flex:1, fontSize:11, color:"#cbd5e1", fontFamily:"monospace" }}>{t.name}</span>
                      <div style={{ width:64, background:"#1e293b", borderRadius:3, height:5, overflow:"hidden" }}>
                        <div style={{ width:`${t.security_score}%`, height:"100%", background:secColor(t.security_score), borderRadius:3 }}/>
                      </div>
                      <ScoreBadge s={t.security_score}/>
                    </div>
                  ))}
                </div>
              </Box>
            </div>

            <Box title="Real-Time Call Feed">
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div/>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:"#10b981", animation:"pulse 2s infinite" }}/>
                  <span style={{ color:"#10b981", fontSize:10, fontFamily:"monospace" }}>streaming</span>
                </div>
              </div>
              <Feed calls={calls}/>
            </Box>
          </div>
        )}

        {/* ── MARKETPLACE ── */}
        {tab==="marketplace" && (
          <Box>
            <div style={{ marginBottom:14, fontFamily:"monospace", fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:1 }}>Public Marketplace — {marketplaceTools.length} tool{marketplaceTools.length !== 1 ? 's' : ''} available</div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"rgba(0,0,0,0.2)" }}>
                  {["Tool","Category","Total Usage","Security","Status"].map(h=>(
                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:"#475569", fontSize:10, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:0.5, fontWeight:500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {marketplaceTools.map((t,i)=>(
                  <tr key={t.id} style={{ borderTop:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
                    <td style={{ padding:"10px 12px", fontFamily:"monospace", color:"#e2e8f0", fontSize:12 }}>{t.name}</td>
                    <td style={{ padding:"10px 12px" }}><Pill cat={t.category}/></td>
                    <td style={{ padding:"10px 12px", color:"#94a3b8", fontSize:12 }}>{(t.usage_count || 0).toLocaleString()}</td>
                    <td style={{ padding:"10px 12px" }}><ScoreBadge s={t.security_score}/></td>
                    <td style={{ padding:"10px 12px" }}>
                      <span style={{ background: t.health_status === 'degraded' ? '#ef444420' : '#10b98118', color: t.health_status === 'degraded' ? '#ef4444' : '#10b981', border: `1px solid ${t.health_status === 'degraded' ? '#ef444440' : '#10b98133'}`, borderRadius:4, padding:"2px 7px", fontSize:10, fontFamily:"monospace" }}>
                        {t.health_status || t.status || 'active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}

        {/* ── TOOLS ── */}
        {tab==="tools" && (
          <Box>
            <div style={{ marginBottom:14, fontFamily:"monospace", fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:1 }}>Tool Registry — {allTools.length} tool{allTools.length !== 1 ? 's' : ''}</div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"rgba(0,0,0,0.2)" }}>
                  {["Tool","Category","Auth Type","Total Usage","Security","Status"].map(h=>(
                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:"#475569", fontSize:10, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:0.5, fontWeight:500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTools.map((t,i)=>(
                  <tr key={t.id} style={{ borderTop:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
                    <td style={{ padding:"10px 12px", fontFamily:"monospace", color:"#e2e8f0", fontSize:12 }}>{t.name}</td>
                    <td style={{ padding:"10px 12px" }}><Pill cat={t.category}/></td>
                    <td style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontFamily:"monospace" }}>{t.auth_type || '—'}</td>
                    <td style={{ padding:"10px 12px", color:"#94a3b8", fontSize:12 }}>{(t.usage_count || 0).toLocaleString()}</td>
                    <td style={{ padding:"10px 12px" }}><ScoreBadge s={t.security_score}/></td>
                    <td style={{ padding:"10px 12px" }}>
                      <span style={{ background: t.health_status === 'degraded' ? '#ef444420' : '#10b98118', color: t.health_status === 'degraded' ? '#ef4444' : '#10b981', border: `1px solid ${t.health_status === 'degraded' ? '#ef444440' : '#10b98133'}`, borderRadius:4, padding:"2px 7px", fontSize:10, fontFamily:"monospace" }}>
                        {t.health_status || t.status || 'active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}

        {/* ── SECURITY ── */}
        {tab==="security" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <Card label="Avg Score" value={`${avgScore}/100`} c="#10b981"/>
              <Card label="Auth Gap" value={`${tools.filter(t=>!t.auth_type||t.auth_type==='none').length === 0 ? '0%' : Math.round(tools.filter(t=>!t.auth_type||t.auth_type==='none').length/tools.length*100)+'%'}`} sub={tools.filter(t=>!t.auth_type||t.auth_type==='none').length === 0 ? 'All tools authenticated' : 'Tools without auth'} c={tools.filter(t=>!t.auth_type||t.auth_type==='none').length === 0 ? "#10b981" : "#ef4444"}/>
              <Card label="Min Score" value={tools.length > 0 ? `${Math.min(...tools.map(t=>t.security_score||0))}/100` : '—'} sub="Lowest in registry" c="#f59e0b"/>
              <Card label="Threshold" value="40/100" sub="Registration minimum" c="#6366f1"/>
            </div>
            <Box title="Score Distribution">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[...tools].sort((a,b)=>b.security_score-a.security_score)} layout="vertical" barSize={18}>
                  <XAxis type="number" domain={[0,100]} tick={{fill:"#475569",fontSize:10}} tickLine={false} axisLine={false}/>
                  <YAxis type="category" dataKey="name" tick={{fill:"#94a3b8",fontSize:10,fontFamily:"monospace"}} tickLine={false} axisLine={false} width={145}/>
                  <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,color:"#e2e8f0",fontSize:11}}/>
                  <Bar dataKey="security_score" radius={[0,4,4,0]}>
                    {[...tools].sort((a,b)=>b.security_score-a.security_score).map((t,i)=><Cell key={i} fill={secColor(t.security_score)}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop:14, padding:14, background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.2)", borderRadius:8 }}>
                <div style={{ color:"#10b981", fontSize:12, fontWeight:600 }}>✅ ToolHub fixes the 41% auth gap in the MCP ecosystem</div>
                <div style={{ color:"#64748b", fontSize:12, marginTop:4 }}>Tools scoring below 40/100 are rejected at registration. OAuth tools score 80+, unauthenticated tools score 0.</div>
              </div>
            </Box>
          </div>
        )}

        {/* ── CALLS ── */}
        {tab==="calls" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <Box title="Live Call Stream">
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <span style={{ color:"#10b981", fontSize:10, fontFamily:"monospace", background:"#10b98116", border:"1px solid #10b98133", borderRadius:4, padding:"2px 8px" }}>
                  {successCalls}/{(calls||[]).length} success
                </span>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:"#10b981", animation:"pulse 2s infinite" }}/>
                  <span style={{ color:"#10b981", fontSize:10, fontFamily:"monospace" }}>live · {tick}</span>
                </div>
              </div>
              <Feed calls={calls||[]}/>
            </Box>

            <Box title="Error Rate Heatmap (24h)">
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {(error_heatmap||[]).map(t=>(
                  <div key={t.name} style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ width:150, fontSize:11, color:"#cbd5e1", fontFamily:"monospace" }}>{t.name}</span>
                    <div style={{ flex:1, background:"#1e293b", borderRadius:4, height:10, overflow:"hidden" }}>
                      <div style={{ width:`${Math.min((parseFloat(t.error_pct)||0)*10,100)}%`, height:"100%", background:(t.error_pct||0)>5?"#ef4444":(t.error_pct||0)>2?"#f59e0b":"#10b981", borderRadius:4, minWidth:(t.error_pct||0)>0?3:0 }}/>
                    </div>
                    <span style={{ width:36, textAlign:"right", fontSize:10, fontFamily:"monospace", color:(t.error_pct||0)>5?"#ef4444":"#64748b" }}>{parseFloat(t.error_pct||0).toFixed(1)}%</span>
                  </div>
                ))}
                {(!error_heatmap || error_heatmap.length === 0) && (
                  <div style={{ color:"#475569", fontSize:12, textAlign:"center", padding:"20px 0" }}>No call data yet — invoke some tools to see error rates</div>
                )}
              </div>
            </Box>
          </div>
        )}

        {/* ── HOW TO USE ── */}
        {tab==="how to use" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20, maxWidth:860 }}>

            <div style={{ background:"linear-gradient(135deg,rgba(99,102,241,0.12),rgba(14,165,233,0.08))", border:"1px solid rgba(99,102,241,0.25)", borderRadius:14, padding:26 }}>
              <div style={{ fontSize:20, fontWeight:800, marginBottom:8, letterSpacing:-0.5 }}>⚙ Get started with ToolHub</div>
              <p style={{ color:"#94a3b8", fontSize:14, lineHeight:1.7, margin:0 }}>AI tool registry with semantic discovery, AES-256 credential vault, schema versioning, health monitoring, and full observability. Below is everything you need.</p>
            </div>

            <Section title="1 — Start the backend" icon="🗄️">
              <p style={S.p}>Install dependencies, set up Postgres, then run three commands:</p>
              <Pre>{`cd server
cp .env.example .env       # fill in DATABASE_URL + secrets
npm install
npm run migrate            # creates all 7 tables
npm run seed               # registers 10 example tools
npm start                  # → http://localhost:3000`}</Pre>
              <p style={S.p}>Visit <Mono>http://localhost:3000</Mono> for the full endpoint reference (GET /).</p>
            </Section>

            <Section title="2 — Install the Python SDK" icon="🐍">
              <Pre>{`pip install -e ./sdk      # local install
# or: pip install toolhub-sdk  (once published to PyPI)`}</Pre>
              <Pre>{`from toolhub_sdk import ToolHub

hub = ToolHub(
    base_url="http://localhost:3000",
    operator_id="my-team",    # scopes credential lookups
    agent_id="my-agent",      # logged in analytics
)`}</Pre>
            </Section>

            <Section title="3 — Discover tools semantically" icon="🔍">
              <p style={S.p}>No keyword matching — plain English ranked by cosine similarity × security × usage:</p>
              <Pre>{`tools = hub.search("I need to search the web")
# [<Tool 'web_search' score=0.924>, <Tool 'github' score=0.631>, …]

tools = hub.search("send a message to my team")
# [<Tool 'slack' score=0.901>, <Tool 'email' score=0.812>, …]

# Full schema + version history
tool = hub.get(tools[0].id)
print(tool.json_schema)     # full parameter spec`}</Pre>
            </Section>

            <Section title="4 — Register encrypted credentials" icon="🔐">
              <p style={S.p}>Keys are encrypted with AES-256-GCM before storage. Agents never touch the raw key — they receive a 15-min JWT instead:</p>
              <Pre>{`hub.register_credential(
    tool_id=tool.id,
    api_key="sk-real-key-here",   # AES-256-GCM encrypted at rest
    auth_type="api_key",
)
# → {"credential": {"key_hint": "sk-…ere", …}}`}</Pre>
              <Note>Tools scoring below 40/100 are rejected at registration. OAuth tools score 80+. A tool with no auth and no schema scores 0.</Note>
            </Section>

            <Section title="5 — Invoke with auto-injected credentials" icon="⚡">
              <Pre>{`result = hub.invoke(tool.id, {
    "query": "latest AI news",
    "num_results": 5,
})
print(result.success)    # True
print(result.latency_ms) # 312
print(result.data)       # {"results": […]}`}</Pre>
              <p style={S.p}>Built-in retry: 3 attempts with exponential back-off. Server failures (5xx) are retried; client errors (4xx) are not.</p>
            </Section>

            <Section title="6 — The 7-line demo agent" icon="🤖">
              <Pre>{`from toolhub_sdk import ToolHub

hub   = ToolHub(api_key="demo-key")
web   = hub.search("web search")[0]
email = hub.search("send email")[0]

news = hub.invoke(web.id,   {"query": "latest AI news"})
sent = hub.invoke(email.id, {"to": "you@example.com",
                              "body": str(news.data)})
# ✅ Credentials injected. Calls logged. Agent saw zero keys.`}</Pre>
              <Pre>{`cd demo
python demo_agent.py             # quick demo
python demo_agent.py --full      # full walkthrough
python demo_agent.py --search-test  # accuracy test`}</Pre>
            </Section>

            <Section title="7 — LangChain & OpenAI" icon="🔗">
              <Pre>{`# LangChain — drop-in wrapper
lc = hub.as_langchain_tool(tool.id)
agent = initialize_agent([lc], llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)
agent.run("Search for the latest AI benchmarks")

# OpenAI function calling
fn = hub.as_openai_function(tool.id)
# → {"name": "web_search", "description": "…", "parameters": {…}}

resp = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role":"user","content":"Find AI news"}],
    tools=[{"type":"function","function":fn}],
)
result = hub.handle_openai_tool_call(resp.choices[0].message.tool_calls[0])`}</Pre>
            </Section>

            <Section title="8 — Webhooks & health monitoring" icon="🔔">
              <Pre>{`# Subscribe to events
POST /webhooks
{"tool_id":"…","agent_id":"my-agent",
 "callback_url":"https://me.com/hook",
 "events":["degraded","schema_change","restored"]}
# → response includes HMAC signing secret

# Check health
GET /tools/:id/health
# → {uptime_percent:99.8, avg_response_ms:220,
#    consecutive_fails:0, last_checked:"…"}`}</Pre>
              <Note>Health checks run every 6 hours. After 3 consecutive failures the tool is marked <Mono>degraded</Mono> and all subscribed webhooks fire instantly.</Note>
            </Section>

            <Section title="API quick reference" icon="📋">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  ["POST /tools",              "Register tool (score ≥ 40)"],
                  ["GET  /tools",              "List — ?category &auth_type &sort"],
                  ["GET  /tools/:id",          "Details + schema + versions"],
                  ["POST /tools/search",       'Semantic search { "query": "…" }'],
                  ["GET  /tools/:id/health",   "Uptime %, fail streak, checks"],
                  ["GET  /tools/:id/invoke-config","15-min JWT token"],
                  ["POST /credentials",        "Store AES-256-GCM key"],
                  ["POST /webhooks",           "Subscribe to change events"],
                  ["GET  /analytics/overview", "Dashboard summary"],
                  ["GET  /analytics/tools/:id","Deep tool stats + p95 latency"],
                ].map(([r,d])=>(
                  <div key={r} style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, padding:"9px 12px" }}>
                    <div style={{ fontFamily:"monospace", fontSize:11, color:"#a5b4fc", marginBottom:3 }}>{r}</div>
                    <div style={{ fontSize:12, color:"#64748b" }}>{d}</div>
                  </div>
                ))}
              </div>
            </Section>

          </div>
        )}

      </div>
    </div>
  );
}
