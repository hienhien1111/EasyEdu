"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  QrCode,
  FileText,
  CheckCircle,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Banknote,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  getStatusBadgeClass,
  STATUS_LABELS,
} from "@/lib/utils";

interface QRPaymentResult {
  qrCode: string; // Chuỗi EMVCo để render QR
  checkoutUrl: string; // Link PayOS để mở trực tiếp
  paymentLinkId: string;
  paymentId: string; // ID payment trong DB để check status
}

function QRModal({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(
    invoice.totalAmount - invoice.paidAmount,
  );
  const [result, setResult] = useState<QRPaymentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{
    type: "success" | "pending" | "error";
    text: string;
  } | null>(null);
  const [err, setErr] = useState("");
  const paymentId = result?.paymentId;
  const remaining = invoice.totalAmount - invoice.paidAmount;
  const isFinalTransfer = invoice.paymentCount >= invoice.maxPaymentTimes - 1;

  const handleGenQR = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await api.post("/payments/qr/initiate", {
        invoiceId: invoice.id,
        amount: isFinalTransfer ? remaining : amount,
      });
      const data = getData<any>(res);
      setResult({
        qrCode: data.qrCode,
        checkoutUrl: data.checkoutUrl,
        paymentLinkId: data.paymentLinkId,
        paymentId: data.paymentId,
      });
      queryClient.invalidateQueries({ queryKey: ["my-invoices"] });
    } catch (e: any) {
      setErr(e.response?.data?.message || "Tạo QR thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = useCallback(
    async (silent = false) => {
      if (!paymentId) return;
      if (!silent) setCheckMsg(null);
      try {
        const res = await api.get(`/payments/check-status/${paymentId}`);
        const data = getData<any>(res);
        if (data.status === "SUCCESS") {
          setCheckMsg({
            type: "success",
            text: data.message || "Thanh toán đã được xác nhận ✅",
          });
          // Refresh invoice list và receipts
          await queryClient.invalidateQueries({ queryKey: ["my-invoices"] });
          await queryClient.invalidateQueries({ queryKey: ["my-receipts"] });
          // Đóng modal sau 2 giây
          setTimeout(onClose, 2000);
        } else {
          if (!silent) {
            setCheckMsg({
              type: "pending",
              text:
                data.message || "Chưa ghi nhận thanh toán. Vui lòng thử lại.",
            });
          }
        }
      } catch (e: any) {
        if (!silent) {
          setCheckMsg({
            type: "error",
            text: e.response?.data?.message || "Lỗi kiểm tra trạng thái",
          });
        }
      }
    },
    [onClose, paymentId, queryClient],
  );

  useEffect(() => {
    if (!paymentId || checkMsg?.type === "success") return;
    const timer = window.setInterval(() => {
      void handleCheckStatus(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [checkMsg?.type, handleCheckStatus, paymentId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 460, textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 4,
          }}
        >
          🔳 Thanh toán QR - PayOS
        </h3>
        <p
          style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}
        >
          Hóa đơn: {invoice.periodLabel}
        </p>

        {err && (
          <div
            style={{
              background: "rgba(244,63,94,0.1)",
              border: "1px solid rgba(244,63,94,0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: "#f43f5e",
            }}
          >
            {err}
          </div>
        )}

        {!result ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ textAlign: "left" }}>
                Số tiền muốn nộp (tối đa {formatCurrency(remaining)})
              </label>
              <input
                className="input"
                type="number"
                min={1000}
                max={remaining}
                step={10000}
                value={isFinalTransfer ? remaining : amount}
                disabled={isFinalTransfer}
                onChange={(e) =>
                  setAmount(Math.min(+e.target.value, remaining))
                }
              />
              {isFinalTransfer && (
                <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>
                  Đây là lượt chuyển khoản cuối, hệ thống yêu cầu thanh toán toàn bộ phần còn lại.
                </p>
              )}
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Tạo mã QR chưa tính là một lượt thanh toán. Lượt chỉ được tính khi PayOS xác nhận thanh toán thành công.
              </p>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleGenQR}
              disabled={loading}
            >
              {loading ? "Đang tạo QR..." : "Tạo mã QR thanh toán"}
            </button>
          </>
        ) : (
          <>
            {/* QR Code thật từ chuỗi EMVCo */}
            <div
              style={{
                display: "inline-block",
                padding: 16,
                background: "#fff",
                borderRadius: 16,
                marginBottom: 16,
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              }}
            >
              <QRCodeSVG
                value={result.qrCode}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>

            <p
              style={{
                fontSize: 14,
                color: "#10b981",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              💰 {formatCurrency(isFinalTransfer ? remaining : amount)}
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 16,
              }}
            >
              Quét mã bằng app ngân hàng hoặc mở link PayOS bên dưới. Hệ thống
              sẽ tự cập nhật khi PayOS xác nhận thanh toán.
            </p>

            {/* Nút mở trang thanh toán PayOS */}
            <a
              href={result.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginBottom: 8,
                textDecoration: "none",
              }}
            >
              <ExternalLink size={14} /> Mở trang thanh toán PayOS
            </a>

            {/* Feedback sau khi check status */}
            {checkMsg && (
              <div
                style={{
                  background:
                    checkMsg.type === "success"
                      ? "rgba(16,185,129,0.12)"
                      : "rgba(245,158,11,0.12)",
                  border: `1px solid ${checkMsg.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 8,
                  fontSize: 13,
                  color: checkMsg.type === "success" ? "#10b981" : "#f59e0b",
                }}
              >
                {checkMsg.text}
              </div>
            )}

            <button
              className="btn btn-ghost"
              style={{ width: "100%" }}
              onClick={onClose}
            >
              Đóng
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function getCashPaymentForItem(item: any, status?: string) {
  return (item.payments ?? []).find(
    (payment: any) =>
      payment.method === "CASH" &&
      (!status || payment.status === status),
  );
}

function getItemPaymentState(item: any, invoice: any) {
  const pendingCash = getCashPaymentForItem(item, "PENDING");
  const successCash = getCashPaymentForItem(item, "SUCCESS");
  if (successCash) {
    return {
      label: "Đã thanh toán tiền mặt",
      color: "#10b981",
      badge: "badge-success",
      canRequestCash: false,
    };
  }
  if (pendingCash) {
    return {
      label: "Chờ giáo viên xác nhận",
      color: "#f59e0b",
      badge: "badge-warning",
      canRequestCash: false,
    };
  }
  if (item.isPaid) {
    return {
      label: "Đã thanh toán",
      color: "#10b981",
      badge: "badge-success",
      canRequestCash: false,
    };
  }
  if (invoice.paymentMode === "QR") {
    return {
      label: "Đang thanh toán chuyển khoản",
      color: "#6366f1",
      badge: "badge-info",
      canRequestCash: false,
    };
  }
  return {
    label: "Chưa thanh toán lớp này",
    color: "var(--text-muted)",
    badge: "",
    canRequestCash: true,
  };
}

export default function StudentPaymentsPage() {
  const [qrInvoice, setQrInvoice] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: () =>
      api.get("/invoices/my/invoices").then((r) => getData<any[]>(r)),
  });

  const { data: receipts } = useQuery({
    queryKey: ["my-receipts"],
    queryFn: () => api.get("/receipts/my").then((r) => getData<any[]>(r)),
  });

  const requestCheckMut = useMutation({
    mutationFn: (paymentId: string) => api.post(`/payments/${paymentId}/check-request`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-invoices"] }),
  });
  const requestMoreTurnsMut = useMutation({
    mutationFn: (invoiceId: string) =>
      api.post("/payments/limit-requests", {
        invoiceId,
        requestedExtraTimes: 1,
        reason: "Học sinh muốn chia nhỏ thêm lượt chuyển khoản",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-invoices"] }),
  });
  const cashMut = useMutation({
    mutationFn: (item: any) =>
      api.post("/payments/cash/initiate", {
        invoiceItemId: item.id,
        amount: item.payableAmount ?? item.amount,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-invoices"] }),
  });

  const list: any[] = invoices ?? [];
  const receiptList: any[] = receipts ?? [];
  const [tab, setTab] = useState<"invoices" | "receipts">("invoices");

  const totalDebt = list.reduce(
    (s, inv) => s + (inv.totalAmount - inv.paidAmount),
    0,
  );
  const totalPaid = list.reduce((s, inv) => s + inv.paidAmount, 0);

  return (
    <div>
      <Header
        title="Thanh toán học phí"
        subtitle="UC-16 — Xem hóa đơn, thanh toán QR, xem biên lai"
      />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        {/* Summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {[
            {
              label: "Tổng hóa đơn",
              value: String(list.length),
              color: "#6366f1",
            },
            {
              label: "Đã thanh toán",
              value: formatCurrency(totalPaid),
              color: "#10b981",
            },
            {
              label: "Còn nợ",
              value: formatCurrency(totalDebt),
              color: totalDebt > 0 ? "#f43f5e" : "#10b981",
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "16px 20px",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab-btn ${tab === "invoices" ? "active" : ""}`}
            onClick={() => setTab("invoices")}
          >
            <CreditCard
              size={14}
              style={{ display: "inline", marginRight: 6 }}
            />
            Hóa đơn ({list.length})
          </button>
          <button
            className={`tab-btn ${tab === "receipts" ? "active" : ""}`}
            onClick={() => setTab("receipts")}
          >
            <FileText size={14} style={{ display: "inline", marginRight: 6 }} />
            Biên lai ({receiptList.length})
          </button>
        </div>

        {tab === "invoices" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ height: 130, borderRadius: 16 }}
                />
              ))
            ) : list.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "50px 0",
                  color: "var(--text-muted)",
                }}
              >
                <CreditCard
                  size={40}
                  style={{
                    margin: "0 auto 12px",
                    opacity: 0.3,
                    display: "block",
                  }}
                />
                <p>Chưa có hóa đơn nào</p>
              </div>
            ) : (
              list.map((inv: any) => {
                const remaining = inv.totalAmount - inv.paidAmount;
                const pendingLimitRequest = (inv.paymentLimitRequests ?? []).some(
                  (request: any) => request.status === "PENDING",
                );
                const paidRate =
                  inv.totalAmount > 0
                    ? (inv.paidAmount / inv.totalAmount) * 100
                    : 100;
                return (
                  <div key={inv.id} className="card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: "var(--text-primary)",
                          }}
                        >
                          {inv.periodLabel}
                        </h3>
                        <p
                          style={{
                            fontSize: 12,
                            color: "var(--text-muted)",
                            marginTop: 2,
                          }}
                        >
                          {formatDate(inv.periodStart, "dd/MM")} —{" "}
                          {formatDate(inv.periodEnd, "dd/MM/yyyy")}
                        </p>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <span
                          className={`badge ${getStatusBadgeClass(inv.status)}`}
                        >
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                        {inv.isPaymentLocked ? (
                          <span className="badge badge-error">
                            🔒 Đã khóa lượt nộp
                          </span>
                        ) : remaining > 0 &&
                          inv.paymentMode !== "CASH" &&
                          inv.paymentCount >= inv.maxPaymentTimes ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={pendingLimitRequest || requestMoreTurnsMut.isPending}
                            onClick={() => requestMoreTurnsMut.mutate(inv.id)}
                          >
                            {pendingLimitRequest ? "Đang chờ thêm lượt" : "Xin thêm lượt"}
                          </button>
                        ) : remaining > 0 && inv.paymentMode !== "CASH" ? (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setQrInvoice(inv)}
                          >
                            <QrCode size={13} /> Thanh toán QR
                            {inv.maxPaymentTimes > 0 && (
                              <span
                                style={{
                                  fontSize: 10,
                                  opacity: 0.8,
                                  marginLeft: 4,
                                }}
                              >
                                ({inv.maxPaymentTimes - inv.paymentCount} lượt
                                thành công còn lại)
                              </span>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Progress */}
                    <div style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{ fontSize: 12, color: "var(--text-muted)" }}
                        >
                          Đã thanh toán
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#10b981",
                          }}
                        >
                          {formatCurrency(inv.paidAmount)} /{" "}
                          {formatCurrency(inv.totalAmount)}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${paidRate}%`,
                            background:
                              paidRate >= 100
                                ? "linear-gradient(90deg,#10b981,#34d399)"
                                : "linear-gradient(90deg,#6366f1,#a855f7)",
                          }}
                        />
                      </div>
                    </div>

                    {/* Items */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      {(inv.items ?? []).map((item: any) => {
                        const state = getItemPaymentState(item, inv);
                        const payableAmount = item.payableAmount ?? item.amount;
                        return (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              fontSize: 12,
                              color: "var(--text-muted)",
                              padding: "7px 0",
                              borderTop: "1px solid var(--border)",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <p
                                style={{
                                  color: "var(--text-secondary)",
                                  fontWeight: 700,
                                }}
                              >
                                {item.class?.name ?? item.description}
                              </p>
                              <p style={{ color: "var(--text-muted)", marginTop: 2 }}>
                                {item.description}
                              </p>
                              <span
                                className={`badge ${state.badge}`}
                                style={{ marginTop: 6, fontSize: 10 }}
                              >
                                {state.label}
                              </span>
                            </div>
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: state.color,
                                }}
                              >
                                {formatCurrency(payableAmount)}
                              </span>
                              {remaining > 0 &&
                                state.canRequestCash &&
                                payableAmount > 0 && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    disabled={cashMut.isPending}
                                    onClick={() => cashMut.mutate(item)}
                                    title="Báo trả tiền mặt toàn bộ lớp này"
                                  >
                                    <Banknote size={12} /> Tiền mặt
                                  </button>
                                )}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {(inv.payments ?? []).length > 0 && (
                      <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                          Lượt thanh toán
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(inv.payments ?? []).map((payment: any) => (
                            <div
                              key={payment.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 8,
                                background: "var(--bg-secondary)",
                                borderRadius: 8,
                                padding: "7px 9px",
                                fontSize: 12,
                              }}
                            >
                              <span>
                                {payment.method === "QR" ? "Chuyển khoản" : "Tiền mặt"} • {formatCurrency(payment.amount)}
                                {payment.invoiceItem?.class?.name && (
                                  <span style={{ color: "var(--text-muted)" }}> • {payment.invoiceItem.class.name}</span>
                                )}
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className={`badge ${getStatusBadgeClass(payment.status)}`} style={{ fontSize: 10 }}>
                                  {STATUS_LABELS[payment.status] ?? payment.status}
                                </span>
                                {payment.inquiry?.status && (
                                  <span className={`badge ${getStatusBadgeClass(payment.inquiry.status)}`} style={{ fontSize: 10 }}>
                                    {STATUS_LABELS[payment.inquiry.status] ?? payment.inquiry.status}
                                  </span>
                                )}
                                {payment.method === "QR" && payment.status === "PENDING" && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    disabled={
                                      payment.checkStatus === "REQUESTED" ||
                                      ["PENDING", "NEEDS_MANUAL_REVIEW"].includes(payment.inquiry?.status) ||
                                      requestCheckMut.isPending
                                    }
                                    onClick={() => requestCheckMut.mutate(payment.id)}
                                    title="Yêu cầu admin tra soát lượt thanh toán này"
                                  >
                                    <RefreshCw size={12} />
                                    {payment.checkStatus === "REQUESTED" || payment.inquiry?.status
                                      ? "Đang tra soát"
                                      : "Tra soát"}
                                  </button>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {remaining > 0 && (
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: "1px solid var(--border)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{ fontSize: 12, color: "var(--text-muted)" }}
                        >
                          Còn lại cần nộp:
                        </span>
                        <span
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color: "#f43f5e",
                          }}
                        >
                          {formatCurrency(remaining)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {receiptList.map((r: any) => (
              <div
                key={r.id}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "rgba(16,185,129,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CheckCircle size={18} color="#10b981" />
                  </div>
                  <div>
                    <p
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        fontSize: 13,
                      }}
                    >
                      Biên lai #{r.receiptNo}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {formatDate(r.issuedAt, "HH:mm dd/MM/yyyy")}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p
                    style={{ fontSize: 15, fontWeight: 700, color: "#10b981" }}
                  >
                    {formatCurrency(r.payment?.amount ?? 0)}
                  </p>
                  <span className="badge badge-info" style={{ fontSize: 10 }}>
                    {r.payment?.method === "QR" ? "QR" : "Tiền mặt"}
                  </span>
                </div>
              </div>
            ))}
            {receiptList.length === 0 && (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--text-muted)",
                  padding: "40px 0",
                }}
              >
                Chưa có biên lai nào
              </p>
            )}
          </div>
        )}
      </div>
      {qrInvoice && (
        <QRModal invoice={qrInvoice} onClose={() => setQrInvoice(null)} />
      )}
    </div>
  );
}
