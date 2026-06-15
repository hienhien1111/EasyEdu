"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users,
  BookOpen,
  Calendar,
  CreditCard,
  DollarSign,
  Bell,
  FileText,
  Package,
  BarChart3,
  ClipboardCheck,
  GraduationCap,
  BookMarked,
  Clock,
  History,
  LogOut,
  Settings,
  ChevronRight,
  AlertTriangle,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { getInitials } from "@/lib/utils";
import api, { getData } from "@/lib/api";

type TeacherProfileCompletion = {
  isComplete: boolean;
  completion: number;
  missingFields: Array<{ key: string; label: string }>;
};

const ADMIN_NAV = [
  { label: "Dashboard", href: "/admin/dashboard", icon: BarChart3 },
  { label: "Người dùng", href: "/admin/users", icon: Users },
  { label: "Lớp học", href: "/admin/classes", icon: BookOpen },
  { label: "Thời khóa biểu", href: "/admin/schedules", icon: Calendar },
  { label: "Hóa đơn", href: "/admin/invoices", icon: FileText },
  {
    label: "Thanh toán & Tra cứu",
    href: "/admin/payments",
    icon: ClipboardCheck,
  },
  { label: "Theo dõi hóa đơn", href: "/admin/invoices/tracking", icon: BookMarked },
  { label: "Tính lương", href: "/admin/salaries", icon: DollarSign },
  { label: "Thông báo", href: "/admin/notifications", icon: Bell },
  { label: "Vật tư", href: "/admin/inventory", icon: Package },
];

const TEACHER_NAV = [
  { label: "Lớp của tôi", href: "/teacher/classes", icon: BookOpen },
  { label: "Điểm danh", href: "/teacher/attendance", icon: ClipboardCheck },
  { label: "Duyệt tiền mặt", href: "/teacher/cash-payments", icon: CreditCard },
  {
    label: "Lịch sử dạy học",
    href: "/teacher/teaching-history",
    icon: History,
  },
  { label: "Thời khóa biểu", href: "/teacher/schedule", icon: Calendar },
];

const STUDENT_NAV = [
  { label: "Lịch học", href: "/student/my-schedule", icon: Clock },
  { label: "Thanh toán", href: "/student/payments", icon: CreditCard },
  { label: "Đăng ký học", href: "/student/enrollments", icon: GraduationCap },
];

const ROLE_NAV: Record<string, typeof ADMIN_NAV> = {
  ADMIN: ADMIN_NAV,
  TEACHER: TEACHER_NAV,
  STUDENT: STUDENT_NAV,
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#6366f1",
  TEACHER: "#10b981",
  STUDENT: "#f59e0b",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Quản trị viên",
  TEACHER: "Giáo viên",
  STUDENT: "Học sinh",
};

