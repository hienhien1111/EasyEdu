"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Mail, ArrowLeft, KeyRound, Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

const emailSchema = z.object({ email: z.string().email("Email không hợp lệ") });
const otpSchema = z.object({
  otp: z.string().length(6, "OTP phải đúng 6 số"),
  newPassword: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, { message: "Mật khẩu không khớp", path: ["confirmPassword"] });

type EmailForm = z.infer<typeof emailSchema>;
type OtpForm = z.infer<typeof otpSchema>;

type Step = "email" | "otp" | "success";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmailState] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const otpForm = useForm<OtpForm>({ resolver: zodResolver(otpSchema) });

  const sendOtp = async (data: EmailForm) => {
    setError("");
    try {
      await api.post("/auth/forgot-password", { identifier: data.email });
      setEmailState(data.email);
      setStep("otp");
    } catch (e: any) {
      setError(e.response?.data?.message || "Không thể gửi OTP. Kiểm tra email và thử lại.");
    }
  };

  const resetPassword = async (data: OtpForm) => {
    setError("");
    try {
      await api.post("/auth/reset-password", {
        identifier: email,
        otp: data.otp,
        newPassword: data.newPassword,
      });
      setStep("success");
    } catch (e: any) {
      setError(e.response?.data?.message || "OTP không hợp lệ hoặc đã hết hạn.");
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
      <div style={{ position: "absolute", top: "-20%", left: "50%", transform: "translateX(-50%)", width: 500, height: 500, background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div className="animate-fadein" style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #6366f1, #a855f7)", marginBottom: 14, boxShadow: "0 8px 30px rgba(99,102,241,0.4)" }}>
            <BookOpen size={26} color="white" />
          </div>
          <h1 className="gradient-text" style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>EasyEdu</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Khôi phục mật khẩu</p>
        </div>

        <div className="glass" style={{ borderRadius: 20, padding: "32px 28px", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
          <Link href="/login" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 24 }}>
            <ArrowLeft size={14} /> Quay lại đăng nhập
          </Link>

          {/* Progress steps */}
          {step !== "success" && (
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
              {["email", "otp"].map((s, i) => (
                <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    background: step === s ? "var(--accent-primary)" : step === "otp" && s === "email" ? "#10b981" : "var(--bg-secondary)",
                    border: `2px solid ${step === s ? "var(--accent-primary)" : step === "otp" && s === "email" ? "#10b981" : "var(--border)"}`,
                    fontSize: 12, fontWeight: 700, color: step === s || (step === "otp" && s === "email") ? "white" : "var(--text-muted)",
                    flexShrink: 0,
                  }}>
                    {step === "otp" && s === "email" ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 11, color: step === s ? "var(--accent-secondary)" : "var(--text-muted)", marginLeft: 6, flex: 1 }}>
                    {s === "email" ? "Nhập email" : "Xác thực OTP"}
                  </span>
                  {i < 1 && <div style={{ width: 20, height: 1, background: step === "otp" ? "var(--accent-primary)" : "var(--border)", flexShrink: 0, marginRight: 6 }} />}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#f43f5e" }}>
              ⚠️ {error}
            </div>
          )}

          {step === "email" && (
            <form onSubmit={emailForm.handleSubmit(sendOtp)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Nhập email của bạn</h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Chúng tôi sẽ gửi mã OTP 6 số để xác thực</p>
              </div>
              <div>
                <label className="form-label">Email đăng ký</label>
                <div style={{ position: "relative" }}>
                  <Mail size={14} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input {...emailForm.register("email")} className="input" type="email" placeholder="email@example.com" style={{ paddingLeft: 38 }} />
                </div>
                {emailForm.formState.errors.email && (
                  <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{emailForm.formState.errors.email.message}</p>
                )}
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={emailForm.formState.isSubmitting}>
                {emailForm.formState.isSubmitting
                  ? <><Loader2 size={15} className="animate-spin-slow" /> Đang gửi...</>
                  : <><Mail size={15} /> Gửi mã OTP</>}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={otpForm.handleSubmit(resetPassword)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Xác thực & Đặt mật khẩu mới</h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  OTP đã gửi đến <strong style={{ color: "var(--accent-secondary)" }}>{email}</strong>
                </p>
              </div>
              <div>
                <label className="form-label">Mã OTP (6 số)</label>
                <div style={{ position: "relative" }}>
                  <KeyRound size={14} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input {...otpForm.register("otp")} className="input" placeholder="123456" maxLength={6} style={{ paddingLeft: 38, letterSpacing: "0.4em", textAlign: "center", fontSize: 18, fontWeight: 700 }} />
                </div>
                {otpForm.formState.errors.otp && (
                  <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{otpForm.formState.errors.otp.message}</p>
                )}
              </div>
              <div>
                <label className="form-label">Mật khẩu mới</label>
                <div style={{ position: "relative" }}>
                  <input {...otpForm.register("newPassword")} type={showPw ? "text" : "password"} className="input" placeholder="Tối thiểu 8 ký tự" style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {otpForm.formState.errors.newPassword && (
                  <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{otpForm.formState.errors.newPassword.message}</p>
                )}
              </div>
              <div>
                <label className="form-label">Xác nhận mật khẩu mới</label>
                <input {...otpForm.register("confirmPassword")} type={showPw ? "text" : "password"} className="input" placeholder="Nhập lại mật khẩu" />
                {otpForm.formState.errors.confirmPassword && (
                  <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{otpForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setStep("email"); setError(""); }}>← Thử email khác</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={otpForm.formState.isSubmitting}>
                  {otpForm.formState.isSubmitting
                    ? <><Loader2 size={15} className="animate-spin-slow" /> Đang đặt lại...</>
                    : "Đặt lại mật khẩu"}
                </button>
              </div>
            </form>
          )}

          {step === "success" && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(16,185,129,0.15)", border: "2px solid rgba(16,185,129,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <CheckCircle size={28} color="#10b981" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Đổi mật khẩu thành công!</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>Bạn có thể đăng nhập với mật khẩu mới.</p>
              <Link href="/login" className="btn btn-primary" style={{ display: "inline-flex", textDecoration: "none" }}>
                Đăng nhập ngay
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
