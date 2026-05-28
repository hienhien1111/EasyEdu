"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import { useAuthStore } from "@/stores/auth.store";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated()) router.push("/login");
    else if (user?.role === "ADMIN") router.push("/admin/dashboard");
    else if (user?.role === "TEACHER") router.push("/teacher/classes");
  }, [user, isAuthenticated, router]);

  if (!user || user.role !== "STUDENT") return null;

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
