import { useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { auth, provider, isFirebaseConfigured } from "../firebase";
import { signInWithPopup } from "firebase/auth";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  getGoogleAuthErrorMessage,
  logGoogleAuthError,
} from "../utils/googleAuthError";
import { useToast } from "../context/ToastContext";
import { useProperty } from "../context/PropertyContext";
import { postLoginPath } from "../utils/authRedirect";

function Login() {

  const location = useLocation();
  const successMessage = location.state?.success;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { name: APP_NAME } = useProperty();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation("auth");

  const validateEmail = (email) => /\S+@\S+\.\S+/.test(email);

useEffect(() => {
  if (location.state?.success) {
    window.history.replaceState({}, document.title);
  }
}, [location]);

  // ✅ Hàm phân quyền dùng chung
  const redirectByRole = (user) => {
    navigate(postLoginPath(user, window.location.search), { replace: true });
  };

  const handleGoogleLogin = async () => {
    if (loading) return;

    if (!isFirebaseConfigured) {
      toast.error(t("errors.googleNotConfigured"));
      return;
    }

    try {
      setLoading(true);

      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      const res = await api.post("/google-login", { idToken });

      login(res.data.user);

      if (res.data.linked) {
        toast.info(t("errors.googleAccountLinked"));
      }

      redirectByRole(res.data.user);

    } catch (err) {
      logGoogleAuthError(err);
      setErrors({ general: getGoogleAuthErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});

    if (!validateEmail(email)) {
      return setErrors({
        email: t("errors.invalidEmail"),
      });
    }

    if (password.length < 6) {
      return setErrors({
        password: t("errors.passwordMinLength"),
      });
    }


    try {
      setLoading(true);

      const res = await api.post("/login", { email, password });

      login(res.data.user);

      redirectByRole(res.data.user);
    } catch (err) {
      setErrors({
        general: err.response?.data?.message || t("errors.wrongCredentials"),
      });
    } finally {
      setLoading(false);
    }
  };

  const EyeOpen = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );

  const EyeClosed = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 012.5-4.026M6.343 6.343A9.97 9.97 0 0112 5c4.477 0 8.268 2.943 9.542 7a9.97 9.97 0 01-1.293 2.636M6.343 6.343L3 3m3.343 3.343l11.314 11.314M21 21l-3.343-3.343" />
    </svg>
  );
  return (
    <div className="bg-[#060e20] text-[#dee5ff] min-h-screen flex flex-col relative overflow-x-hidden">

      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#9fa7ff] rounded-full blur-[100px] opacity-30"></div>
        <div className="absolute bottom-[-15%] right-[-5%] w-[600px] h-[600px] bg-[#62259b] rounded-full blur-[100px] opacity-30"></div>
        <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-cyan-400/20 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2"></div>
      </div>

      {/* HEADER */}
      <header className="relative z-50 bg-[#060e20]/60 backdrop-blur-2xl">
        <nav className="flex justify-between items-center px-4 md:px-12 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[#9fa7ff]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
            </svg>
            <span className="text-2xl font-bold text-[#9fa7ff]">{APP_NAME}</span>
          </div>
          <div className="hidden md:flex gap-8 items-center">
            <a className="text-[#a3aac4] hover:text-[#dee5ff] transition-colors" href="#">{t("login.supportLink")}</a>
            <a className="text-[#a3aac4] hover:text-[#dee5ff] transition-colors" href="#">{t("login.languageLink")}</a>
            <button className="px-6 py-2 bg-[#8d98ff] text-black rounded-full font-bold hover:scale-105 transition">
              {t("login.contactUs")}
            </button>
          </div>
        </nav>
      </header>

      {/* MAIN */}
      <main className="flex-grow flex items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-[480px] bg-[#192540]/60 backdrop-blur-[24px] rounded-xl p-6 md:p-12 shadow-[0_0_80px_rgba(159,167,255,0.08)] border border-[#40485d]/20">

          <div className="text-center mb-10">
            <h1 className="text-4xl font-extrabold text-[#9fa7ff] mb-4">{t("login.welcome")}</h1>
            <p className="text-[#a3aac4] mb-6">{t("login.subtitle")}</p>
          </div>

          {/* FORM */}
          {successMessage && (
            <div className="mb-4 rounded-lg bg-green-500/20 border border-green-500 text-green-300 p-3 text-center">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs text-[#a3aac4] ml-1">{t("login.emailLabel")}</label>
              <input
                type="email"
                placeholder="name@gmail.com"
                disabled={loading}
                className="w-full mt-2 bg-[#192540] rounded-xl py-4 px-4"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <p className="text-red-400 text-sm">{errors.email}</p>}
            </div>

            <div>
              <div className="flex justify-between text-xs text-[#a3aac4]">
                <span>{t("login.passwordLabel")}</span>
                <span className="text-[#9fa7ff] cursor-pointer"><Link to="/forgot-password" className="text-[#9fa7ff]">{t("login.forgot")}</Link></span>
              </div>
              <div className="relative mt-2">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={loading}
                  className="w-full bg-[#192540] rounded-xl py-4 px-4 pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {/* ❌ Xóa <span> bọc ngoài, chỉ giữ <button> */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#9fa7ff] transition-colors"
                >
                  {showPassword ? EyeOpen() : EyeClosed()}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-sm">{errors.password}</p>}
            </div>

            {errors.general && (
              <p className="text-red-400 text-center">{errors.general}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-[#9fa7ff] to-[#8a95ff] text-black font-bold rounded-full"
            >
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>

          {/* DIVIDER */}
          <div className="flex items-center my-8 gap-4">
            <div className="flex-grow h-[1px] bg-gray-700"></div>
            <span className="text-xs text-gray-400">{t("login.orContinueWith")}</span>
            <div className="flex-grow h-[1px] bg-gray-700"></div>
          </div>

          {/* SOCIAL */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              disabled={loading || !isFirebaseConfigured}
              onClick={handleGoogleLogin}
              title={!isFirebaseConfigured ? t("login.appleNotConfigured") : undefined}
              className={`flex items-center justify-center gap-3 py-3 rounded-xl bg-[#1f2b49] transition-all duration-300 shadow-[0_0_5px_rgba(66,133,244,0.2)] hover:shadow-[0_0_20px_rgba(66,133,244,0.7)] hover:scale-[1.03] active:scale-[0.97] ${!isFirebaseConfigured ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <svg viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.68 1.22 9.17 3.6l6.85-6.85C35.9 2.27 30.37 0 24 0 14.64 0 6.44 5.48 2.7 13.44l7.98 6.2C12.4 13.02 17.7 9.5 24 9.5z" />
                <path fill="#34A853" d="M24 48c6.37 0 11.73-2.1 15.64-5.7l-7.3-5.67c-2.03 1.37-4.64 2.18-8.34 2.18-6.3 0-11.6-3.52-13.32-8.64l-7.98 6.2C6.44 42.52 14.64 48 24 48z" />
                <path fill="#4A90E2" d="M46.1 24.5c0-1.64-.14-3.21-.4-4.73H24v9.02h12.4c-.54 2.9-2.2 5.36-4.7 7.02l7.3 5.67c4.27-3.93 6.7-9.73 6.7-16.98z" />
                <path fill="#FBBC05" d="M10.68 28.17c-.43-1.28-.68-2.65-.68-4.17s.25-2.89.68-4.17l-7.98-6.2C1.66 16.6 1 20.2 1 24s.66 7.4 1.7 10.37l7.98-6.2z" />
              </svg>
              <span className="text-sm">{t("login.google")}</span>
            </button>

            <button
              type="button"
              disabled
              title={t("login.appleNotConfigured")}
              className="flex items-center justify-center gap-3 py-3 rounded-xl bg-[#1f2b49] opacity-50 cursor-not-allowed"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M16.365 1.43c0 1.14-.42 2.22-1.13 3.02-.73.82-1.92 1.45-3.06 1.36-.14-1.1.4-2.28 1.13-3.08.74-.82 2.02-1.4 3.06-1.3zM20.7 17.34c-.83 1.22-1.69 2.44-3.04 2.47-1.32.03-1.75-.78-3.26-.78-1.5 0-1.99.75-3.23.81-1.3.05-2.3-1.3-3.13-2.52-1.7-2.48-3-7-1.26-10.06.86-1.52 2.4-2.48 4.08-2.51 1.27-.03 2.46.86 3.23.86.76 0 2.2-1.06 3.7-.9.63.03 2.4.26 3.54 1.93-3.1 1.7-2.6 6.2.37 7.7z" />
              </svg>
              <span className="text-sm">{t("login.continueWithApple")}</span>
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-gray-500">
            {t("login.appleNotConfigured")}.
          </p>

          <p className="mt-6 text-center text-gray-400 text-sm">
            {t("login.noAccount")}{" "}
            <Link to={`/register${location.search}`} className="text-[#9fa7ff] hover:underline">
              {t("login.createAccount")}
            </Link>
          </p>

        </div>
      </main>
      <footer className="px-4 md:px-8 pb-6 pt-4 border-t border-[#40485d]/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-[#a3aac4] text-sm">
          <div className="flex gap-6">
            <a className="hover:text-[#dee5ff] transition-colors" href="#">{t("login.footer.privacyPolicy")}</a>
            <a className="hover:text-[#dee5ff] transition-colors" href="#">{t("login.footer.termsOfService")}</a>
            <a className="hover:text-[#dee5ff] transition-colors" href="#">{t("login.footer.security")}</a>
            <a className="hover:text-[#dee5ff] transition-colors" href="#">{t("login.footer.contact")}</a>
          </div>
          <p>{t("login.footer.copyright")}</p>
        </div>
      </footer>

    </div>
  );
}



export default Login;
