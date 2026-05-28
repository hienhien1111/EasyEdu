"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle, XCircle, RefreshCw, Upload, X, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, formatDate, getStatusBadgeClass, STATUS_LABELS } from "@/lib/utils";

function ManualApproveModal({ payment, onClose }: { payment: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: () => api.patch("/payments/inquiries/manual-approve", { paymentId: payment.id, evidenceUrl, note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payments"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Thao tác thất bại"),
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>✅ Duyệt thủ công thanh toán</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Học sinh: <strong style={{ color: "var(--text-primary)" }}>{payment.invoice?.student?.profile?.fullName}</strong></p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Số tiền: <strong style={{ color: "#10b981" }}>{formatCurrency(payment.amount)}</strong></p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Phương thức: <strong style={{ color: "var(--text-primary)" }}>{payment.method === "QR" ? "🔳 QR" : "💵 Tiền mặt"}</strong></p>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="form-label">URL ảnh minh chứng (bắt buộc)</label>
            <input className="input" placeholder="https://..." value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Ghi chú</label>
            <textarea className="input" rows={2} placeholder="Ghi chú..." value={note} onChange={(e) => setNote(e.target.value)} style={{ resize: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-success" style={{ flex: 1 }} disabled={!evidenceUrl || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang duyệt...</> : "Duyệt thủ công"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [approvePayment, setApprovePayment] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payments", statusFilter, methodFilter],
    queryFn: () => api.get("/payments", { params: { status: statusFilter, method: methodFilter } }).then(r => getData<any[]>(r)),
  });

  const unlockMut = useMutation({
    mutationFn: (invoiceId: string) => api.patch(`/payments/unlock-limit/${invoiceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });

  const payments: any[] = data ?? [];

  return (
    <div>
      <Header title="Quản lý Thanh toán" subtitle="UC-07 — Theo dõi QR + Tiền mặt, mở khóa giới hạn nộp" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {["", "PENDING", "SUCCESS", "FAILED"].map(s => (
            <button key={s} className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStatusFilter(s)}>
              {s === "" ? "Tất cả" : STATUS_LABELS[s] ?? s}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {["", "QR", "CASH"].map(m => (
              <button key={m} className={`btn btn-sm ${methodFilter === m ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setMethodFilter(m)}>
                {m === "" ? "Tất cả" : m === "QR" ? "🔳 QR" : "💵 Tiền mặt"}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Học sinh</th>
                <th>Số tiền</th>
                <th>Phương thức</th>
                <th>Trạng thái</th>
                <th>Ngày GD</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>
                ))
              ) : payments.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Không có giao dịch</td></tr>
              ) : payments.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{p.invoice?.student?.profile?.fullName ?? "—"}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.invoice?.student?.email}</p>
                  </td>
                  <td style={{ fontWeight: 700, color: "#10b981" }}>{formatCurrency(p.amount)}</td>
                  <td>
                    <span className="badge badge-info">{p.method === "QR" ? "🔳 QR" : "💵 Tiền mặt"}</span>
                    {p.cashCollector?.profile?.fullName && (
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        Thu: {p.cashCollector.profile.fullName}
                      </p>
                    )}
                  </td>
                  <td><span className={`badge ${getStatusBadgeClass(p.status)}`}>{STATUS_LABELS[p.status] ?? p.status}</span></td>
                  <td style={{ fontSize: 12 }}>{formatDate(p.createdAt, "dd/MM/yyyy HH:mm")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {p.status === "PENDING" && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={() => setApprovePayment(p)} title="Duyệt thủ công">
                            <CheckCircle size={13} />
                          </button>
                        </>
                      )}
                      {p.invoice?.isPaymentLocked && (
                        <button className="btn btn-ghost btn-sm" title="Mở khóa lượt nộp"
                          onClick={() => unlockMut.mutate(p.invoiceId)}>
                          <RefreshCw size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {approvePayment && <ManualApproveModal payment={approvePayment} onClose={() => setApprovePayment(null)} />}
    </div>
  );
}
