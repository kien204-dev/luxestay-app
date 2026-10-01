import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const validateEmail = (value) => /\S+@\S+\.\S+/.test(value);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateEmail(email)) {
      setError("Email không hợp lệ");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/forgot-password", { email });
      setSuccess(
        res.data?.message ||
          "Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi."
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại."
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
            <h1 className="text-3xl font-bold text-[#9fa7ff]">Forgot password</h1>
            <p className="text-gray-400 mt-2">
              Enter your email to receive a reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <input
              type="email"
              placeholder="Email"
              className="w-full p-4 rounded-lg bg-[#1f2b49]"
              value={email}
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && <p className="text-red-400 text-center">{error}</p>}
            {success && <p className="text-green-300 text-center">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 bg-gradient-to-r from-[#9fa7ff] to-[#8a95ff] text-black font-bold rounded-full transition ${
                loading ? "opacity-60 cursor-not-allowed" : "hover:scale-105"
              }`}
            >
              {loading ? "Đang gửi..." : "Send reset link"}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-400 text-sm">
            Remembered your password?{" "}
            <Link to="/login" className="text-[#9fa7ff] hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
