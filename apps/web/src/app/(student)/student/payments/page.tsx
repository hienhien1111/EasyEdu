"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QrCode, FileText, CheckCircle, Clock, CreditCard } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, formatDate, getStatusBadgeClass, STATUS_LABELS } from "@/lib/utils";

function QRModal({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const [amount, setAmount] = useState(invoice.totalAmount - invoice.paidAmount);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleGenQR = async () => {
    setLoading(true); setErr("");
    try {
      const res = await api.post("/payments/qr/initiate", { invoiceId: invoice.id, amount });
      const { qrCode } = getData<any>(res);
      setQrUrl(qrCode);
    } catch (e: any) {
      setErr(e.response?.data?.message || "Tạo QR thất bại");
    } finally { setLoading(false); }
  };

  const remaining = invoice.totalAmount - invoice.paidAmount;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>🔳 Thanh toán QR</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Hóa đơn: {invoice.periodLabel}</p>

        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}>{err}</div>}

        {!qrUrl ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ textAlign: "left" }}>Số tiền muốn nộp (tối đa {formatCurrency(remaining)})</label>
              <input className="input" type="number" min={1} max={remaining} step={10000} value={amount}
                onChange={(e) => setAmount(Math.min(+e.target.value, remaining))} />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleGenQR} disabled={loading}>
              {loading ? "Đang tạo QR..." : "Tạo mã QR thanh toán"}
            </button>
          </>
        ) : (
          <>
            <div className="qr-container" style={{ margin: "0 auto 16px", display: "block" }}>
              <img src={qrUrl} alt="QR Code" style={{ width: 220, height: 220, objectFit: "contain" }} />
            </div>
            <p style={{ fontSize: 13, color: "#10b981", fontWeight: 600, marginBottom: 4 }}>
              Số tiền: {formatCurrency(amount)}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              Quét mã QR bằng app ngân hàng. Giao dịch sẽ tự động được ghi nhận.
            </p>
            <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onClose}>Đóng</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function StudentPaymentsPage() {
  const [qrInvoice, setQrInvoice] = useState<any>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: () => api.get("/invoices/my/invoices").then(r => getData<any[]>(r)),
  });

  const { data: receipts } = useQuery({
    queryKey: ["my-receipts"],
    queryFn: () => api.get("/receipts/my").then(r => getData<any[]>(r)),
  });

  const list: any[] = invoices ?? [];
  const receiptList: any[] = receipts ?? [];
  const [tab, setTab] = useState<"invoices" | "receipts">("invoices");

  const totalDebt = list.reduce((s, inv) => s + (inv.totalAmount - inv.paidAmount), 0);
  const totalPaid = list.reduce((s, inv) => s + inv.paidAmount, 0);

  return (
    <div>
      <Header title="Thanh toán học phí" subtitle="UC-16 — Xem hóa đơn, thanh toán QR, xem biên lai" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Tổng hóa đơn", value: String(list.length), color: "#6366f1" },
            { label: "Đã thanh toán", value: formatCurrency(totalPaid), color: "#10b981" },
            { label: "Còn nợ", value: formatCurrency(totalDebt), color: totalDebt > 0 ? "#f43f5e" : "#10b981" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab-btn ${tab === "invoices" ? "active" : ""}`} onClick={() => setTab("invoices")}>
            <CreditCard size={14} style={{ display: "inline", marginRight: 6 }} />Hóa đơn ({list.length})
          </button>
          <button className={`tab-btn ${tab === "receipts" ? "active" : ""}`} onClick={() => setTab("receipts")}>
            <FileText size={14} style={{ display: "inline", marginRight: 6 }} />Biên lai ({receiptList.length})
          </button>
        </div>

        {tab === "invoices" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {isLoading ? (
              [...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 130, borderRadius: 16 }} />)
            ) : list.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 0", color: "var(--text-muted)" }}>
                <CreditCard size={40} style={{ margin: "0 auto 12px", opacity: 0.3, display: "block" }} />
                <p>Chưa có hóa đơn nào</p>
              </div>
            ) : list.map((inv: any) => {
              const remaining = inv.totalAmount - inv.paidAmount;
              const paidRate = inv.totalAmount > 0 ? (inv.paidAmount / inv.totalAmount) * 100 : 100;
              return (
                <div key={inv.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{inv.periodLabel}</h3>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        {formatDate(inv.periodStart, "dd/MM")} — {formatDate(inv.periodEnd, "dd/MM/yyyy")}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`badge ${getStatusBadgeClass(inv.status)}`}>{STATUS_LABELS[inv.status] ?? inv.status}</span>
                      {remaining > 0 && !inv.isPaymentLocked && (
                        <button className="btn btn-primary btn-sm" onClick={() => setQrInvoice(inv)}>
                          <QrCode size={13} /> Thanh toán QR
                        </button>
                      )}
                      {inv.isPaymentLocked && (
                        <span className="badge badge-error">🔒 Đã khóa lượt nộp</span>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Đã thanh toán</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981" }}>{formatCurrency(inv.paidAmount)} / {formatCurrency(inv.totalAmount)}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${paidRate}%`, background: paidRate >= 100 ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#6366f1,#a855f7)" }} />
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {(inv.items ?? []).map((item: any) => (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", padding: "4px 0" }}>
                        <span>📚 {item.description}</span>
                        <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>

                  {remaining > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Còn lại cần nộp:</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: "#f43f5e" }}>{formatCurrency(remaining)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {receiptList.map((r: any) => (
              <div key={r.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle size={18} color="#10b981" />
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>Biên lai #{r.receiptNo}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDate(r.issuedAt, "HH:mm dd/MM/yyyy")}</p>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#10b981" }}>{formatCurrency(r.payment?.amount ?? 0)}</p>
                  <span className="badge badge-info" style={{ fontSize: 10 }}>{r.payment?.method === "QR" ? "QR" : "Tiền mặt"}</span>
                </div>
              </div>
            ))}
            {receiptList.length === 0 && (
              <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>Chưa có biên lai nào</p>
            )}
          </div>
        )}
      </div>
      {qrInvoice && <QRModal invoice={qrInvoice} onClose={() => setQrInvoice(null)} />}
    </div>
  );
}
