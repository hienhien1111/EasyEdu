"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

export default function RootPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [dots, setDots] = useState(".");

  // Animated dots for visual feedback
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else if (user?.role === "ADMIN") {
      router.replace("/admin/dashboard");
    } else if (user?.role === "TEACHER") {
      router.replace("/teacher/classes");
    } else {
      router.replace("/student/my-schedule");
    }
  }, [user, isAuthenticated, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 600,
          background:
            "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ textAlign: "center" }}>
        {/* Logo */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "linear-gradient(135deg, #6366f1, #a855f7)",
            margin: "0 auto 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 32px rgba(99,102,241,0.4)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>

        {/* Brand */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            background: "linear-gradient(135deg, #6366f1, #a855f7)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 8,
          }}
        >
          EasyEdu
        </h1>

        {/* Skeleton cards */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 28,
            width: 240,
          }}
        >
          {[80, 60, 70].map((w, i) => (
            <div
              key={i}
              style={{
                height: 12,
                borderRadius: 6,
                background:
                  "linear-gradient(90deg, rgba(99,102,241,0.08) 25%, rgba(99,102,241,0.18) 50%, rgba(99,102,241,0.08) 75%)",
                backgroundSize: "200% 100%",
                animation: `shimmer 1.6s ease-in-out infinite ${i * 0.15}s`,
                width: `${w}%`,
                margin: "0 auto",
              }}
            />
          ))}
        </div>

        {/* Status text */}
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            marginTop: 24,
            minWidth: 140,
          }}
        >
          Đang chuyển hướng{dots}
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 8px 32px rgba(99,102,241,0.4); }
          50% { box-shadow: 0 8px 48px rgba(99,102,241,0.65); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
