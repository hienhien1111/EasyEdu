"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit3, Trash2, X, Loader2, Package } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, getStatusBadgeClass } from "@/lib/utils";

const STATUSES = ["AVAILABLE", "IN_USE", "MAINTENANCE", "RETIRED"];
const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Sẵn sàng", IN_USE: "Đang dùng", MAINTENANCE: "Bảo trì", RETIRED: "Thanh lý",
};
const CATEGORIES = ["Máy tính", "Bảng trắng", "Máy chiếu", "Bàn ghế", "Sách giáo khoa", "Dụng cụ vệ sinh", "Khác"];

function InventoryForm({ item, onClose }: { item?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: item?.name ?? "",
    category: item?.category ?? CATEGORIES[0],
    quantity: item?.quantity ?? 1,
    unitPrice: item?.unitPrice ?? 0,
    status: item?.status ?? "AVAILABLE",
    description: item?.description ?? "",
  });
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: () => item ? api.patch(`/inventory/${item.id}`, form) : api.post("/inventory", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Thao tác thất bại"),
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{item ? "Cập nhật vật tư" : "Thêm vật tư mới"}</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Tên vật tư</label>
            <input className="input" placeholder="VD: Máy tính Dell..." value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Danh mục</label>
            <select className="input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Trạng thái</label>
            <select className="input" value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Số lượng</label>
            <input className="input" type="number" min={0} value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: +e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Đơn giá (VNĐ)</label>
            <input className="input" type="number" min={0} step={10000} value={form.unitPrice} onChange={(e) => setForm(f => ({ ...f, unitPrice: +e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Ghi chú</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={!form.name || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : item ? "Cập nhật" : "Thêm vật tư"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminInventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["inventory", categoryFilter],
    queryFn: () => api.get("/inventory", { params: { category: categoryFilter } }).then(r => getData<any[]>(r)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const STATUS_COLORS: Record<string, string> = {
    AVAILABLE: "#10b981", IN_USE: "#6366f1", MAINTENANCE: "#f59e0b", RETIRED: "#6270a8",
  };

  const items: any[] = (data ?? []).filter((i: any) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalValue = items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);

  return (
    <div>
      <Header title="Quản lý Vật tư" subtitle="UC-06 — Kiểm soát xuất/nhập, số lượng thiết bị cơ sở vật chất" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Tổng mặt hàng", value: String(items.length), color: "#6366f1" },
            { label: "Tổng tài sản", value: formatCurrency(totalValue), color: "#10b981" },
            { label: "Cần bảo trì", value: String(items.filter((i: any) => i.status === "MAINTENANCE").length), color: "#f59e0b" },
            { label: "Thanh lý", value: String(items.filter((i: any) => i.status === "RETIRED").length), color: "#6270a8" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
              <p style={{ fontSize: 20, fontWeight: 800, color, marginTop: 4 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input className="input" placeholder="Tìm tên vật tư..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
          </div>
          <select className="input" style={{ width: 160 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Tất cả danh mục</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus size={16} /> Thêm vật tư
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tên vật tư</th>
                <th>Danh mục</th>
                <th>Số lượng</th>
                <th>Đơn giá</th>
                <th>Tổng giá trị</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Không có vật tư nào</td></tr>
              ) : items.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{item.name}</p>
                    {item.description && <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.description}</p>}
                  </td>
                  <td><span className="badge badge-info">{item.category}</span></td>
                  <td style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 15 }}>{item.quantity}</td>
                  <td>{formatCurrency(item.unitPrice)}</td>
                  <td style={{ fontWeight: 600, color: "#10b981" }}>{formatCurrency(item.quantity * item.unitPrice)}</td>
                  <td>
                    <span className="badge" style={{ background: `${STATUS_COLORS[item.status]}18`, color: STATUS_COLORS[item.status], borderColor: `${STATUS_COLORS[item.status]}30` }}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(item); setShowForm(true); }}><Edit3 size={13} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => { if (confirm("Xóa vật tư?")) deleteMut.mutate(item.id); }}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && <InventoryForm item={editing ?? undefined} onClose={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}
