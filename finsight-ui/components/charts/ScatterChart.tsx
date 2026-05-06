"use client";
import {
  ScatterChart as ReScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ZAxis,
} from "recharts";
import { EfficientFrontierPoint } from "@/types";

interface Props { data: EfficientFrontierPoint[]; }

export function ScatterChart({ data }: Props) {
  const maxSharpe = Math.max(...data.map((d) => d.sharpe_ratio));
  const optimal = data.find((d) => d.sharpe_ratio === maxSharpe);

  const plotData = data.map((d) => ({
    x: d.annual_volatility,
    y: d.annual_return,
    z: d.sharpe_ratio,
    optimal: d === optimal,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ReScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,95,0.3)" />
        <XAxis dataKey="x" name="Volatility" unit="%" tick={{ fill: "#475569", fontSize: 10 }}
          tickLine={false} axisLine={false} label={{ value: "Volatility (%)", position: "insideBottom", offset: -10, fill: "#475569", fontSize: 11 }} />
        <YAxis dataKey="y" name="Return" unit="%" tick={{ fill: "#475569", fontSize: 10 }}
          tickLine={false} axisLine={false} label={{ value: "Return (%)", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 11 }} />
        <ZAxis dataKey="z" range={[20, 80]} />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid rgba(30,58,95,0.5)", borderRadius: 8, fontSize: 11 }}
          cursor={{ strokeDasharray: "3 3" }}
          formatter={(v, name) => [`${Number(v).toFixed(2)}${name === "z" ? "" : "%"}`, name === "x" ? "Volatility" : name === "y" ? "Return" : "Sharpe"]}
        />
        <Scatter data={plotData} fill="#3b82f6" fillOpacity={0.6} />
        {optimal && (
          <Scatter
            data={[{ x: optimal.annual_volatility, y: optimal.annual_return, z: optimal.sharpe_ratio }]}
            fill="#f59e0b" fillOpacity={1}
          />
        )}
      </ReScatterChart>
    </ResponsiveContainer>
  );
}
