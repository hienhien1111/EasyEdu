"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  Clock,
  Loader2,
  ReceiptText,
  User,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  getStatusBadgeClass,
  STATUS_LABELS,
} from "@/lib/utils";

function PendingCashCard({ payment }: { payment: any }) {
  const qc = useQueryClient();
  const confirmMut = useMutation({
    mutationFn: () =>
      api.patch("/payments/cash/confirm", { paymentId: payment.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-cash-payments"] });
    },
  });

  const studentName =
    payment.invoice?.student?.profile?.fullName ??
    payment.invoice?.student?.username ??
    "Học sinh";

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <User size={16} color="#10b981" />
            <h3
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--text-primary)",
              }}
            >
              {studentName}
            </h3>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5 }}>
            {payment.invoice?.periodLabel} · {payment.invoiceItem?.class?.name}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {payment.invoiceItem?.description}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontSize: 20, fontWeight: 900, color: "#10b981" }}>
            {formatCurrency(payment.amount)}
          </p>
          <span className={`badge ${getStatusBadgeClass(payment.status)}`}>
            {STATUS_LABELS[payment.status] ?? payment.status}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={14} color="#f59e0b" />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Gửi lúc {formatDate(payment.createdAt, "HH:mm dd/MM/yyyy")}
          </span>
        </div>
        <button
          className="btn btn-success btn-sm"
          disabled={confirmMut.isPending}
          onClick={() => confirmMut.mutate()}
        >
          {confirmMut.isPending ? (
            <Loader2 size={13} className="animate-spin-slow" />
          ) : (
            <CheckCircle size={13} />
          )}
          Xác nhận đã nhận
        </button>
      </div>
    </div>
  );
}

export default function TeacherCashPaymentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-cash-payments"],
    queryFn: () =>
      api.get("/payments/cash/pending").then((r) => getData<any[]>(r)),
  });

  const payments = data ?? [];
  const totalAmount = payments.reduce(
    (sum: number, payment: any) => sum + payment.amount,
    0,
  );

  return (
    <div>
      <Header
        title="Duyệt tiền mặt"
        subtitle="Xác nhận các khoản học phí tiền mặt theo từng lớp"
      />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2,minmax(0,1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          <div className="card" style={{ padding: 16 }}>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                fontWeight: 800,
              }}
            >
              Chờ xác nhận
            </p>
            <p style={{ fontSize: 24, fontWeight: 900, color: "#f59e0b" }}>
              {payments.length}
            </p>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                fontWeight: 800,
              }}
            >
              Tổng tiền mặt
            </p>
            <p style={{ fontSize: 24, fontWeight: 900, color: "#10b981" }}>
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="skeleton"
                style={{ height: 130, borderRadius: 12 }}
              />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "54px 20px",
              color: "var(--text-muted)",
            }}
          >
            <ReceiptText
              size={42}
              style={{ display: "block", margin: "0 auto 12px", opacity: 0.35 }}
            />
            <p>Chưa có khoản tiền mặt nào cần xác nhận</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {payments.map((payment: any) => (
              <PendingCashCard key={payment.id} payment={payment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
