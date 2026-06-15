"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  getStatusBadgeClass,
  STATUS_LABELS,
} from "@/lib/utils";

const INQUIRY_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ tra soát",
  NEEDS_MANUAL_REVIEW: "Cần xác minh",
  RESOLVED_AUTO: "PayOS xác nhận",
  RESOLVED_MANUAL: "Duyệt thủ công",
  NOT_RECEIVED: "Chưa nhận tiền",
  CLOSED: "Đã đóng",
};

const INQUIRY_REASON_LABELS: Record<string, string> = {
  STUDENT_REPORTED_MONEY_DEDUCTED: "HS báo đã trừ tiền",
  WEBHOOK_MISSED: "Webhook chưa về",
  PAYOS_PENDING: "PayOS chưa ghi nhận",
  PAYOS_CANCELLED: "PayOS đã hủy",
  GATEWAY_ERROR: "Lỗi cổng thanh toán",
  AMOUNT_MISMATCH: "Lệch số tiền",
  ADMIN_BANK_RECONCILIATION: "Đối soát tài khoản",
  OTHER: "Khác",
};

function ManualApproveModal({ payment, onClose }: { payment: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api.patch("/payments/inquiries/manual-approve", {
        paymentId: payment.id,
        evidenceUrl,
        note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      onClose();
    },
    onError: (e: any) => setErr(e.response?.data?.message || "Thao tác thất bại"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Duyệt thủ công thanh toán</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13 }}>
          <p>Học sinh: <strong>{payment.invoice?.student?.profile?.fullName ?? "—"}</strong></p>
          <p>Số tiền: <strong style={{ color: "#10b981" }}>{formatCurrency(payment.amount)}</strong></p>
          <p>Phương thức: <strong>{payment.method === "QR" ? "Chuyển khoản" : "Tiền mặt"}</strong></p>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, color: "#f43f5e", fontSize: 13 }}>{err}</div>}
        <label className="form-label">URL ảnh minh chứng</label>
        <input className="input" placeholder="https://..." value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
        <label className="form-label" style={{ marginTop: 12 }}>Ghi chú</label>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ resize: "none" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-success" style={{ flex: 1 }} disabled={!evidenceUrl || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang duyệt...</> : "Duyệt"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InquiryActionModal({
  payment,
  mode,
  onClose,
}: {
  payment: any;
  mode: "not-received" | "settlement";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const isNotReceived = mode === "not-received";
  const mut = useMutation({
    mutationFn: () =>
      isNotReceived
        ? api.patch("/payments/inquiries/not-received", {
            paymentId: payment.id,
            note,
          })
        : api.post("/payments/inquiries/settlement-exception", {
            paymentId: payment.id,
            note,
            severity: "HIGH",
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      onClose();
    },
    onError: (e: any) => setErr(e.response?.data?.message || "Thao tác thất bại"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
            {isNotReceived ? "Kết luận chưa nhận tiền" : "Mở hồ sơ đối soát"}
          </h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13 }}>
          <p>Học sinh: <strong>{payment.invoice?.student?.profile?.fullName ?? "—"}</strong></p>
          <p>Số tiền: <strong style={{ color: "#10b981" }}>{formatCurrency(payment.amount)}</strong></p>
          <p>Trạng thái: <strong>{STATUS_LABELS[payment.status] ?? payment.status}</strong></p>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, color: "#f43f5e", fontSize: 13 }}>{err}</div>}
        <label className="form-label">Ghi chú đối soát</label>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={{ resize: "none" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className={isNotReceived ? "btn btn-danger" : "btn btn-primary"} style={{ flex: 1 }} disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : isNotReceived ? "Chưa nhận tiền" : "Mở hồ sơ"}
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
  const [search, setSearch] = useState("");
  const [approvePayment, setApprovePayment] = useState<any>(null);
  const [notReceivedPayment, setNotReceivedPayment] = useState<any>(null);
  const [settlementPayment, setSettlementPayment] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payments", statusFilter, methodFilter],
    queryFn: () =>
      api
        .get("/payments", {
          params: { status: statusFilter || undefined, method: methodFilter || undefined },
        })
        .then((r) => getData<any[]>(r)),
  });
  const { data: inquiries } = useQuery({
    queryKey: ["inquiries"],
    queryFn: () => api.get("/payments/inquiries").then((r) => getData<any[]>(r)),
  });
  const { data: limitRequests } = useQuery({
    queryKey: ["payment-limit-requests"],
    queryFn: () => api.get("/payments/limit-requests").then((r) => getData<any[]>(r)),
  });

  const requeryMut = useMutation({
    mutationFn: (paymentId: string) => api.post("/payments/inquiries/requery", { paymentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["inquiries"] });
    },
  });
  const unlockMut = useMutation({
    mutationFn: (invoiceId: string) => api.patch(`/payments/unlock-limit/${invoiceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
  const reviewLimitMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      api.patch(`/payments/limit-requests/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-limit-requests"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  const payments: any[] = (data ?? []).filter((payment) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [
      payment.invoice?.student?.profile?.fullName,
      payment.invoice?.student?.email,
      payment.invoice?.periodLabel,
      payment.id,
      payment.bankTransactionId,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
  const pendingInquiries: any[] = inquiries ?? [];
  const pendingLimitRequests: any[] = (limitRequests ?? []).filter((request) => request.status === "PENDING");

  return (
    <div>
      <Header title="Thanh toán & Tra cứu" subtitle="Theo dõi lượt thanh toán, re-query PayOS và xử lý yêu cầu chia thêm lượt" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        {(pendingInquiries.length > 0 || pendingLimitRequests.length > 0) && (
          <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={18} color="#f59e0b" />
            <p style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>
              {pendingInquiries.length} lượt cần tra soát • {pendingLimitRequests.length} yêu cầu thêm lượt chuyển khoản
            </p>
          </div>
        )}

        {pendingLimitRequests.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", marginBottom: 12 }}>
              Yêu cầu thêm lượt chuyển khoản
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingLimitRequests.map((request) => (
                <div key={request.id} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{request.student?.profile?.fullName ?? "—"}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {request.invoice?.periodLabel} • xin thêm {request.requestedExtraTimes} lượt • {request.reason || "Không ghi lý do"}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-success btn-sm" disabled={reviewLimitMut.isPending} onClick={() => reviewLimitMut.mutate({ id: request.id, status: "APPROVED" })}>
                      <CheckCircle size={13} /> Duyệt
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={reviewLimitMut.isPending} onClick={() => reviewLimitMut.mutate({ id: request.id, status: "REJECTED" })}>
                      <XCircle size={13} /> Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", minWidth: 260, flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input className="input" placeholder="Tìm học sinh, hóa đơn, mã giao dịch..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
          </div>
          {["", "PENDING", "SUCCESS", "FAILED", "CANCELLED"].map((s) => (
            <button key={s || "all"} className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatusFilter(s)}>
              {s ? STATUS_LABELS[s] ?? s : "Tất cả"}
            </button>
          ))}
          <select className="input" style={{ width: 150 }} value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="">Mọi phương thức</option>
            <option value="QR">Chuyển khoản</option>
            <option value="CASH">Tiền mặt</option>
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Học sinh / hóa đơn</th>
                <th>Số tiền</th>
                <th>Phương thức</th>
                <th>Trạng thái</th>
                <th>Tra cứu</th>
                <th>Ngày GD</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((__, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>
                ))
              ) : payments.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Không có giao dịch</td></tr>
              ) : payments.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <p style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>{p.invoice?.student?.profile?.fullName ?? "—"}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.invoice?.periodLabel}</p>
                    {p.invoiceItem?.class?.name && <p style={{ fontSize: 10, color: "#06b6d4" }}>{p.invoiceItem.class.name}</p>}
                  </td>
                  <td style={{ fontWeight: 800, color: "#10b981" }}>{formatCurrency(p.amount)}</td>
                  <td><span className="badge badge-info">{p.method === "QR" ? "Chuyển khoản" : "Tiền mặt"}</span></td>
                  <td><span className={`badge ${getStatusBadgeClass(p.status)}`}>{STATUS_LABELS[p.status] ?? p.status}</span></td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(p.inquiry?.status ?? p.checkStatus ?? "NONE")}`} style={{ fontSize: 10 }}>
                      {p.inquiry?.status
                        ? INQUIRY_STATUS_LABELS[p.inquiry.status] ?? p.inquiry.status
                        : p.checkStatus === "REQUESTED"
                          ? "HS yêu cầu"
                          : STATUS_LABELS[p.checkStatus] ?? p.checkStatus ?? "NONE"}
                    </span>
                    {p.inquiry?.reason && (
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        {INQUIRY_REASON_LABELS[p.inquiry.reason] ?? p.inquiry.reason}
                      </p>
                    )}
                    {p.inquiry?.lastRequeryAt && (
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        {formatDate(p.inquiry.lastRequeryAt, "HH:mm dd/MM")}
                      </p>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(p.createdAt, "dd/MM/yyyy HH:mm")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {p.method === "QR" && (
                        <button className="btn btn-ghost btn-sm" title="Re-query PayOS" disabled={requeryMut.isPending} onClick={() => requeryMut.mutate(p.id)}>
                          <RefreshCw size={13} />
                        </button>
                      )}
                      {p.status === "PENDING" && (
                        <button className="btn btn-success btn-sm" onClick={() => setApprovePayment(p)} title="Duyệt thủ công">
                          <CheckCircle size={13} />
                        </button>
                      )}
                      {p.method === "QR" && p.status === "PENDING" && (
                        <button className="btn btn-danger btn-sm" onClick={() => setNotReceivedPayment(p)} title="Kết luận chưa nhận tiền">
                          <XCircle size={13} />
                        </button>
                      )}
                      {p.method === "QR" && p.status === "SUCCESS" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setSettlementPayment(p)} title="Mở hồ sơ đối soát tài khoản gốc">
                          <AlertTriangle size={13} />
                        </button>
                      )}
                      {p.invoice?.isPaymentLocked && (
                        <button className="btn btn-ghost btn-sm" title="Mở khóa lượt nộp" onClick={() => unlockMut.mutate(p.invoiceId)}>
                          Mở lượt
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
      {notReceivedPayment && (
        <InquiryActionModal
          payment={notReceivedPayment}
          mode="not-received"
          onClose={() => setNotReceivedPayment(null)}
        />
      )}
      {settlementPayment && (
        <InquiryActionModal
          payment={settlementPayment}
          mode="settlement"
          onClose={() => setSettlementPayment(null)}
        />
      )}
    </div>
  );
}
