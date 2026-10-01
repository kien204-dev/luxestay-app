import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function OccupancyChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid stroke="rgba(64,72,93,0.25)" />
        <XAxis dataKey="month" stroke="#5a6480" />
        <YAxis stroke="#5a6480" />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#9fa7ff"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
