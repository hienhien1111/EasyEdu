"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, BookOpen, Calendar, CreditCard,
  DollarSign, Bell, Package, BarChart3, ClipboardCheck,
  GraduationCap, BookMarked, Clock, LogOut, Settings, ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { getInitials } from "@/lib/utils";
import api from "@/lib/api";

const ADMIN_NAV = [
  { label: "Dashboard", href: "/admin/dashboard", icon: BarChart3 },
  { label: "Người dùng", href: "/admin/users", icon: Users },
  { label: "Lớp học", href: "/admin/classes", icon: BookOpen },
  { label: "Thời khóa biểu", href: "/admin/schedules", icon: Calendar },
  { label: "Thanh toán", href: "/admin/payments", icon: CreditCard },
  { label: "Tra soát TT", href: "/admin/payments/inquiries", icon: ClipboardCheck },
  { label: "Tính lương", href: "/admin/salaries", icon: DollarSign },
  { label: "Thông báo", href: "/admin/notifications", icon: Bell },
  { label: "Vật tư", href: "/admin/inventory", icon: Package },
];

const TEACHER_NAV = [
  { label: "Lớp của tôi", href: "/teacher/classes", icon: BookOpen },
  { label: "Điểm danh", href: "/teacher/attendance", icon: ClipboardCheck },
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

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  const navItems = ROLE_NAV[user?.role ?? "STUDENT"] ?? STUDENT_NAV;
  const roleColor = ROLE_COLORS[user?.role ?? "STUDENT"];

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    clearAuth();
    router.push("/login");
  };

  return (
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
            <p style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)", lineHeight: 1 }}>
              EasyEdu
            </p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, lineHeight: 1 }}>
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
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`}>
              <Icon size={17} />
              <span>{item.label}</span>
              {active && (
                <ChevronRight size={13} style={{ marginLeft: "auto", opacity: 0.5 }} />
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
  );
}
