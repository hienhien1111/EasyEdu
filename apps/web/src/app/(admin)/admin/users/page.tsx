"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Lock, Unlock, UserCheck, X, Loader2, Pencil, ShieldCheck,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatDate, getInitials, getStatusBadgeClass, ROLE_LABELS, STATUS_LABELS } from "@/lib/utils";

const ROLES = ["ADMIN", "TEACHER", "STUDENT"];
const STATUSES = ["ACTIVE", "LOCKED", "PENDING_APPROVAL"];
const ROLE_COLORS: Record<string, string> = { ADMIN: "#6366f1", TEACHER: "#10b981", STUDENT: "#f59e0b" };

/* ─── Create User Modal ─────────────────────────────────── */
function UserCreateForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", role: "STUDENT" });
  const [err, setErr] = useState("");

  const mut = useMutation({
    mutationFn: (data: any) => api.post("/users", data),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Tạo thất bại"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>Tạo tài khoản mới</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#f43f5e" }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { key: "fullName", label: "Họ và tên", placeholder: "Nguyễn Văn A" },
            { key: "email", label: "Email", placeholder: "email@easyedu.vn", type: "email" },
            { key: "phone", label: "Số điện thoại", placeholder: "0901234567" },
            { key: "password", label: "Mật khẩu", placeholder: "Tối thiểu 8 ký tự", type: "password" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="form-label">{label}</label>
              <input className="input" type={type ?? "text"} placeholder={placeholder}
                value={(form as any)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="form-label">Vai trò</label>
            <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={mut.isPending}
            onClick={() => mut.mutate({ ...form })}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang tạo...</> : "Tạo tài khoản"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Edit User Modal ───────────────────────────────────── */
function UserEditModal({ user, onClose }: { user: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullName: user.fullName ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
  });
  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState<"info" | "password" | "status">("info");

  const updateMut = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setSuccess("Đã cập nhật thông tin thành công");
    },
    onError: (e: any) => setErr(e.response?.data?.message || "Cập nhật thất bại"),
  });

  const pwMut = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/reset-password`, { newPassword }),
    onSuccess: () => { setNewPassword(""); setSuccess("Đã đặt lại mật khẩu"); },
    onError: (e: any) => setErr(e.response?.data?.message || "Đặt lại mật khẩu thất bại"),
  });

  const lockMut = useMutation({
    mutationFn: (reason: string) => api.patch(`/users/${user.id}/lock`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Thất bại"),
  });
  const unlockMut = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/unlock`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onClose(); },
  });
  const approveMut = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onClose(); },
  });

  const roleColor = ROLE_COLORS[user.role] ?? "#9198c5";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `${roleColor}18`, border: `2px solid ${roleColor}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: roleColor, flexShrink: 0,
            }}>
              {getInitials(user.fullName)}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{user.fullName ?? "—"}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                <span className="badge" style={{ background: `${roleColor}18`, color: roleColor, borderColor: `${roleColor}30`, fontSize: 10 }}>
                  {ROLE_LABELS[user.role]}
                </span>
                {" "}
                <span className={`badge ${getStatusBadgeClass(user.status)}`} style={{ fontSize: 10 }}>
                  {STATUS_LABELS[user.status] ?? user.status}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-secondary)", borderRadius: 10, padding: 3 }}>
          {[
            { key: "info", label: "Thông tin" },
            { key: "password", label: "Mật khẩu" },
            { key: "status", label: "Trạng thái" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key as any); setErr(""); setSuccess(""); }}
              style={{
                flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600,
                borderRadius: 8, border: "none", cursor: "pointer",
                background: tab === t.key ? "var(--bg-card)" : "transparent",
                color: tab === t.key ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                transition: "all 0.15s",
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* Alerts */}
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}>{err}</div>}
        {success && <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#10b981" }}>{success}</div>}

        {/* Tab: Info */}
        {tab === "info" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="form-label">Họ và tên</label>
              <input className="input" value={form.fullName}
                onChange={(e) => setForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input className="input" type="email" value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Số điện thoại</label>
              <input className="input" value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", background: "rgba(99,102,241,0.06)", borderRadius: 8, padding: "8px 12px" }}>
              Username: <strong style={{ color: "var(--text-secondary)" }}>@{user.username}</strong>
              {user.lastLoginAt && <span style={{ marginLeft: 12 }}>Đăng nhập lần cuối: {formatDate(user.lastLoginAt, "dd/MM/yyyy HH:mm")}</span>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={updateMut.isPending}
                onClick={() => { setErr(""); setSuccess(""); updateMut.mutate(); }}>
                {updateMut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        )}

        {/* Tab: Password */}
        {tab === "password" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f59e0b" }}>
              Admin đặt lại mật khẩu sẽ không cần nhập mật khẩu cũ. Người dùng nên đổi lại sau khi nhận mật khẩu mới.
            </div>
            <div>
              <label className="form-label">Mật khẩu mới</label>
              <input className="input" type="password" placeholder="Tối thiểu 8 ký tự"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
              <button className="btn btn-primary" style={{ flex: 1 }}
                disabled={newPassword.length < 8 || pwMut.isPending}
                onClick={() => { setErr(""); setSuccess(""); pwMut.mutate(); }}>
                {pwMut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang đặt lại...</> : "Đặt lại mật khẩu"}
              </button>
            </div>
          </div>
        )}

        {/* Tab: Status */}
        {tab === "status" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {user.status === "PENDING_APPROVAL" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Tài khoản đang chờ duyệt.</p>
                <button className="btn btn-success" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                  <ShieldCheck size={14} /> {approveMut.isPending ? "Đang duyệt..." : "Duyệt tài khoản"}
                </button>
              </div>
            )}
            {user.status === "ACTIVE" && (
              <LockSection userId={user.id} onDone={onClose} />
            )}
            {user.status === "LOCKED" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {user.lockReason && (
                  <div style={{ background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f43f5e" }}>
                    Lý do khóa: {user.lockReason}
                  </div>
                )}
                <button className="btn btn-ghost" onClick={() => unlockMut.mutate()} disabled={unlockMut.isPending}>
                  <Unlock size={14} /> {unlockMut.isPending ? "Đang mở khóa..." : "Mở khóa tài khoản"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LockSection({ userId, onDone }: { userId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => api.patch(`/users/${userId}/lock`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onDone(); },
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Nhập lý do để khóa tài khoản này.</p>
      <textarea className="input" rows={3} placeholder="Lý do khóa..." value={reason}
        onChange={(e) => setReason(e.target.value)} style={{ resize: "none" }} />
      <button className="btn btn-danger" disabled={!reason.trim() || mut.isPending} onClick={() => mut.mutate()}>
        <Lock size={14} /> {mut.isPending ? "Đang khóa..." : "Khóa tài khoản"}
      </button>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["users", search, role, status, page],
    queryFn: () => api.get("/users", { params: { search, role, status, page, limit: 15 } }).then((r) => getData<any>(r)),
  });

  const users: any[] = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <div>
      <Header title="Quản lý Người dùng" subtitle="UC-03 — Tạo mới, khóa/mở khóa, chỉnh sửa tài khoản" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input className="input" placeholder="Tìm kiếm tên, email, SĐT..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 36 }} />
          </div>
          <select className="input" style={{ width: 160 }} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">Tất cả vai trò</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <select className="input" style={{ width: 160 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Tất cả trạng thái</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Tạo tài khoản
          </button>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Email / SĐT</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Đăng nhập lần cuối</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 16, width: "80%" }} /></td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Không tìm thấy người dùng</td></tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setEditingUser(u)}
                    style={{ cursor: "pointer" }}
                    title="Click để chỉnh sửa"
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 8,
                          background: `${ROLE_COLORS[u.role]}22`, border: `1.5px solid ${ROLE_COLORS[u.role]}44`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700, color: ROLE_COLORS[u.role], flexShrink: 0,
                        }}>
                          {getInitials(u.fullName)}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{u.fullName ?? "—"}</p>
                          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p style={{ fontSize: 13 }}>{u.email}</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.phone}</p>
                    </td>
                    <td>
                      <span className="badge" style={{ background: `${ROLE_COLORS[u.role]}18`, color: ROLE_COLORS[u.role], borderColor: `${ROLE_COLORS[u.role]}30` }}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(u.status)}`}>
                        {STATUS_LABELS[u.status] ?? u.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{u.lastLoginAt ? formatDate(u.lastLoginAt, "dd/MM/yyyy HH:mm") : "Chưa đăng nhập"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditingUser(u); }} title="Chỉnh sửa">
                          <Pencil size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 20 }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Trước</button>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Trang {page} / {meta.totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page === meta.totalPages} onClick={() => setPage((p) => p + 1)}>Sau →</button>
          </div>
        )}
      </div>

      {showCreate && <UserCreateForm onClose={() => setShowCreate(false)} onSuccess={() => qc.invalidateQueries({ queryKey: ["users"] })} />}
      {editingUser && <UserEditModal user={editingUser} onClose={() => setEditingUser(null)} />}
    </div>
  );
}
