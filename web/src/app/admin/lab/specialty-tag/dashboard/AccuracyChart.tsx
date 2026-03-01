"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface WeekPoint {
  label: string; // e.g. "W05"
  accuracy: number | null;
  total: number;
}

interface Props {
  data: WeekPoint[];
}

export default function AccuracyChart({ data }: Props) {
  const hasData = data.some((d) => d.accuracy !== null);

  if (!hasData) {
    return (
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: "13px" }}>
        Ikke nok data endnu
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#888" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#888" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
          width={36}
        />
        <Tooltip
          formatter={(value: number | undefined) => [`${value ?? "—"}%`, "Nøjagtighed"]}
          contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #dde3ed" }}
        />
        <ReferenceLine y={80} stroke="#dde3ed" strokeDasharray="4 2" />
        <Line
          type="monotone"
          dataKey="accuracy"
          stroke="#E83B2A"
          strokeWidth={2}
          dot={{ r: 3, fill: "#E83B2A", strokeWidth: 0 }}
          connectNulls={false}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