function getActiveHref<T extends { href: string }>(
  items: T[],
  pathname: string,
) {
  return items
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function teacherPromptKey(userId: string) {
  return `easyedu-teacher-profile-prompt:${userId}`;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [dismissedPromptKeys, setDismissedPromptKeys] = useState<
    Record<string, boolean>
  >({});

  const navItems = ROLE_NAV[user?.role ?? "STUDENT"] ?? STUDENT_NAV;
  const roleColor = ROLE_COLORS[user?.role ?? "STUDENT"];
  const activeHref = getActiveHref(navItems, pathname);
  const { data: teacherCompletion } = useQuery({
    queryKey: ["teacher-profile-completion", user?.id],
    queryFn: () =>
      api
        .get("/profile/teacher/completion")
        .then((r) => getData<TeacherProfileCompletion>(r)),
    enabled: user?.role === "TEACHER",
    staleTime: 60_000,
  });
  const needsTeacherProfile =
    user?.role === "TEACHER" &&
    !!teacherCompletion &&
    !teacherCompletion.isComplete;
  const currentPromptKey =
    user?.role === "TEACHER" && user.id ? teacherPromptKey(user.id) : "";
  const profilePromptDismissed =
    !currentPromptKey ||
    dismissedPromptKeys[currentPromptKey] ||
    (typeof window !== "undefined" &&
      sessionStorage.getItem(currentPromptKey) === "1");

  const dismissProfilePrompt = () => {
    if (currentPromptKey) {
      sessionStorage.setItem(currentPromptKey, "1");
      setDismissedPromptKeys((keys) => ({
        ...keys,
        [currentPromptKey]: true,
      }));
    }
  };

  const openProfile = () => {
    dismissProfilePrompt();
    router.push("/profile");
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    clearAuth();
    router.push("/login");
  };

  return (
    <>
      <aside className="sidebar">
        {/* Logo */}
        <div
          style={{
            padding: "24px 20px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #6366f1, #a855f7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(99,102,241,0.35)",
              }}
            >
              <BookMarked size={18} color="white" />
            </div>
            <div>
              <p
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  color: "var(--text-primary)",
                  lineHeight: 1,
                }}
              >
                EasyEdu
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 2,
                  lineHeight: 1,
                }}
              >
                Trung tâm Dạy học
              </p>
            </div>
          </div>
        </div>

        {/* User info */}
        <div style={{ padding: "16px 16px 12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.15)",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${roleColor}22`,
                border: `2px solid ${roleColor}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: roleColor,
                flexShrink: 0,
              }}
            >
              {getInitials(user?.fullName)}
            </div>
            <div style={{ overflow: "hidden", flex: 1 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.fullName ?? user?.username}
              </p>
              <p style={{ fontSize: 11, color: roleColor, fontWeight: 500 }}>
                {ROLE_LABELS[user?.role ?? "STUDENT"]}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "8px 0" }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              padding: "8px 24px 4px",
            }}
          >
            Menu chính
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? "active" : ""}`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {active && (
                  <ChevronRight
                    size={13}
                    style={{ marginLeft: "auto", opacity: 0.5 }}
                  />
                )}
              </Link>
            );
          })}

          {/* Profile */}
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              padding: "16px 24px 4px",
            }}
          >
            Tài khoản
          </p>
          <Link
            href="/profile"
            className={`nav-item ${pathname === "/profile" ? "active" : ""}`}
          >
            <Settings size={17} />
            <span>Hồ sơ cá nhân</span>
            {needsTeacherProfile && (
              <span
                style={{
                  marginLeft: "auto",
                  border: "1px solid rgba(245,158,11,0.35)",
                  background: "rgba(245,158,11,0.12)",
                  color: "#f59e0b",
                  borderRadius: 6,
                  padding: "1px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1.5,
                }}
              >
                Cần bổ sung
              </span>
            )}
          </Link>
        </nav>

        {/* Logout */}
        <div style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={handleLogout}
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "flex-start", gap: 10 }}
          >
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>
      </aside>

      {needsTeacherProfile && !profilePromptDismissed && (
        <div className="modal-overlay" onClick={dismissProfilePrompt}>
          <div
            className="modal"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.32)",
                    color: "#f59e0b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={19} />
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: 17,
                      fontWeight: 800,
                      color: "var(--text-primary)",
                    }}
                  >
                    Hoàn thiện hồ sơ giáo viên
                  </h2>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginTop: 3,
                    }}
                  >
                    Vui lòng bổ sung thông tin để hồ sơ giáo viên đầy đủ.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissProfilePrompt}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              {(teacherCompletion?.missingFields ?? []).map((field) => (
                <div
                  key={field.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderBottom:
                      field.key !== teacherCompletion?.missingFields.at(-1)?.key
                        ? "1px solid var(--border)"
                        : "none",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={{ color: "#f59e0b", fontWeight: 800 }}>!</span>
                  {field.label}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={dismissProfilePrompt}
              >
                Để sau
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={openProfile}
              >
                Mở hồ sơ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
