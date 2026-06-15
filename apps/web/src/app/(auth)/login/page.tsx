"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, BookOpen, Lock, User, Loader2 } from "lucide-react";
import { isAxiosError } from "axios";
import api, { getData } from "@/lib/api";
import { type AuthUser, useAuthStore } from "@/stores/auth.store";

const schema = z.object({
  username: z.string().min(1, "Vui lòng nhập tài khoản"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
  rememberMe: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;
type LoginResponse = { user: AuthUser };
type ApiErrorResponse = { message?: string | string[] };

function getErrorMessage(err: unknown) {
  if (!isAxiosError<ApiErrorResponse>(err)) return undefined;
  const message = err.response?.data?.message;
  return Array.isArray(message) ? message.join(", ") : message;
}

export default function LoginPage() {
  const { setAuth } = useAuthStore();
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      const res = await api.post("/auth/login", {
        ...data,
        username: data.username.trim(),
      });
      const { user } = getData<LoginResponse>(res);
      setAuth(user);
      // Use window.location.href instead of router.push to force a full page reload.
      // This ensures Zustand's persist middleware flushes to localStorage before
      // the new page's layout reads the store, preventing the auth redirect loop.
      if (user.role === "ADMIN") window.location.assign("/admin/dashboard");
      else if (user.role === "TEACHER") window.location.assign("/teacher/classes");
      else window.location.assign("/student/my-schedule");
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Đăng nhập thất bại. Vui lòng thử lại.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "600px",
          background:
            "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          right: "-10%",
          width: "400px",
          height: "400px",
          background:
            "radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="animate-fadein" style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 60,
              height: 60,
              borderRadius: 16,
              background: "linear-gradient(135deg, #6366f1, #a855f7)",
              marginBottom: 16,
              boxShadow: "0 8px 30px rgba(99,102,241,0.4)",
            }}
          >
            <BookOpen size={28} color="white" />
          </div>
          <h1
            className="gradient-text"
            style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}
          >
            EasyEdu
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Hệ thống Quản lý Trung tâm Dạy học
          </p>
        </div>

        {/* Card */}
        <div
          className="glass"
          style={{
            borderRadius: 20,
            padding: "36px 32px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 6,
            }}
          >
            Đăng nhập
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>
            Nhập thông tin tài khoản để tiếp tục
          </p>

          {error && (
            <div
              style={{
                background: "rgba(244,63,94,0.1)",
                border: "1px solid rgba(244,63,94,0.3)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 20,
                fontSize: 13,
                color: "#f43f5e",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Username */}
            <div>
              <label className="form-label">Email / Số điện thoại / Tài khoản</label>
              <div style={{ position: "relative" }}>
                <User
                  size={15}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  {...register("username")}
                  className="input"
                  style={{ paddingLeft: 40 }}
                  placeholder="admin@easyedu.vn"
                  autoComplete="username"
                />
              </div>
              {errors.username && (
                <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>
                  {errors.username.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="form-label">Mật khẩu</label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={15}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  {...register("password")}
                  type={showPw ? "text" : "password"}
                  className="input"
                  style={{ paddingLeft: 40, paddingRight: 44 }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: 0,
                    display: "flex",
                  }}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                <input
                  {...register("rememberMe")}
                  type="checkbox"
                  style={{ accentColor: "var(--accent-primary)", width: 14, height: 14 }}
                />
                Ghi nhớ đăng nhập 30 ngày
              </label>
              <a
                href="/forgot-password"
                style={{ fontSize: 13, color: "var(--accent-secondary)", textDecoration: "none" }}
              >
                Quên mật khẩu?
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ width: "100%", marginTop: 4 }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin-slow" />
                  Đang đăng nhập...
                </>
              ) : (
                "Đăng nhập"
              )}
            </button>
          </form>

          {/* Register link */}
          <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "var(--text-muted)" }}>
            Chưa có tài khoản?{" "}
            <a
              href="/register"
              style={{ color: "var(--accent-secondary)", textDecoration: "none", fontWeight: 600 }}
            >
              Đăng ký ngay
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
