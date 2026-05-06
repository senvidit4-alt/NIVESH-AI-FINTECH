"use client";
import {
  AreaChart as ReAreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DataPoint { time: string; price: number; }

interface AreaChartProps {
  data: DataPoint[];
  title?: string;
}

export function AreaChart({ data, title }: AreaChartProps) {
  return (
    <div className="glass p-5 h-full">
      {title && <h3 className="text-sm font-semibold text-slate-300 mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={220}>
        <ReAreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,95,0.3)" />
          <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false}
            domain={["auto", "auto"]} tickFormatter={(v) => v.toLocaleString("en-IN")} width={70} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid rgba(30,58,95,0.5)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#3b82f6" }}
          />
          <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2}
            fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: "#3b82f6" }} />
        </ReAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
