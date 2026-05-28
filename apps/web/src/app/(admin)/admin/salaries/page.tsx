"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, CheckCircle, Edit3, X, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, formatDate, getInitials } from "@/lib/utils";

function CalcModal({ teachers, onClose }: { teachers: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    teacherId: teachers[0]?.id ?? "",
    periodLabel: `Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
  });
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: () => api.post("/salaries/calculate", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salaries"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Tính lương thất bại"),
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>🧮 Tính lương giáo viên</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="form-label">Giáo viên</label>
            <select className="input" value={form.teacherId} onChange={(e) => setForm(f => ({ ...f, teacherId: e.target.value }))}>
              {teachers.map((t: any) => <option key={t.id} value={t.id}>{t.profile?.fullName ?? t.username}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Nhãn kỳ lương</label>
            <input className="input" value={form.periodLabel} onChange={(e) => setForm(f => ({ ...f, periodLabel: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">Từ ngày</label>
              <input className="input" type="date" value={form.periodStart} onChange={(e) => setForm(f => ({ ...f, periodStart: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Đến ngày</label>
              <input className="input" type="date" value={form.periodEnd} onChange={(e) => setForm(f => ({ ...f, periodEnd: e.target.value }))} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang tính...</> : "Tính lương"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSalariesPage() {
  const qc = useQueryClient();
  const [showCalc, setShowCalc] = useState(false);
  const [expandId, setExpandId] = useState<string | null>(null);

  const { data: salaries, isLoading } = useQuery({
    queryKey: ["salaries"],
    queryFn: () => api.get("/salaries").then(r => getData<any[]>(r)),
  });
  const { data: teachersData } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: () => api.get("/users", { params: { role: "TEACHER", limit: 100 } }).then(r => getData<any>(r)),
  });

  const finalizeMut = useMutation({
    mutationFn: (id: string) => api.patch(`/salaries/${id}/finalize`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salaries"] }),
  });

  const teachers: any[] = teachersData?.data ?? [];
  const list: any[] = salaries ?? [];

  return (
    <div>
      <Header title="Tính lương Giáo viên" subtitle="UC-09 — Dựa trên doanh thu thực tế, cấn trừ tiền mặt đã thu" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <button className="btn btn-primary" onClick={() => setShowCalc(true)}>
            <Calculator size={16} /> Tính lương mới
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 16 }} />)
          ) : list.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
              <Calculator size={40} style={{ margin: "0 auto 12px", opacity: 0.3, display: "block" }} />
              <p>Chưa có bảng lương nào</p>
            </div>
          ) : list.map((s: any) => (
            <div key={s.id} className="card" style={{ cursor: "pointer" }} onClick={() => setExpandId(expandId === s.id ? null : s.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(16,185,129,0.15)", border: "1.5px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#10b981" }}>
                    {getInitials(s.teacher?.profile?.fullName)}
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{s.teacher?.profile?.fullName ?? "—"}</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.periodLabel}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{formatCurrency(s.netSalary)}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Lương thực nhận</p>
                  </div>
                  <span className={`badge ${s.status === "FINALIZED" ? "badge-success" : "badge-warn"}`}>
                    {s.status === "FINALIZED" ? "Đã chốt" : "Nháp"}
                  </span>
                  {s.status !== "FINALIZED" && (
                    <button className="btn btn-success btn-sm" onClick={(e) => { e.stopPropagation(); finalizeMut.mutate(s.id); }}>
                      <CheckCircle size={13} /> Chốt
                    </button>
                  )}
                </div>
              </div>

              {expandId === s.id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
                    {[
                      { label: "Doanh thu lớp", value: formatCurrency(s.totalRevenue), color: "#6366f1" },
                      { label: `Tỷ lệ lương (${s.salaryPercentage}%)`, value: formatCurrency(s.grossSalary), color: "#10b981" },
                      { label: "Tiền mặt đã thu", value: `- ${formatCurrency(s.cashDeduction)}`, color: "#f59e0b" },
                      { label: "Lương thực nhận", value: formatCurrency(s.netSalary), color: "#10b981" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 14px" }}>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color }}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Lớp</th><th>Số buổi</th><th>Doanh thu</th><th>Ghi chú</th></tr></thead>
                      <tbody>
                        {(s.items ?? []).map((item: any) => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.class?.name ?? "—"}</td>
                            <td>{item.sessionsTaught} buổi</td>
                            <td style={{ color: "#10b981", fontWeight: 600 }}>{formatCurrency(item.revenueAmount)}</td>
                            <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {showCalc && <CalcModal teachers={teachers} onClose={() => setShowCalc(false)} />}
    </div>
  );
}
