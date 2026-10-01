import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../services/api";
import { isStrongPassword } from "../utils/password";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Liên kết đặt lại mật khẩu không hợp lệ.");
      return;
    }

    if (!isStrongPassword(password)) {
      setError("Mật khẩu cần tối thiểu 8 ký tự, gồm cả chữ và số");
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu không khớp");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/reset-password", {
        token,
        password,
      });
      setSuccess(res.data?.message || "Đặt lại mật khẩu thành công.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#060e20] text-[#dee5ff] min-h-screen flex flex-col">
      <main className="flex-grow flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-[#192540]/60 backdrop-blur-[24px] rounded-xl p-6 md:p-8 shadow">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#9fa7ff]">Reset password</h1>
            <p className="text-gray-400 mt-2">
              Choose a new password for your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <input
              type="password"
              placeholder="New password"
              className="w-full p-4 rounded-lg bg-[#1f2b49]"
              value={password}
              disabled={loading || !token}
              onChange={(e) => setPassword(e.target.value)}
            />

            <input
              type="password"
              placeholder="Confirm password"
              className="w-full p-4 rounded-lg bg-[#1f2b49]"
              value={confirmPassword}
              disabled={loading || !token}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && <p className="text-red-400 text-center">{error}</p>}
            {success && <p className="text-green-300 text-center">{success}</p>}

            <button
              type="submit"
              disabled={loading || !token}
              className={`w-full py-4 bg-gradient-to-r from-[#9fa7ff] to-[#8a95ff] text-black font-bold rounded-full transition ${
                loading || !token ? "opacity-60 cursor-not-allowed" : "hover:scale-105"
              }`}
            >
              {loading ? "Đang cập nhật..." : "Reset password"}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-400 text-sm">
            Back to{" "}
            <Link to="/login" className="text-[#9fa7ff] hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
