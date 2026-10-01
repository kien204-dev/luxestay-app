import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function TopRoomsChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid stroke="rgba(64,72,93,0.15)" />
        <XAxis type="number" stroke="#5a6480" allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="room_name"
          width={110}
          stroke="#5a6480"
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(15,23,42,0.9)",
            border: "1px solid rgba(159,167,255,0.3)",
            borderRadius: 8,
          }}
          labelStyle={{ color: "#9fa7ff" }}
          formatter={(value, name) => [
            name === "booking_count" ? value : Number(value).toLocaleString("vi-VN"),
            name === "booking_count" ? "Bookings" : "Revenue",
          ]}
        />
        <Bar dataKey="booking_count" fill="#67e8b4" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default TopRoomsChart;
