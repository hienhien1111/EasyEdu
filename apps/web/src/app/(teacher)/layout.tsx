"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import { useAuthStore } from "@/stores/auth.store";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated()) router.push("/login");
    else if (user?.role === "ADMIN") router.push("/admin/dashboard");
    else if (user?.role === "STUDENT") router.push("/student/my-schedule");
  }, [user, isAuthenticated, router]);

  if (!user || user.role !== "TEACHER") return null;

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
