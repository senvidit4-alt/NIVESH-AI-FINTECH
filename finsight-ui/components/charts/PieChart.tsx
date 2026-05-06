"use client";
import { PieChart as RePieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#3b82f6","#10b981","#8b5cf6","#f59e0b","#ef4444","#06b6d4","#ec4899","#84cc16"];

interface PieData { name: string; value: number; }

export function PieChart({ data, title }: { data: PieData[]; title?: string }) {
  return (
    <div className="glass p-5">
      {title && <h3 className="text-sm font-semibold text-slate-300 mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={260}>
        <RePieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
            paddingAngle={3} dataKey="value">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid rgba(30,58,95,0.5)", borderRadius: 8, fontSize: 12 }}
            formatter={(v) => [Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }), ""]}
          />
          <Legend iconType="circle" iconSize={8}
            formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 11 }}>{v}</span>} />
        </RePieChart>
      </ResponsiveContainer>
    </div>
  );
}
