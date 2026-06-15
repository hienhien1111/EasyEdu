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

type ProfileForm = {
  fullName: string;
  phone: string;
  address: string;
  dateOfBirth: string;
  gender: string;
  avatarUrl: string;
};

type TeacherForm = {
  bankAccountNumber: string;
  bankName: string;
  idCardNumber: string;
  salaryQrCodeUrl: string;
};

type StudentForm = {
  guardianName: string;
  guardianPhone: string;
  guardianRelation: string;
  school: string;
};

const TEACHER_PROFILE_FIELDS: Array<{
  key: keyof TeacherForm;
  label: string;
}> = [
  { key: "idCardNumber", label: "Số CCCD" },
  { key: "bankName", label: "Tên ngân hàng" },
  { key: "bankAccountNumber", label: "Số tài khoản" },
  { key: "salaryQrCodeUrl", label: "URL QR nhận lương" },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user, hasHydrated, isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"profile" | "password">("profile");
  const [saved, setSaved] = useState(false);
  const [profileUnlocked, setProfileUnlocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [showUnlockPw, setShowUnlockPw] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated()) router.push("/login");
  }, [hasHydrated, isAuthenticated, router]);

  const { data: profileData } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => api.get("/profile").then((r) => getData<any>(r)),
    enabled: hasHydrated && !!user && profileUnlocked,
  });

  const [formDraft, setFormDraft] = useState<Partial<ProfileForm>>({});
  const form: ProfileForm = {
    fullName: formDraft.fullName ?? profileData?.fullName ?? "",
    phone: formDraft.phone ?? profileData?.phone ?? "",
    address: formDraft.address ?? profileData?.address ?? "",
    dateOfBirth:
      formDraft.dateOfBirth ?? profileData?.dateOfBirth?.slice(0, 10) ?? "",
    gender: formDraft.gender ?? profileData?.gender ?? "",
    avatarUrl: formDraft.avatarUrl ?? profileData?.avatarUrl ?? "",
  };
  const updateForm = (patch: Partial<ProfileForm>) =>
    setFormDraft((draft) => ({ ...draft, ...patch }));

  // Teacher extra fields
  const [teacherDraft, setTeacherDraft] = useState<Partial<TeacherForm>>({});
  const [qrUploadError, setQrUploadError] = useState("");

  const { data: teacherProfile } = useQuery({
    queryKey: ["teacher-profile"],
    queryFn: () => api.get("/profile/teacher").then((r) => getData<any>(r)),
    enabled: hasHydrated && profileUnlocked && user?.role === "TEACHER",
  });

  const teacherForm: TeacherForm = {
    bankAccountNumber:
      teacherDraft.bankAccountNumber ?? teacherProfile?.bankAccountNumber ?? "",
    bankName: teacherDraft.bankName ?? teacherProfile?.bankName ?? "",
    idCardNumber:
      teacherDraft.idCardNumber ?? teacherProfile?.idCardNumber ?? "",
    salaryQrCodeUrl:
      teacherDraft.salaryQrCodeUrl ?? teacherProfile?.salaryQrCodeUrl ?? "",
  };
  const updateTeacherForm = (patch: Partial<TeacherForm>) =>
    setTeacherDraft((draft) => ({ ...draft, ...patch }));

  const salaryQrMut = useMutation({
    mutationFn: (payload: { fileName?: string; dataUrl: string }) =>
      api.post("/profile/teacher/salary-qr", payload),
    onSuccess: (res) => {
      const data = getData<any>(res);
      updateTeacherForm({ salaryQrCodeUrl: data.salaryQrCodeUrl ?? "" });
      qc.invalidateQueries({ queryKey: ["teacher-profile"] });
      setQrUploadError("");
    },
    onError: (e: any) =>
      setQrUploadError(e.response?.data?.message || "Upload QR thất bại"),
  });

  const handleSalaryQrFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      salaryQrMut.mutate({ fileName: file.name, dataUrl });
    };
    reader.onerror = () => setQrUploadError("Không thể đọc file QR");
    reader.readAsDataURL(file);
  };

  const profileMut = useMutation({
    mutationFn: async () => {
      const baseProfilePayload =
        user?.role === "TEACHER"
          ? {
              fullName: form.fullName,
              phone: form.phone,
              gender: form.gender,
              avatarUrl: form.avatarUrl,
            }
          : form;
      const requests = [api.patch("/profile", baseProfilePayload)];
      if (user?.role === "TEACHER") {
        requests.push(api.patch("/profile/teacher", teacherForm));
      }
      return Promise.all(requests);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["teacher-profile"] });
      qc.invalidateQueries({ queryKey: ["teacher-profile-completion"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Student extra fields
  const [studentDraft, setStudentDraft] = useState<Partial<StudentForm>>({});

  const { data: studentProfile } = useQuery({
    queryKey: ["student-profile"],
    queryFn: () => api.get("/profile/student").then((r) => getData<any>(r)),
    enabled: hasHydrated && profileUnlocked && user?.role === "STUDENT",
  });

  const studentForm: StudentForm = {
    guardianName:
      studentDraft.guardianName ?? studentProfile?.guardianName ?? "",
    guardianPhone:
      studentDraft.guardianPhone ?? studentProfile?.guardianPhone ?? "",
    guardianRelation:
      studentDraft.guardianRelation ?? studentProfile?.guardianRelation ?? "",
    school: studentDraft.school ?? studentProfile?.school ?? "",
  };
  const updateStudentForm = (patch: Partial<StudentForm>) =>
    setStudentDraft((draft) => ({ ...draft, ...patch }));

  // Password change
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState("");

  const unlockMut = useMutation({
    mutationFn: () =>
      api.post("/profile/verify-password", { password: unlockPassword }),
    onSuccess: () => {
      setProfileUnlocked(true);
      setUnlockPassword("");
      setUnlockError("");
    },
    onError: (e: any) =>
      setUnlockError(e.response?.data?.message || "Mật khẩu không đúng"),
  });

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

  if (!hasHydrated || !user) return null;

  if (!profileUnlocked) {
    return (
      <div style={{ display: "flex" }}>
        <Sidebar />
        <main className="main-content" style={{ flex: 1 }}>
          <Header
            title="Hồ sơ cá nhân"
            subtitle="Xác minh mật khẩu để tiếp tục"
          />
          <div
            style={{ padding: "24px 28px", maxWidth: 480 }}
            className="animate-fadein"
          >
            <div className="card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: "rgba(99,102,241,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent-secondary)",
                  }}
                >
                  <Lock size={19} />
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "var(--text-primary)",
                    }}
                  >
                    Xác minh mật khẩu
                  </h2>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    Nhập mật khẩu tài khoản để xem hồ sơ cá nhân.
                  </p>
                </div>
              </div>

              {unlockError && (
                <div
                  style={{
                    background: "rgba(244,63,94,0.1)",
                    border: "1px solid rgba(244,63,94,0.3)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 14,
                    fontSize: 13,
                    color: "#f43f5e",
                  }}
                >
                  {unlockError}
                </div>
              )}

              <label className="form-label">Mật khẩu</label>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showUnlockPw ? "text" : "password"}
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      unlockPassword &&
                      !unlockMut.isPending
                    ) {
                      setUnlockError("");
                      unlockMut.mutate();
                    }
                  }}
                  placeholder="Nhập mật khẩu hiện tại"
                  style={{ paddingRight: 44 }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowUnlockPw((p) => !p)}
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
                  {showUnlockPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 16 }}
                disabled={!unlockPassword || unlockMut.isPending}
                onClick={() => {
                  setUnlockError("");
                  unlockMut.mutate();
                }}
              >
                {unlockMut.isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin-slow" /> Đang xác
                    minh...
                  </>
                ) : (
                  <>
                    <Lock size={15} /> Xem hồ sơ
                  </>
                )}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1 }}>
        <Header
          title="Hồ sơ cá nhân"
          subtitle="UC-20 — Cập nhật thông tin tài khoản"
        />
        <div
          style={{ padding: "24px 28px", maxWidth: 780 }}
          className="animate-fadein"
        >
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
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
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

          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab-btn ${tab === "profile" ? "active" : ""}`}
              onClick={() => setTab("profile")}
            >
              <User size={13} style={{ display: "inline", marginRight: 6 }} />
              Thông tin cá nhân
            </button>
            <button
              className={`tab-btn ${tab === "password" ? "active" : ""}`}
              onClick={() => setTab("password")}
            >
              <Lock size={13} style={{ display: "inline", marginRight: 6 }} />
              Đổi mật khẩu
            </button>
          </div>

          {tab === "profile" ? (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div style={{ gridColumn: "1/-1" }}>
                  <label className="form-label">Họ và tên</label>
                  <input
                    className="input"
                    value={form.fullName}
                    onChange={(e) => updateForm({ fullName: e.target.value })}
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="form-label">Số điện thoại</label>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(e) => updateForm({ phone: e.target.value })}
                    placeholder="0901234567"
                  />
                </div>
                {user.role !== "TEACHER" && (
                  <div>
                    <label className="form-label">Ngày sinh</label>
                    <input
                      className="input"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) =>
                        updateForm({ dateOfBirth: e.target.value })
                      }
                    />
                  </div>
                )}
                <div>
                  <label className="form-label">Giới tính</label>
                  <select
                    className="input"
                    value={form.gender}
                    onChange={(e) => updateForm({ gender: e.target.value })}
                  >
                    <option value="">Chọn...</option>
                    <option value="MALE">Nam</option>
                    <option value="FEMALE">Nữ</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </div>
                {user.role !== "TEACHER" && (
                  <div style={{ gridColumn: "1/-1" }}>
                    <label className="form-label">Địa chỉ</label>
                    <input
                      className="input"
                      value={form.address}
                      onChange={(e) => updateForm({ address: e.target.value })}
                      placeholder="123 Đường ABC, Quận 1, TP.HCM"
                    />
                  </div>
                )}
                <div style={{ gridColumn: "1/-1" }}>
                  <label className="form-label">URL ảnh đại diện</label>
                  <input
                    className="input"
                    value={form.avatarUrl}
                    onChange={(e) => updateForm({ avatarUrl: e.target.value })}
                    placeholder="https://..."
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
                    {TEACHER_PROFILE_FIELDS.map(({ key, label }) => (
                      <div key={key} style={key === "salaryQrCodeUrl" ? { gridColumn: "1/-1" } : undefined}>
                        <label className="form-label">{label}</label>
                        <input
                          className="input"
                          value={teacherForm[key]}
                          onChange={(e) =>
                            updateTeacherForm({ [key]: e.target.value })
                          }
                        />
                      </div>
                    ))}
                    <div style={{ gridColumn: "1/-1" }}>
                      <label className="form-label">Upload ảnh QR nhận lương</label>
                      <input
                        className="input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={salaryQrMut.isPending}
                        onChange={(e) => handleSalaryQrFile(e.target.files?.[0])}
                      />
                      {qrUploadError && (
                        <p style={{ color: "#f43f5e", fontSize: 12, marginTop: 6 }}>
                          {qrUploadError}
                        </p>
                      )}
                      {teacherForm.salaryQrCodeUrl && (
                        <img
                          src={teacherForm.salaryQrCodeUrl}
                          alt="QR nhận lương"
                          style={{
                            width: 120,
                            height: 120,
                            objectFit: "cover",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            marginTop: 10,
                            background: "white",
                          }}
                        />
                      )}
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
                          updateStudentForm({
                            guardianName: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label">SĐT phụ huynh</label>
                      <input
                        className="input"
                        value={studentForm.guardianPhone}
                        onChange={(e) =>
                          updateStudentForm({
                            guardianPhone: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label">Quan hệ</label>
                      <select
                        className="input"
                        value={studentForm.guardianRelation}
                        onChange={(e) =>
                          updateStudentForm({
                            guardianRelation: e.target.value,
                          })
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
                          updateStudentForm({
                            school: e.target.value,
                          })
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
                    <Loader2 size={15} className="animate-spin-slow" /> Đang
                    lưu...
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
                    <Loader2 size={15} className="animate-spin-slow" /> Đang
                    đổi...
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
