"use client";

import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, Users, BookOpen, DollarSign, AlertCircle,
  Clock, ArrowUpRight, ChevronRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState } from "react";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  trend,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  color: string;
  trend?: string;
}) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: `${color}18`,
            border: `1px solid ${color}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={20} color={color} />
        </div>
        {trend && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#10b981",
              background: "rgba(16,185,129,0.12)",
              padding: "3px 8px",
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <ArrowUpRight size={11} /> {trend}
          </span>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
          {label}
        </p>
        <p style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", marginTop: 4, lineHeight: 1 }}>
          {value}
        </p>
        {sub && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{sub}</p>
        )}
      </div>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  color: "var(--text-primary)",
  fontSize: 12,
};

export default function AdminDashboard() {
  const [debtorClass, setDebtorClass] = useState<any>(null);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then((r) => getData<any>(r)),
  });

  const { data: rankings } = useQuery({
    queryKey: ["class-rankings"],
    queryFn: () => api.get("/dashboard/class-rankings").then((r) => getData<any[]>(r)),
  });

  const { data: cashFlow } = useQuery({
    queryKey: ["cash-flow"],
    queryFn: () => api.get("/dashboard/cash-flow").then((r) => getData<any[]>(r)),
  });

  const { data: debtors } = useQuery({
    queryKey: ["debtors", debtorClass?.classId],
    queryFn: () =>
      api.get(`/dashboard/class/${debtorClass?.classId}/debtors`).then((r) => getData<any[]>(r)),
    enabled: !!debtorClass,
  });

  if (isLoading) {
    return (
      <div>
        <Header title="Dashboard" subtitle="Tổng quan hệ thống" />
        <div style={{ padding: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 110 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Dashboard" subtitle="Tổng quan dòng tiền & hoạt động" />

      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
          <StatCard
            icon={DollarSign}
            label="Tổng doanh thu"
            value={formatCurrency(dashboard?.totalRevenue ?? 0)}
            sub="Chỉ tính giao dịch thành công"
            color="#6366f1"
            trend="+12%"
          />
          <StatCard
            icon={BookOpen}
            label="Lớp đang hoạt động"
            value={String(dashboard?.totalClasses ?? 0)}
            sub={`${dashboard?.pendingEnrollments ?? 0} chờ duyệt`}
            color="#10b981"
          />
          <StatCard
            icon={Users}
            label="Học sinh"
            value={String(dashboard?.totalStudents ?? 0)}
            sub={`${dashboard?.totalTeachers ?? 0} giáo viên`}
            color="#f59e0b"
          />
          <StatCard
            icon={AlertCircle}
            label="Hóa đơn chờ thanh toán"
            value={String(dashboard?.pendingPayments ?? 0)}
            sub="Cần xử lý"
            color="#f43f5e"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
          {/* Cash flow chart */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                  Dòng tiền theo tháng
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  QR + Tiền mặt đã đối soát
                </p>
              </div>
              <TrendingUp size={18} color="var(--accent-primary)" />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cashFlow ?? []}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => [formatCurrency(v), ""]} />
                <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#colorTotal)" name="Tổng" />
                <Area type="monotone" dataKey="cash" stroke="#10b981" strokeWidth={2} fill="url(#colorCash)" name="Tiền mặt" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Recent payments */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>
              Giao dịch gần đây
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(dashboard?.recentPayments ?? []).slice(0, 6).map((p: any) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 10px",
                    background: "var(--bg-secondary)",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                      {p.invoice?.student?.profile?.fullName ?? "—"}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {p.method === "QR" ? "🔳 QR" : "💵 Tiền mặt"} • {formatDate(p.createdAt, "dd/MM")}
                    </p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
                    +{formatCurrency(p.amount)}
                  </span>
                </div>
              ))}
              {!dashboard?.recentPayments?.length && (
                <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                  Chưa có giao dịch
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Class rankings */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                Xếp hạng tỷ lệ thu tiền
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Click vào lớp để xem danh sách học sinh nợ tiền
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hạng</th>
                  <th>Lớp học</th>
                  <th>Giáo viên</th>
                  <th>Sĩ số</th>
                  <th>Đã thu</th>
                  <th>Tỷ lệ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(rankings ?? []).map((cls: any, i: number) => (
                  <tr
                    key={cls.classId}
                    onClick={() => setDebtorClass(cls)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: i < 3 ? "#f59e0b" : "var(--text-muted)",
                          fontSize: 14,
                        }}
                      >
                        #{i + 1}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {cls.className}
                      </span>
                      <br />
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cls.subject}</span>
                    </td>
                    <td>{cls.teacherName}</td>
                    <td>{cls.studentCount} hs</td>
                    <td style={{ color: "#10b981", fontWeight: 600 }}>
                      {formatCurrency(cls.totalPaid)}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="progress-bar" style={{ width: 80 }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${cls.paymentRate}%`,
                              background:
                                cls.paymentRate >= 80
                                  ? "linear-gradient(90deg,#10b981,#34d399)"
                                  : cls.paymentRate >= 50
                                  ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                                  : "linear-gradient(90deg,#f43f5e,#fb7185)",
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color:
                              cls.paymentRate >= 80
                                ? "#10b981"
                                : cls.paymentRate >= 50
                                ? "#f59e0b"
                                : "#f43f5e",
                          }}
                        >
                          {cls.paymentRate}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <ChevronRight size={14} color="var(--text-muted)" />
                    </td>
                  </tr>
                ))}
                {!rankings?.length && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                      Chưa có dữ liệu
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Debtors modal */}
      {debtorClass && (
        <div className="modal-overlay" onClick={() => setDebtorClass(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                  📋 Học sinh nợ tiền — {debtorClass.className}
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  GV: {debtorClass.teacherName}
                </p>
              </div>
              <button
                onClick={() => setDebtorClass(null)}
                className="btn btn-ghost btn-sm"
              >
                ✕
              </button>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {(debtors ?? []).map((d: any) => (
                <div
                  key={d.studentId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    background: "var(--bg-secondary)",
                    borderRadius: 10,
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {d.studentName}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      📞 {d.guardianPhone ?? d.phone}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#f43f5e" }}>
                      {formatCurrency(d.remaining)}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)" }}>còn nợ</p>
                  </div>
                </div>
              ))}
              {debtors?.length === 0 && (
                <p style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
                  🎉 Lớp này không có học sinh nợ tiền!
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
