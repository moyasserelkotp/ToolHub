import { useState, useEffect } from "react";
import { Pill, ScoreBadge, Box, Note } from "../components/ui";

const BASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:3000";

export default function Marketplace() {
  const [tools, setTools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTool, setSelectedTool] = useState(null);
  const [ratings, setRatings] = useState({ average: 0, total: 0, reviews: [] });
  const [installing, setInstalling] = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${BASE_URL}/marketplace/categories`);
      if (res.ok) setCategories(await res.json());
    } catch(err) { console.error(err); }
  };

  const fetchTools = async () => {
    setLoading(true);
    let url = `${BASE_URL}/marketplace/tools?limit=100`;
    if (selectedCat) url += `&category=${selectedCat}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTools(data.tools || []);
      }
    } catch(err) { console.error(err); }
    setLoading(false);
  };

  const performSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return fetchTools();
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/tools/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 20 })
      });
      if (res.ok) {
        const data = await res.json();
        setTools((data.results || []).map(r => ({ ...r, name: r.tool_name })));
      }
    } catch(err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!searchQuery) fetchTools();
  }, [selectedCat]);

  const viewToolDetails = async (tool) => {
    setSelectedTool(tool);
    try {
      const res = await fetch(`${BASE_URL}/marketplace/tools/${tool.id || tool.tool_id}/ratings`);
      if (res.ok) setRatings(await res.json());
    } catch(err) { console.error(err); }
  };

  const handleInstall = () => {
    setInstalling(true);
    setTimeout(() => {
      setInstalling(false);
      alert(`Tool ${selectedTool.name} installed to your organization successfully!`);
    }, 800);
  };

  if (selectedTool) {
    return (
      <Box className="animate-fade-in">
        <button 
          onClick={() => setSelectedTool(null)} 
          style={{ background:"transparent", border:"none", color:"var(--accent-primary)", cursor:"pointer", marginBottom:20, fontSize:13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back to Marketplace
        </button>
        
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h2 style={{ fontSize:32, color:"var(--text-primary)", margin: 0, fontWeight: 800, letterSpacing: "-0.8px" }}>{selectedTool.name}</h2>
              <span style={{ color:"var(--text-dim)", fontSize:13, fontFamily: "var(--font-mono)", marginTop: 6 }}>v{selectedTool.version || '1.0.0'}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill cat={selectedTool.category}/>
              <ScoreBadge s={selectedTool.security_score || 0}/>
            </div>
          </div>
          <button 
            onClick={handleInstall} 
            disabled={installing} 
            style={{ 
              background:"var(--accent-primary)", 
              color:"white", 
              border:"none", 
              padding:"12px 28px", 
              borderRadius: "var(--radius-md)", 
              cursor:"pointer", 
              fontWeight: 700, 
              opacity: installing ? 0.7 : 1,
              transition: "all 0.2s ease",
              boxShadow: "0 4px 12px var(--accent-glow)"
            }}
          >
            {installing ? "Installing..." : "+ Install to Organization"}
          </button>
        </div>
        
        <p style={{ marginTop:24, color:"var(--text-secondary)", lineHeight:1.7, fontSize: 15, maxWidth: "800px" }}>{selectedTool.description}</p>
        
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:48, marginTop:40 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--text-secondary)", marginBottom:20, textTransform:"uppercase", letterSpacing:1.5, fontFamily:"var(--font-mono)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 4, height: 14, background: "var(--accent-primary)", borderRadius: 2 }} />
              Reviews & Ratings ({ratings.total})
            </div>
            
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom:24 }}>
              <span style={{ fontSize:42, color:"var(--text-primary)", fontWeight:800 }}>{ratings.average}</span>
              <span style={{ fontSize:18, color:"var(--text-dim)" }}>/ 5.0</span>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {ratings.reviews.map((r, i) => (
                <div key={i} className="glass" style={{ padding: 20, borderRadius: "var(--radius-md)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                    <span style={{ color:"var(--text-primary)", fontSize:14, fontWeight: 600 }}>{r.username}</span>
                    <span style={{ color:"var(--warning)", fontSize:12, letterSpacing: 2 }}>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</span>
                  </div>
                  <p style={{ color:"var(--text-secondary)", fontSize:14, margin:0, lineHeight: 1.6 }}>{r.review}</p>
                </div>
              ))}
              {ratings.reviews.length === 0 && <Note>No reviews yet for this tool.</Note>}
            </div>
          </div>

          <Box title="Tool Details" transparent>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ fontSize:10, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>Registry ID</div>
                <div style={{ color:"var(--accent-secondary)", fontSize:12, fontFamily: "var(--font-mono)" }}>{selectedTool.id || selectedTool.tool_id}</div>
              </div>
              <div>
                <div style={{ fontSize:10, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>Usage Frequency</div>
                <div style={{ color:"var(--text-primary)", fontSize:15, fontWeight: 600 }}>{(selectedTool.usage_count || 0).toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>total calls</span></div>
              </div>
              <div>
                <div style={{ fontSize:10, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>Authentication</div>
                <div style={{ display: "flex" }}>
                   <span style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", padding: "4px 10px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
                     {selectedTool.auth_type || 'none'}
                   </span>
                </div>
              </div>
            </div>
          </Box>
        </div>
      </Box>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display:"flex", gap:32 }}>
      {/* Sidebar */}
      <div style={{ width:220, flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"var(--text-dim)", marginBottom:20, textTransform:"uppercase", letterSpacing:1.5, fontFamily:"var(--font-mono)" }}>Categories</div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <button 
            onClick={() => { setSelectedCat(null); setSearchQuery(""); }} 
            style={{ 
              textAlign:"left", 
              background: !selectedCat ? "rgba(99,102,241,0.12)" : "transparent", 
              color: !selectedCat ? "var(--accent-primary)" : "var(--text-secondary)", 
              border:"none", padding:"10px 16px", borderRadius: "var(--radius-md)", cursor:"pointer", fontSize:14, fontWeight: 600,
              transition: "all 0.2s ease"
            }}
          >
            All Discoveries
          </button>
          {categories.map(c => (
            <button 
              key={c.category} 
              onClick={() => setSelectedCat(c.category)} 
              style={{ 
                textAlign:"left", 
                background: selectedCat === c.category ? "rgba(99,102,241,0.12)" : "transparent", 
                color: selectedCat === c.category ? "var(--accent-primary)" : "var(--text-secondary)", 
                border:"none", padding:"10px 16px", borderRadius: "var(--radius-md)", cursor:"pointer", fontSize:14, 
                display:"flex", justifyContent:"space-between", alignItems: "center",
                transition: "all 0.2s ease"
              }}
            >
              <span style={{ textTransform:"capitalize" }}>{c.category}</span>
              <span style={{ color:"var(--text-dim)", fontSize:11, fontFamily: "var(--font-mono)" }}>{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex:1 }}>
        <form onSubmit={performSearch} style={{ display:"flex", gap:12, marginBottom:32 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}>🔍</span>
            <input 
              type="text" 
              placeholder="Search tools with natural language... (e.g. 'Generate an image of a cat')" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass"
              style={{ 
                width: "100%", 
                background:"var(--bg-card)", 
                color:"var(--text-primary)", 
                padding:"14px 16px 14px 44px", 
                borderRadius: "var(--radius-lg)", 
                fontSize:15,
                outline: "none",
                fontWeight: "500"
              }}
            />
          </div>
          <button 
            type="submit" 
            style={{ 
              background:"var(--accent-primary)", 
              color:"white", 
              border:"none", 
              padding:"0 32px", 
              borderRadius: "var(--radius-lg)", 
              cursor:"pointer", 
              fontWeight: 700,
              boxShadow: "0 4px 12px var(--accent-glow)"
            }}
          >
            Discover
          </button>
        </form>

        {loading ? (
          <div style={{ color:"var(--text-secondary)", padding:80, textAlign:"center", fontSize: 13, fontFamily: "var(--font-mono)", letterSpacing: 2 }}>
            SYNCHRONIZING REPOSTORY...
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:20 }}>
            {tools.map(t => (
              <div 
                key={t.id || t.tool_id} 
                onClick={() => viewToolDetails(t)} 
                className="glass-card"
                style={{ padding:24, cursor:"pointer" }}
              >
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <h3 style={{ fontSize:18, color:"var(--text-primary)", margin:0, fontWeight: 700, letterSpacing: "-0.4px" }}>{t.name}</h3>
                  <ScoreBadge s={t.security_score || (t.score && Math.round(t.score * 100)) || 0}/>
                </div>
                <p style={{ color:"var(--text-secondary)", fontSize:14, lineHeight:1.6, marginBottom:20, height: 44, overflow:"hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{t.description}</p>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
                  <Pill cat={t.category}/>
                  <span style={{ color:"var(--text-dim)", fontSize:12, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{(t.usage_count || 0).toLocaleString()} CALLS</span>
                </div>
              </div>
            ))}
            {tools.length === 0 && (
              <div style={{ gridColumn:"1/-1", padding: 60 }}>
                <Note>No tools discovered matching your criteria. Try adjusting your search query.</Note>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
