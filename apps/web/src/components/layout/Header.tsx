"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Search, X, CheckCircle, Clock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import api, { getData } from "@/lib/api";
import { formatRelative } from "@/lib/utils";


interface HeaderProps {
  title: string;
  subtitle?: string;
}

function NotificationDropdown({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => api.get("/notifications/my").then((r) => getData<any[]>(r)),
    staleTime: 30000,
  });

  const markRead = useMutation({
    mutationFn: (recipientId: string) =>
      api.patch(`/notifications/read/${recipientId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = (data ?? []).filter((r: any) => !r.isRead);
      await Promise.all(
        unread.map((r: any) => api.patch(`/notifications/read/${r.id}`))
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const notifications: any[] = data ?? [];
  const unreadCount = notifications.filter((r) => !r.isRead).length;

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        right: 0,
        width: 360,
        background: "var(--bg-card)",
        border: "1px solid var(--border-light)",
        borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        zIndex: 1000,
        overflow: "hidden",
        animation: "fadeInUp 0.2s ease",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 18px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Bell size={15} color="var(--accent-secondary)" />
          <span
            style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}
          >
            Thông báo
          </span>
          {unreadCount > 0 && (
            <span
              style={{
                background: "#f43f5e",
                color: "white",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 10,
                padding: "1px 7px",
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              style={{
                fontSize: 11,
                color: "var(--accent-secondary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                padding: "4px 6px",
              }}
            >
              Đọc tất cả
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "flex",
              padding: 4,
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {isLoading ? (
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <Bell size={32} style={{ margin: "0 auto 12px", opacity: 0.2, display: "block" }} />
            <p style={{ fontSize: 13 }}>Chưa có thông báo nào</p>
          </div>
        ) : (
          notifications.map((recipient: any) => {
            const notif = recipient.notification;
            const isRead = recipient.isRead;
            return (
              <div
                key={recipient.id}
                onClick={() => {
                  if (!isRead) markRead.mutate(recipient.id);
                }}
                style={{
                  padding: "12px 18px",
                  borderBottom: "1px solid rgba(37,42,69,0.5)",
                  cursor: isRead ? "default" : "pointer",
                  background: isRead ? "transparent" : "rgba(99,102,241,0.04)",
                  transition: "background 0.15s",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
                onMouseEnter={(e) => {
                  if (!isRead) (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.08)";
                }}
                onMouseLeave={(e) => {
                  if (!isRead) (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.04)";
                }}
              >
                {/* Dot indicator */}
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isRead ? "transparent" : "#6366f1",
                    border: isRead ? "1px solid var(--border)" : "none",
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: isRead ? 500 : 700,
                      color: isRead ? "var(--text-secondary)" : "var(--text-primary)",
                      marginBottom: 3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {notif?.title ?? "Thông báo"}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    dangerouslySetInnerHTML={{
                      __html: (notif?.content ?? "").replace(/<[^>]*>/g, "").slice(0, 80) +
                        ((notif?.content ?? "").length > 80 ? "..." : ""),
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 5,
                    }}
                  >
                    <Clock size={10} color="var(--text-muted)" />
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {formatRelative(notif?.sentAt ?? notif?.createdAt)}
                    </span>
                    {isRead && (
                      <>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>·</span>
                        <CheckCircle size={10} color="var(--accent-emerald)" />
                        <span style={{ fontSize: 10, color: "var(--accent-emerald)" }}>Đã đọc</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div
          style={{
            padding: "10px 18px",
            borderTop: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {notifications.length} thông báo · {unreadCount} chưa đọc
          </p>
        </div>
      )}
    </div>
  );
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { user } = useAuthStore();
  const [showNotifications, setShowNotifications] = useState(false);

  const { data: notifData } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => api.get("/notifications/my").then((r) => getData<any[]>(r)),
    staleTime: 60000,
    refetchInterval: 60000, // Poll every 60s
  });

  const unreadCount = (notifData ?? []).filter((r: any) => !r.isRead).length;

  return (
    <header
      style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(13,15,26,0.8)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-primary)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          />
          <input
            className="input"
            placeholder="Tìm kiếm..."
            style={{
              width: 220,
              paddingLeft: 36,
              paddingTop: 8,
              paddingBottom: 8,
              fontSize: 13,
            }}
          />
        </div>

        {/* Notifications Bell — with dropdown */}
        <div style={{ position: "relative" }}>
          <button
            id="notification-bell-btn"
            className="btn btn-ghost btn-sm"
            style={{ position: "relative", padding: "8px" }}
            onClick={() => setShowNotifications((v) => !v)}
            aria-label="Thông báo"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  right: 3,
                  width: unreadCount > 9 ? "auto" : 16,
                  height: 16,
                  minWidth: 16,
                  background: "#f43f5e",
                  borderRadius: 999,
                  border: "1.5px solid var(--bg-primary)",
                  fontSize: 9,
                  fontWeight: 800,
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 3px",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <NotificationDropdown onClose={() => setShowNotifications(false)} />
          )}
        </div>
      </div>
    </header>
  );
}
