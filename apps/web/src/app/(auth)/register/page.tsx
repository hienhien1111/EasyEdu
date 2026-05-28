"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, BookOpen, Loader2, ArrowLeft, GraduationCap, BookMarked } from "lucide-react";
import api from "@/lib/api";
import Link from "next/link";

const schema = z.object({
  fullName: z.string().min(2, "Họ tên tối thiểu 2 ký tự"),
  email: z.string().email("Email không hợp lệ"),
  phone: z.string().min(9, "SĐT không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  confirmPassword: z.string(),
  role: z.enum(["TEACHER", "STUDENT"]),
  // Teacher extra
  idCardNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  // Student extra
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianRelation: z.string().optional(),
  agreeTerms: z.boolean().refine((v) => v, "Bạn phải đồng ý điều khoản"),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: "STUDENT" },
  });

  const role = watch("role");

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      const res = await api.post("/auth/register", {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        password: data.password,
        role: data.role,
        ...(data.role === "TEACHER"
          ? { idCardNumber: data.idCardNumber, bankAccount: data.bankAccount, bankName: data.bankName }
          : { guardianName: data.guardianName, guardianPhone: data.guardianPhone, guardianRelation: data.guardianRelation }),
      });

      // Registration always results in PENDING_APPROVAL — redirect to login
      router.push("/login?registered=1");
    } catch (err: any) {
      console.error("Register error:", err.response?.data);
      setError(err.response?.data?.message || "Đăng ký thất bại. Vui lòng thử lại.");
      // Go back to step 1 if it's a basic field error
      setStep(1);
    }
  };

  // Validate step-1 fields before advancing
  const handleNextStep = async () => {
    const ok = await trigger(["fullName", "email", "phone", "password", "confirmPassword", "agreeTerms", "role"]);
    if (ok) setStep(2);
  };

  const ROLE_OPTIONS = [
    {
      value: "STUDENT",
      label: "Học sinh",
      desc: "Đăng ký học các lớp, theo dõi lịch học và thanh toán học phí",
      icon: GraduationCap,
      color: "#f59e0b",
    },
    {
      value: "TEACHER",
      label: "Giáo viên",
      desc: "Quản lý lớp học, điểm danh và theo dõi lịch dạy của bạn",
      icon: BookMarked,
      color: "#10b981",
    },
  ];

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
      {/* Background glows */}
      <div style={{ position: "absolute", top: "-10%", right: "5%", width: 500, height: 500, background: "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-10%", left: "0%", width: 400, height: 400, background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div className="animate-fadein" style={{ width: "100%", maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #6366f1, #a855f7)", marginBottom: 14, boxShadow: "0 8px 30px rgba(99,102,241,0.4)" }}>
            <BookOpen size={26} color="white" />
          </div>
          <h1 className="gradient-text" style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>
            EasyEdu
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {step === 1 ? "Tạo tài khoản mới" : "Thông tin bổ sung"}
          </p>
        </div>

        <div className="glass" style={{ borderRadius: 20, padding: "32px 28px", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
          {/* Back to login */}
          <Link href="/login" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 20 }}>
            <ArrowLeft size={14} /> Quay lại đăng nhập
          </Link>

          {error && (
            <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#f43f5e" }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {step === 1 ? (
              <>
                {/* Role picker */}
                <div>
                  <label className="form-label">Đăng ký với vai trò</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {ROLE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = role === opt.value;
                      return (
                        <label
                          key={opt.value}
                          style={{
                            border: `1.5px solid ${isActive ? opt.color + "60" : "var(--border)"}`,
                            borderRadius: 12,
                            padding: "12px 14px",
                            cursor: "pointer",
                            background: isActive ? `${opt.color}10` : "transparent",
                            transition: "all 0.15s",
                          }}
                        >
                          <input {...register("role")} type="radio" value={opt.value} style={{ display: "none" }} />
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <Icon size={16} color={isActive ? opt.color : "var(--text-muted)"} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? opt.color : "var(--text-primary)" }}>
                              {opt.label}
                            </span>
                          </div>
                          <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{opt.desc}</p>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Basic info */}
                <div>
                  <label className="form-label">Họ và tên</label>
                  <input {...register("fullName")} className="input" placeholder="Nguyễn Văn A" />
                  {errors.fullName && <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{errors.fullName.message}</p>}
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input {...register("email")} className="input" type="email" placeholder="email@example.com" />
                  {errors.email && <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{errors.email.message}</p>}
                </div>
                <div>
                  <label className="form-label">Số điện thoại</label>
                  <input {...register("phone")} className="input" placeholder="0901234567" />
                  {errors.phone && <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{errors.phone.message}</p>}
                </div>
                <div>
                  <label className="form-label">Mật khẩu</label>
                  <div style={{ position: "relative" }}>
                    <input {...register("password")} className="input" type={showPw ? "text" : "password"} placeholder="Tối thiểu 8 ký tự" style={{ paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {errors.password && <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{errors.password.message}</p>}
                </div>
                <div>
                  <label className="form-label">Xác nhận mật khẩu</label>
                  <input {...register("confirmPassword")} className="input" type={showPw ? "text" : "password"} placeholder="Nhập lại mật khẩu" />
                  {errors.confirmPassword && <p style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{errors.confirmPassword.message}</p>}
                </div>

                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text-secondary)" }}>
                  <input {...register("agreeTerms")} type="checkbox" style={{ accentColor: "var(--accent-primary)", marginTop: 1, flexShrink: 0 }} />
                  Tôi đồng ý với{" "}
                  <a href="#" style={{ color: "var(--accent-secondary)" }}>Điều khoản sử dụng</a>{" "}và{" "}
                  <a href="#" style={{ color: "var(--accent-secondary)" }}>Chính sách bảo mật</a>
                </label>
                {errors.agreeTerms && <p style={{ color: "#f43f5e", fontSize: 11 }}>{errors.agreeTerms.message}</p>}

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 4 }}
                  onClick={handleNextStep}
                >
                  Tiếp tục →
                </button>
              </>
            ) : (
              <>
                {/* Step 2: role-specific info */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                    <ArrowLeft size={16} />
                  </button>
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {role === "TEACHER" ? "Thông tin giáo viên" : "Thông tin học sinh"}
                  </p>
                </div>

                {role === "TEACHER" ? (
                  <>
                    <div>
                      <label className="form-label">Số CCCD/CMND</label>
                      <input {...register("idCardNumber")} className="input" placeholder="012345678901" />
                    </div>
                    <div>
                      <label className="form-label">Tên ngân hàng</label>
                      <input {...register("bankName")} className="input" placeholder="Vietcombank, BIDV..." />
                    </div>
                    <div>
                      <label className="form-label">Số tài khoản ngân hàng</label>
                      <input {...register("bankAccount")} className="input" placeholder="1234567890" />
                    </div>
                    <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#10b981" }}>
                      ℹ️ Tài khoản giáo viên sẽ được Admin duyệt trước khi kích hoạt. Bạn sẽ nhận thông báo qua email.
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="form-label">Tên phụ huynh / Người giám hộ</label>
                      <input {...register("guardianName")} className="input" placeholder="Nguyễn Văn B" />
                    </div>
                    <div>
                      <label className="form-label">SĐT phụ huynh</label>
                      <input {...register("guardianPhone")} className="input" placeholder="0901234567" />
                    </div>
                    <div>
                      <label className="form-label">Quan hệ với học sinh</label>
                      <select {...register("guardianRelation")} className="input">
                        <option value="">Chọn...</option>
                        <option value="FATHER">Bố</option>
                        <option value="MOTHER">Mẹ</option>
                        <option value="OTHER">Người giám hộ khác</option>
                      </select>
                    </div>
                  </>
                )}

                <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 4 }} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><Loader2 size={16} className="animate-spin-slow" /> Đang đăng ký...</>
                  ) : (
                    "Hoàn tất đăng ký"
                  )}
                </button>
              </>
            )}
          </form>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
            Đã có tài khoản?{" "}
            <Link href="/login" style={{ color: "var(--accent-secondary)", textDecoration: "none", fontWeight: 600 }}>
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
