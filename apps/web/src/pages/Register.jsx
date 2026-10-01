import { useState } from "react";
import api from "../services/api";
import { isStrongPassword } from "../utils/password";
import { postLoginPath } from "../utils/authRedirect";
import { signInWithPopup } from "firebase/auth";
import { auth, provider, isFirebaseConfigured } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import {
    getGoogleAuthErrorMessage,
    logGoogleAuthError,
} from "../utils/googleAuthError";

export default function Register() {

    const { t } = useTranslation("auth");
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);

    const validateEmail = (email) => /\S+@\S+\.\S+/.test(email);

    const navigate = useNavigate();

    const redirectByRole = (user) => {
      navigate(postLoginPath(user, window.location.search), { replace: true });
    };

    const colors = { onSurfaceVariant: "#a3aac4" };

    const [showPassword, setShowPassword] = useState(false);

    const { login } = useAuth();

    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
    });

const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
        ...prev,
        [name]: value,
    }));

    setErrors((prev) => ({
        ...prev,
        [name]: "",
        general: "",
    }));
};

    const handleGoogleLogin = async () => {
        if (loading) return;

        if (!isFirebaseConfigured) {
            setErrors({ general: t("errors.googleNotConfigured") });
            return;
        }

        try {
            setLoading(true);

            const result = await signInWithPopup(auth, provider);

            const user = result.user;
            const idToken = await user.getIdToken();

            const res = await api.post("/google-login", { idToken });

            login(res.data.user);

            redirectByRole(res.data.user);

        } catch (err) {
            logGoogleAuthError(err);
            setErrors({ general: getGoogleAuthErrorMessage(err) });
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        setErrors({});

        if (!form.name.trim()) {
            return setErrors({
                name: t("errors.nameRequired"),
            });
        }

        if (!validateEmail(form.email)) {
            return setErrors({
                email: t("errors.invalidEmail"),
            });
        }

        if (!isStrongPassword(form.password)) {
            return setErrors({
                password: t("errors.passwordRule"),
            });
        }

        if (form.password !== form.confirmPassword) {
            return setErrors({
                confirmPassword: t("errors.passwordMismatch"),
            });
        }

        try {
            setLoading(true);

            await api.post("/register", {
                name: form.name,
                email: form.email,
                password: form.password,
            });

            navigate(`/login${window.location.search}`, {
                state: {
                    success: t("errors.registerSuccess")
                }
            });

        } catch (err) {

            setErrors({
                general:
                    err.response?.data?.message ||
                    t("errors.registerFailed"),
            });

        } finally {
            setLoading(false);
        }
    };

    const EyeOpen = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 012.5-4.026M6.343 6.343A9.97 9.97 0 0112 5c4.477 0 8.268 2.943 9.542 7a9.97 9.97 0 01-1.293 2.636M6.343 6.343L3 3m3.343 3.343l11.314 11.314M21 21l-3.343-3.343" />
        </svg>
    );

    const EyeClosed = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
    );

    return (
        <div className="bg-[#060e20] text-[#dee5ff] min-h-screen flex flex-col">

            {/* CONTENT — căn giữa, chiếm hết không gian còn lại */}
            <div className="flex-grow flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-lg bg-[#192540]/60 backdrop-blur-[24px] rounded-xl p-6 md:p-8 shadow">

                    {/* TITLE */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-[#9fa7ff]">{t("register.title")}</h1>
                        <p className="text-gray-400 mt-2">{t("register.subtitle")}</p>
                    </div>

                    {/* FORM */}
                    <form onSubmit={handleRegister} className="space-y-5">
                        <input name="name" type="text" placeholder={t("register.fullNamePlaceholder")} className="w-full p-4 rounded-lg bg-[#1f2b49]" value={form.name} onChange={handleChange} />
                        {errors.name && (<p className="text-red-400 text-sm mt-1">{errors.name}</p>)}
                        <input name="email" type="email" placeholder={t("register.emailPlaceholder")}
                            className="w-full p-4 rounded-lg bg-[#1f2b49]"
                            value={form.email} onChange={handleChange} />
                        {errors.email && (<p className="text-red-400 text-sm mt-1">{errors.email}</p>)}
                        <div className="relative">
                            <input name="password" type={showPassword ? "text" : "password"} placeholder={t("register.passwordPlaceholder")}
                                className="w-full p-4 rounded-lg bg-[#1f2b49] pr-12"
                                value={form.password} onChange={handleChange} />
                            {errors.password && (<p className="text-red-400 text-sm mt-1">{errors.password}</p>)}
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#9fa7ff] transition-colors">
                                {showPassword ? EyeClosed() : EyeOpen()}
                            </button>
                        </div>
                        <input name="confirmPassword" type="password" placeholder={t("register.confirmPasswordPlaceholder")}
                            className="w-full p-4 rounded-lg bg-[#1f2b49]"
                            value={form.confirmPassword} onChange={handleChange} />
                        {errors.confirmPassword && (<p className="text-red-400 text-sm mt-1">{errors.confirmPassword}</p>)}
                        {errors.general && (<p className="text-red-400 text-center">{errors.general}</p>)}
                        <button type="submit"
                        disabled={loading}
                        className={`w-full py-4 bg-gradient-to-r from-[#9fa7ff] to-[#8a95ff] text-black font-bold rounded-full transition ${loading? "opacity-60 cursor-not-allowed": "hover:scale-105"}`}>{loading ? t("register.creating") : t("register.createAccount")}
                        </button>
                    </form>

                    <div className="flex justify-center">
                        <span style={{ padding: "20px 16px", color: colors.onSurfaceVariant, fontSize: 16 }}>
                            {t("register.orContinueWith")}
                        </span>
                    </div>

                    {/* SOCIAL */}
                    <div className="grid grid-cols-2 gap-4">
                        <button type="button" disabled={loading || !isFirebaseConfigured} onClick={handleGoogleLogin}
                            title={!isFirebaseConfigured ? t("login.appleNotConfigured") : undefined}
                            className={`flex items-center justify-center gap-3 py-3 rounded-xl bg-[#1f2b49] transition-all duration-300 shadow-[0_0_5px_rgba(66,133,244,0.2)] hover:shadow-[0_0_20px_rgba(66,133,244,0.7)] hover:scale-[1.03] active:scale-[0.97] ${!isFirebaseConfigured ? "opacity-50 cursor-not-allowed" : ""}`}>
                            <svg viewBox="0 0 48 48" className="w-5 h-5">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.68 1.22 9.17 3.6l6.85-6.85C35.9 2.27 30.37 0 24 0 14.64 0 6.44 5.48 2.7 13.44l7.98 6.2C12.4 13.02 17.7 9.5 24 9.5z" />
                                <path fill="#34A853" d="M24 48c6.37 0 11.73-2.1 15.64-5.7l-7.3-5.67c-2.03 1.37-4.64 2.18-8.34 2.18-6.3 0-11.6-3.52-13.32-8.64l-7.98 6.2C6.44 42.52 14.64 48 24 48z" />
                                <path fill="#4A90E2" d="M46.1 24.5c0-1.64-.14-3.21-.4-4.73H24v9.02h12.4c-.54 2.9-2.2 5.36-4.7 7.02l7.3 5.67c4.27-3.93 6.7-9.73 6.7-16.98z" />
                                <path fill="#FBBC05" d="M10.68 28.17c-.43-1.28-.68-2.65-.68-4.17s.25-2.89.68-4.17l-7.98-6.2C1.66 16.6 1 20.2 1 24s.66 7.4 1.7 10.37l7.98-6.2z" />
                            </svg>
                            <span>{t("login.google")}</span>
                        </button>
                        <button type="button" disabled title={t("login.appleNotConfigured")}
                            className="flex items-center justify-center gap-3 py-3 rounded-xl bg-[#1f2b49] opacity-50 cursor-not-allowed">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                                <path d="M16.365 1.43c0 1.14-.42 2.22-1.13 3.02-.73.82-1.92 1.45-3.06 1.36-.14-1.1.4-2.28 1.13-3.08.74-.82 2.02-1.4 3.06-1.3zM20.7 17.34c-.83 1.22-1.69 2.44-3.04 2.47-1.32.03-1.75-.78-3.26-.78-1.5 0-1.99.75-3.23.81-1.3.05-2.3-1.3-3.13-2.52-1.7-2.48-3-7-1.26-10.06.86-1.52 2.4-2.48 4.08-2.51 1.27-.03 2.46.86 3.23.86.76 0 2.2-1.06 3.7-.9.63.03 2.4.26 3.54 1.93-3.1 1.7-2.6 6.2.37 7.7z" />
                            </svg>
                            <span>{t("login.continueWithApple")}</span>
                        </button>
                    </div>
                    <p className="mt-3 text-center text-xs text-gray-500">
                        {t("login.appleNotConfigured")}.
                    </p>

                    <p className="mt-6 text-center text-gray-400 text-sm">
                        {t("register.alreadyHaveAccount")}{" "}
                        <Link to={`/login${window.location.search}`} className="text-[#9fa7ff] hover:underline">{t("register.signIn")}</Link>
                    </p>

                </div>
            </div>

            {/* FOOTER — dưới cùng, full width */}
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
