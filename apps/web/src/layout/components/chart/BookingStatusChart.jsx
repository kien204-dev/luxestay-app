import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const COLORS = ["#67e8b4", "#fbbf24", "#9fa7ff", "#f87171"];

// 👇 NHẬN DATA TỪ PROPS
export default function BookingStatusChart({ data }) {

  // ❗ tránh crash khi data undefined
  if (!data || data.length === 0) return null;

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}   // ✅ dùng props
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={entry.color || COLORS[index % COLORS.length]} />
            ))}
          </Pie>

          <Tooltip formatter={(value) => `${value}`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
