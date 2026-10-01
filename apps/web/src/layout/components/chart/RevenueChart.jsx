import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function RevenueChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
          </linearGradient>
        </defs>

        <CartesianGrid stroke="rgba(64,72,93,0.15)" />

        <XAxis dataKey="month" stroke="#5a6480" />

        <YAxis
          width={60}
          stroke="#5a6480"
          tickFormatter={(value) => {
            if (value >= 1000000) return value / 1000000 + "M";
            if (value >= 1000) return value / 1000 + "K";
            return value;
          }}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(15,23,42,0.9)",
            border: "1px solid rgba(159,167,255,0.3)",
            borderRadius: 8,
          }}
          labelStyle={{ color: "#9fa7ff" }}
          formatter={(value) => [
            value.toLocaleString("vi-VN") + " ₫",
            "Doanh thu",
          ]}
        />

        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#6366f1"
          strokeWidth={3}
          fill="url(#colorRevenue)"
          dot={false}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default RevenueChart;
