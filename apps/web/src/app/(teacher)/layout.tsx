"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import UnresolvedAttendancePrompt from "@/components/attendance/UnresolvedAttendancePrompt";
import { useAuthStore } from "@/stores/auth.store";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, hasHydrated, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated()) router.push("/login");
    else if (user?.role === "ADMIN") router.push("/admin/dashboard");
    else if (user?.role === "STUDENT") router.push("/student/my-schedule");
  }, [user, hasHydrated, isAuthenticated, router]);

  if (!hasHydrated || !user || user.role !== "TEACHER") return null;

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1 }}>
        {children}
      </main>
      <UnresolvedAttendancePrompt />
    </div>
  );
}
