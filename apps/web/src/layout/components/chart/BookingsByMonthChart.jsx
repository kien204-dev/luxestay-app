import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function BookingsByMonthChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid stroke="rgba(64,72,93,0.15)" />
        <XAxis dataKey="month" stroke="#5a6480" />
        <YAxis stroke="#5a6480" allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(15,23,42,0.9)",
            border: "1px solid rgba(159,167,255,0.3)",
            borderRadius: 8,
          }}
          labelStyle={{ color: "#9fa7ff" }}
          formatter={(value) => [value, "Bookings"]}
        />
        <Bar dataKey="bookings" fill="#60a5fa" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default BookingsByMonthChart;
