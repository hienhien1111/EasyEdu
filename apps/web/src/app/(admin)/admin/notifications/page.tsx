"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Trash2, X, Loader2, Bell } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatDate, getStatusBadgeClass, STATUS_LABELS } from "@/lib/utils";

const TARGET_TYPES = [
  { value: "ALL", label: "🌐 Tất cả người dùng" },
  { value: "ALL_TEACHERS", label: "👩‍🏫 Tất cả giáo viên" },
  { value: "ALL_STUDENTS", label: "🎒 Tất cả học sinh" },
  { value: "SPECIFIC_USERS", label: "👤 Người dùng cụ thể" },
];

function CreateNotifModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", content: "", targetType: "ALL", scheduledAt: "" });
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: () => api.post("/notifications", { ...form, scheduledAt: form.scheduledAt || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Tạo thông báo thất bại"),
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>📢 Tạo thông báo mới</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="form-label">Tiêu đề</label>
            <input className="input" placeholder="Tiêu đề thông báo..." value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Nội dung</label>
            <textarea className="input" rows={4} placeholder="Nhập nội dung thông báo..." value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} style={{ resize: "none" }} />
          </div>
          <div>
            <label className="form-label">Gửi đến</label>
            <select className="input" value={form.targetType} onChange={(e) => setForm(f => ({ ...f, targetType: e.target.value }))}>
              {TARGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Hẹn giờ gửi (để trống = gửi ngay)</label>
            <input className="input" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={!form.title || !form.content || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang gửi...</> : <><Send size={14} /> {form.scheduledAt ? "Hẹn gửi" : "Gửi ngay"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminNotificationsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications").then(r => getData<any[]>(r)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const list: any[] = notifications ?? [];

  return (
    <div>
      <Header title="Quản lý Thông báo" subtitle="UC-10 — Soạn, hẹn giờ, gửi thông báo đến học sinh/giáo viên" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Tạo thông báo
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {isLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)
          ) : list.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
              <Bell size={40} style={{ margin: "0 auto 12px", opacity: 0.3, display: "block" }} />
              <p>Chưa có thông báo nào</p>
            </div>
          ) : list.map((n: any) => (
            <div key={n.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{n.title}</h3>
                  <span className={`badge ${getStatusBadgeClass(n.status)}`}>{STATUS_LABELS[n.status] ?? n.status}</span>
                  <span className="badge badge-gray">{TARGET_TYPES.find(t => t.value === n.targetType)?.label ?? n.targetType}</span>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>{n.content}</p>
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {n.status === "SCHEDULED" ? `🕐 Gửi lúc: ${formatDate(n.scheduledAt, "HH:mm dd/MM/yyyy")}` : `📤 Đã gửi: ${formatDate(n.sentAt ?? n.createdAt, "HH:mm dd/MM/yyyy")}`}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    👥 {n._count?.recipients ?? 0} người nhận
                  </span>
                  {n._count?.recipients > 0 && (
                    <span style={{ fontSize: 11, color: "#10b981" }}>
                      ✓ {n.recipients?.length ?? 0} đã đọc
                    </span>
                  )}
                </div>
              </div>
              {n.status !== "SENT" && (
                <button className="btn btn-danger btn-sm" onClick={() => { if (confirm("Xóa thông báo?")) deleteMut.mutate(n.id); }} style={{ flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {showCreate && <CreateNotifModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
