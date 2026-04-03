import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { secColor } from "./ui";

export function HourlyVolumeChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} barSize={7}>
        <XAxis dataKey="hour" tickFormatter={(h) => new Date(h).getHours() + 'h'} tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false} interval={3}/>
        <YAxis tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false}/>
        <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,color:"#e2e8f0",fontSize:11}}/>
        <Bar dataKey="calls" radius={[3,3,0,0]}>
          {data.map((_,i)=><Cell key={i} fill={`rgba(99,102,241,${0.3+(i/24)*0.6})`}/>)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SecurityDistributionChart({ tools }) {
  return (
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
  );
}
