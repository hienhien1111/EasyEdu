"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState } from "react";

export default function PaymentInquiriesPage() {
  const qc = useQueryClient();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const { data: inquiries, isLoading } = useQuery({
    queryKey: ["inquiries"],
    queryFn: () => api.get("/payments/inquiries").then(r => getData<any[]>(r)),
  });

  const requeryMut = useMutation({
    mutationFn: (paymentId: string) => api.post("/payments/inquiries/requery", { paymentId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inquiries"] }),
  });

  const approveMut = useMutation({
    mutationFn: ({ paymentId, evidenceUrl }: any) =>
      api.patch("/payments/inquiries/manual-approve", { paymentId, evidenceUrl }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inquiries"] }); setApprovingId(null); setEvidenceUrl(""); },
  });

  const list: any[] = inquiries ?? [];

  return (
    <div>
      <Header title="Tra soát Thanh toán" subtitle="UC-08 — Re-query API ngân hàng hoặc duyệt thủ công bằng ảnh Bill" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Alert banner */}
        {list.length > 0 && (
          <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={18} color="#f59e0b" />
            <p style={{ fontSize: 13, color: "#f59e0b", fontWeight: 600 }}>
              Có {list.length} giao dịch cần tra soát
            </p>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Học sinh</th>
                <th>Số tiền</th>
                <th>Phương thức</th>
                <th>Ngày giao dịch</th>
                <th>Re-query lần</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>
                ))
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                    <CheckCircle size={40} color="var(--text-muted)" style={{ margin: "0 auto 12px", opacity: 0.3, display: "block" }} />
                    Không có giao dịch cần tra soát
                  </td>
                </tr>
              ) : list.map((inq: any) => {
                const p = inq.payment;
                return (
                  <tr key={inq.id}>
                    <td>
                      <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                        {p?.invoice?.student?.profile?.fullName ?? "—"}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{p?.invoice?.student?.email}</p>
                    </td>
                    <td style={{ fontWeight: 700, color: "#f43f5e" }}>{formatCurrency(p?.amount ?? 0)}</td>
                    <td><span className="badge badge-info">{p?.method === "QR" ? "🔳 QR" : "💵 Tiền mặt"}</span></td>
                    <td style={{ fontSize: 12 }}>{formatDate(p?.createdAt, "dd/MM/yyyy HH:mm")}</td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 700, color: inq.requeryCount > 2 ? "#f43f5e" : "var(--text-primary)" }}>
                        {inq.requeryCount ?? 0} lần
                      </span>
                      {inq.lastRequeryAt && (
                        <p style={{ fontSize: 10, color: "var(--text-muted)" }}>Lần cuối: {formatDate(inq.lastRequeryAt, "HH:mm dd/MM")}</p>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Re-query API ngân hàng"
                          disabled={requeryMut.isPending}
                          onClick={() => requeryMut.mutate(p.id)}
                        >
                          <RefreshCw size={13} />
                        </button>

                        {/* Inline approve */}
                        {approvingId === inq.id ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              className="input"
                              placeholder="URL ảnh bill..."
                              value={evidenceUrl}
                              onChange={(e) => setEvidenceUrl(e.target.value)}
                              style={{ width: 200, padding: "5px 10px", fontSize: 12 }}
                            />
                            <button
                              className="btn btn-success btn-sm"
                              disabled={!evidenceUrl || approveMut.isPending}
                              onClick={() => approveMut.mutate({ paymentId: p.id, evidenceUrl })}
                            >
                              {approveMut.isPending ? <Loader2 size={12} className="animate-spin-slow" /> : "✓"}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setApprovingId(null)}>✕</button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            title="Duyệt thủ công"
                            onClick={() => setApprovingId(inq.id)}
                          >
                            <CheckCircle size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
