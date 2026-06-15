"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, FileText, Search } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  getStatusBadgeClass,
  STATUS_LABELS,
} from "@/lib/utils";

export default function InvoiceTrackingPage() {
  const [status, setStatus] = useState("");
  const [archive, setArchive] = useState<"active" | "archived" | "all">("active");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-tracking", status, archive],
    queryFn: () =>
      api
        .get("/invoices", {
          params: {
            status: status || undefined,
            archive,
          },
        })
        .then((r) => getData<any[]>(r)),
  });

  const list = useMemo(() => {
    const source = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((invoice) => {
      const student = invoice.student;
      return [
        student?.profile?.fullName,
        student?.email,
        student?.phone,
        invoice.periodLabel,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [data, search]);

  return (
    <div>
      <Header title="Theo dõi hóa đơn" subtitle="Tiến độ thanh toán, chi tiết từng lớp và lưu trữ học sinh bị khóa" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", minWidth: 260, flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="input"
              placeholder="Tìm học sinh, email, kỳ hóa đơn..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
          {["", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"].map((s) => (
            <button key={s || "all"} className={`btn btn-sm ${status === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatus(s)}>
              {s ? STATUS_LABELS[s] ?? s : "Tất cả"}
            </button>
          ))}
          <select className="input" style={{ width: 170 }} value={archive} onChange={(e) => setArchive(e.target.value as any)}>
            <option value="active">Đang hoạt động</option>
            <option value="archived">Lưu trữ khóa</option>
            <option value="all">Tất cả</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 112 }} />)
          ) : list.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
              <FileText size={36} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
              Không có hóa đơn phù hợp
            </div>
          ) : (
            list.map((invoice) => {
              const total = Number(invoice.totalAmount) || 0;
              const paid = Number(invoice.paidAmount) || 0;
              const progress = total <= 0 ? 100 : Math.min(100, (paid / total) * 100);
              return (
                <div key={invoice.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                        {invoice.student?.profile?.fullName ?? "—"}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        {invoice.periodLabel} • {formatDate(invoice.periodStart, "dd/MM")} - {formatDate(invoice.periodEnd, "dd/MM/yyyy")}
                      </p>
                      {invoice.archivedAt && (
                        <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 4, display: "flex", gap: 4, alignItems: "center" }}>
                          <Archive size={12} /> Lưu trữ: {invoice.archiveReason}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className={`badge ${getStatusBadgeClass(invoice.status)}`}>
                        {STATUS_LABELS[invoice.status] ?? invoice.status}
                      </span>
                      <p style={{ fontSize: 18, fontWeight: 800, color: total < 0 ? "#10b981" : "#f43f5e", marginTop: 6 }}>
                        {formatCurrency(total)}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
                    {[
                      ["Học phí gốc", invoice.grossAmount],
                      ["Cọc đã trừ", invoice.depositApplied],
                      ["Đã thanh toán", invoice.paidAmount],
                      ["Còn lại", total - paid],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ background: "var(--bg-secondary)", borderRadius: 8, padding: "8px 10px" }}>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{label}</p>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", marginTop: 3 }}>{formatCurrency(Number(value) || 0)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="progress-bar" style={{ marginBottom: 12 }}>
                    <div className="progress-fill" style={{ width: `${progress}%`, background: progress >= 100 ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#6366f1,#a855f7)" }} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {(invoice.items ?? []).map((item: any) => (
                      <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{item.class?.name ?? item.description}</p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {item.sessions} buổi x {formatCurrency(item.unitPrice)} • cọc {formatCurrency(item.depositApplied ?? 0)}
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 800, color: item.isPaid ? "#10b981" : "#f59e0b", marginTop: 4 }}>
                          {item.isPaid ? "Đã xong" : "Cần thu"}: {formatCurrency(item.payableAmount ?? item.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
