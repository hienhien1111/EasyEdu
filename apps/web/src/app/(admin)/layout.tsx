"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import { useAuthStore } from "@/stores/auth.store";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, hasHydrated, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated()) {
      router.push("/login");
    } else if (user?.role !== "ADMIN") {
      // Redirect non-admins to their portal
      if (user?.role === "TEACHER") router.push("/teacher/classes");
      else router.push("/student/my-schedule");
    }
  }, [user, hasHydrated, isAuthenticated, router]);

  if (!hasHydrated || !user || user.role !== "ADMIN") return null;

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  );
}
