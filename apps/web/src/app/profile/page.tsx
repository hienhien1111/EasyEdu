"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Camera,
  Lock,
  Save,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle,
} from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useAuthStore } from "@/stores/auth.store";
import { useRouter } from "next/navigation";
import api, { getData } from "@/lib/api";
import { getInitials } from "@/lib/utils";

function ProfileProgress({ profile }: { profile: any }) {
  const fields = [
    { key: "fullName", label: "Họ tên" },
    { key: "phone", label: "Số điện thoại" },
    { key: "address", label: "Địa chỉ" },
    { key: "avatarUrl", label: "Ảnh đại diện" },
    { key: "bio", label: "Giới thiệu" },
  ];
  const filled = fields.filter((f) => !!profile?.[f.key]).length;
  const pct = Math.round((filled / fields.length) * 100);

  return (
    <div
      style={{
        background: "rgba(99,102,241,0.06)",
        border: "1px solid rgba(99,102,241,0.2)",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--accent-secondary)",
          }}
        >
          Mức độ hoàn thiện hồ sơ
        </p>
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: pct >= 80 ? "#10b981" : "var(--accent-secondary)",
          }}
        >
          {pct}%
        </span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            background:
              pct >= 80
                ? "linear-gradient(90deg,#10b981,#34d399)"
                : "linear-gradient(90deg,#6366f1,#a855f7)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        {fields.map((f) => (
          <span
            key={f.key}
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 20,
              background: profile?.[f.key]
                ? "rgba(16,185,129,0.12)"
                : "rgba(98,112,168,0.12)",
              color: profile?.[f.key] ? "#10b981" : "var(--text-muted)",
              border: `1px solid ${profile?.[f.key] ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
            }}
          >
            {profile?.[f.key] ? "✓" : "○"} {f.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"profile" | "password">("profile");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) router.push("/login");
  }, [isAuthenticated, router]);

  const { data: profileData, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => api.get("/profile").then((r) => getData<any>(r)),
    enabled: !!user,
  });

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    address: "",
    bio: "",
    dateOfBirth: "",
    gender: "",
    avatarUrl: "",
  });

  useEffect(() => {
    if (profileData) {
      setForm({
        fullName: profileData.fullName ?? "",
        phone: profileData.phone ?? "",
        address: profileData.address ?? "",
        bio: profileData.bio ?? "",
        dateOfBirth: profileData.dateOfBirth?.slice(0, 10) ?? "",
        gender: profileData.gender ?? "",
        avatarUrl: profileData.avatarUrl ?? "",
      });
    }
  }, [profileData]);

  const profileMut = useMutation({
    mutationFn: () => api.patch("/profile", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Teacher extra fields
  const [teacherForm, setTeacherForm] = useState({
    bankAccount: "",
    bankName: "",
    taxCode: "",
    idCardNumber: "",
    salaryPercentage: 40,
  });

  const { data: teacherProfile } = useQuery({
    queryKey: ["teacher-profile"],
    queryFn: () => api.get("/profile/teacher").then((r) => getData<any>(r)),
    enabled: user?.role === "TEACHER",
  });

  useEffect(() => {
    if (teacherProfile) {
      setTeacherForm({
        bankAccount: teacherProfile.bankAccount ?? "",
        bankName: teacherProfile.bankName ?? "",
        taxCode: teacherProfile.taxCode ?? "",
        idCardNumber: teacherProfile.idCardNumber ?? "",
        salaryPercentage: teacherProfile.salaryPercentage ?? 40,
      });
    }
  }, [teacherProfile]);

  // Student extra fields
  const [studentForm, setStudentForm] = useState({
    guardianName: "",
    guardianPhone: "",
    guardianRelation: "",
    school: "",
  });

  const { data: studentProfile } = useQuery({
    queryKey: ["student-profile"],
    queryFn: () => api.get("/profile/student").then((r) => getData<any>(r)),
    enabled: user?.role === "STUDENT",
  });

  useEffect(() => {
    if (studentProfile) {
      setStudentForm({
        guardianName: studentProfile.guardianName ?? "",
        guardianPhone: studentProfile.guardianPhone ?? "",
        guardianRelation: studentProfile.guardianRelation ?? "",
        school: studentProfile.school ?? "",
      });
    }
  }, [studentProfile]);

  // Password change
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState("");

  const pwMut = useMutation({
    mutationFn: () => api.patch("/auth/change-password", pwForm),
    onSuccess: () => {
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e: any) =>
      setPwError(e.response?.data?.message || "Đổi mật khẩu thất bại"),
  });

  const ROLE_COLORS: Record<string, string> = {
    ADMIN: "#6366f1",
    TEACHER: "#10b981",
    STUDENT: "#f59e0b",
  };
  const roleColor = ROLE_COLORS[user?.role ?? "STUDENT"];

  if (!user) return null;

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1 }}>
        <Header title="Hồ sơ cá nhân" subtitle="UC-20 — Cập nhật thông tin tài khoản" />
        <div style={{ padding: "24px 28px", maxWidth: 780 }} className="animate-fadein">

          {/* Avatar + identity */}
          <div
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              marginBottom: 20,
            }}
          >
            <div style={{ position: "relative" }}>
              {form.avatarUrl ? (
                <img
                  src={form.avatarUrl}
                  alt="Avatar"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 18,
                    objectFit: "cover",
                    border: `2px solid ${roleColor}44`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 18,
                    background: `${roleColor}18`,
                    border: `2px solid ${roleColor}44`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 800,
                    color: roleColor,
                  }}
                >
                  {getInitials(form.fullName || user.fullName)}
                </div>
              )}
              <button
                style={{
                  position: "absolute",
                  bottom: -4,
                  right: -4,
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: "var(--accent-primary)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Camera size={12} color="white" />
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                {form.fullName || user.fullName || user.username}
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                @{user.username} · {user.email}
              </p>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  background: `${roleColor}18`,
                  color: roleColor,
                  border: `1px solid ${roleColor}30`,
                  borderRadius: 6,
                  padding: "2px 10px",
                }}
              >
                {user.role === "ADMIN"
                  ? "Quản trị viên"
                  : user.role === "TEACHER"
                  ? "Giáo viên"
                  : "Học sinh"}
              </span>
            </div>
            {saved && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#10b981",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <CheckCircle size={16} /> Đã lưu!
              </div>
            )}
          </div>

          {/* Profile completion */}
          <ProfileProgress profile={{ ...form, ...profileData }} />

          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab-btn ${tab === "profile" ? "active" : ""}`}
              onClick={() => setTab("profile")}
            >
              <User
                size={13}
                style={{ display: "inline", marginRight: 6 }}
              />
              Thông tin cá nhân
            </button>
            <button
              className={`tab-btn ${tab === "password" ? "active" : ""}`}
              onClick={() => setTab("password")}
            >
              <Lock
                size={13}
                style={{ display: "inline", marginRight: 6 }}
              />
              Đổi mật khẩu
            </button>
          </div>

          {tab === "profile" ? (
            <div>
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
              >
                <div style={{ gridColumn: "1/-1" }}>
                  <label className="form-label">Họ và tên</label>
                  <input
                    className="input"
                    value={form.fullName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fullName: e.target.value }))
                    }
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="form-label">Số điện thoại</label>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    placeholder="0901234567"
                  />
                </div>
                <div>
                  <label className="form-label">Ngày sinh</label>
                  <input
                    className="input"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="form-label">Giới tính</label>
                  <select
                    className="input"
                    value={form.gender}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, gender: e.target.value }))
                    }
                  >
                    <option value="">Chọn...</option>
                    <option value="MALE">Nam</option>
                    <option value="FEMALE">Nữ</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label className="form-label">Địa chỉ</label>
                  <input
                    className="input"
                    value={form.address}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, address: e.target.value }))
                    }
                    placeholder="123 Đường ABC, Quận 1, TP.HCM"
                  />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label className="form-label">URL ảnh đại diện</label>
                  <input
                    className="input"
                    value={form.avatarUrl}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, avatarUrl: e.target.value }))
                    }
                    placeholder="https://..."
                  />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label className="form-label">Giới thiệu bản thân</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.bio}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, bio: e.target.value }))
                    }
                    placeholder="Mô tả ngắn về bản thân..."
                    style={{ resize: "none" }}
                  />
                </div>
              </div>

              {/* Teacher extra */}
              {user.role === "TEACHER" && (
                <div style={{ marginTop: 24 }}>
                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--accent-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: 14,
                    }}
                  >
                    📋 Thông tin giáo viên
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                    }}
                  >
                    {[
                      { key: "idCardNumber", label: "Số CCCD" },
                      { key: "taxCode", label: "Mã số thuế" },
                      { key: "bankName", label: "Tên ngân hàng" },
                      { key: "bankAccount", label: "Số tài khoản" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="form-label">{label}</label>
                        <input
                          className="input"
                          value={(teacherForm as any)[key]}
                          onChange={(e) =>
                            setTeacherForm((f) => ({
                              ...f,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                    <div>
                      <label className="form-label">
                        Tỷ lệ lương ({teacherForm.salaryPercentage}%)
                      </label>
                      <input
                        className="input"
                        type="range"
                        min={10}
                        max={80}
                        step={5}
                        value={teacherForm.salaryPercentage}
                        onChange={(e) =>
                          setTeacherForm((f) => ({
                            ...f,
                            salaryPercentage: +e.target.value,
                          }))
                        }
                        style={{ padding: "6px 0" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Student extra */}
              {user.role === "STUDENT" && (
                <div style={{ marginTop: 24 }}>
                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#f59e0b",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: 14,
                    }}
                  >
                    👨‍👩‍👧 Thông tin phụ huynh
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                    }}
                  >
                    <div>
                      <label className="form-label">Tên phụ huynh</label>
                      <input
                        className="input"
                        value={studentForm.guardianName}
                        onChange={(e) =>
                          setStudentForm((f) => ({
                            ...f,
                            guardianName: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label">SĐT phụ huynh</label>
                      <input
                        className="input"
                        value={studentForm.guardianPhone}
                        onChange={(e) =>
                          setStudentForm((f) => ({
                            ...f,
                            guardianPhone: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label">Quan hệ</label>
                      <select
                        className="input"
                        value={studentForm.guardianRelation}
                        onChange={(e) =>
                          setStudentForm((f) => ({
                            ...f,
                            guardianRelation: e.target.value,
                          }))
                        }
                      >
                        <option value="">Chọn...</option>
                        <option value="FATHER">Bố</option>
                        <option value="MOTHER">Mẹ</option>
                        <option value="OTHER">Người giám hộ khác</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Trường học hiện tại</label>
                      <input
                        className="input"
                        value={studentForm.school}
                        onChange={(e) =>
                          setStudentForm((f) => ({
                            ...f,
                            school: e.target.value,
                          }))
                        }
                        placeholder="Trường THCS ABC"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ marginTop: 24, width: "100%" }}
                disabled={profileMut.isPending}
                onClick={() => profileMut.mutate()}
              >
                {profileMut.isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin-slow" /> Đang lưu...
                  </>
                ) : (
                  <>
                    <Save size={15} /> Lưu thông tin
                  </>
                )}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {pwError && (
                <div
                  style={{
                    background: "rgba(244,63,94,0.1)",
                    border: "1px solid rgba(244,63,94,0.3)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 13,
                    color: "#f43f5e",
                  }}
                >
                  {pwError}
                </div>
              )}
              {[
                {
                  key: "currentPassword",
                  label: "Mật khẩu hiện tại",
                },
                { key: "newPassword", label: "Mật khẩu mới" },
                {
                  key: "confirmPassword",
                  label: "Xác nhận mật khẩu mới",
                },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="form-label">{label}</label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="input"
                      type={showPw ? "text" : "password"}
                      value={(pwForm as any)[key]}
                      onChange={(e) =>
                        setPwForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      placeholder="••••••••"
                      style={{ paddingRight: 44 }}
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
                        display: "flex",
                      }}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="btn btn-primary"
                style={{ marginTop: 8 }}
                disabled={
                  pwMut.isPending ||
                  !pwForm.currentPassword ||
                  !pwForm.newPassword ||
                  pwForm.newPassword !== pwForm.confirmPassword
                }
                onClick={() => pwMut.mutate()}
              >
                {pwMut.isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin-slow" /> Đang đổi...
                  </>
                ) : (
                  <>
                    <Lock size={15} /> Đổi mật khẩu
                  </>
                )}
              </button>
              {pwForm.newPassword &&
                pwForm.confirmPassword &&
                pwForm.newPassword !== pwForm.confirmPassword && (
                  <p style={{ fontSize: 12, color: "#f43f5e", marginTop: -8 }}>
                    ⚠️ Mật khẩu xác nhận không khớp
                  </p>
                )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
