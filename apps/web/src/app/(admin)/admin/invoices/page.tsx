"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle,
  Coins,
  KeyRound,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  getStatusBadgeClass,
  STATUS_LABELS,
} from "@/lib/utils";

type InvoiceModal = { type: "deposit" | "schedule"; invoice: any } | null;

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateTimeLocal(date?: string | Date) {
  const d = date ? new Date(date) : new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function getCurrentMonthBounds() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 0, 0);
  return {
    start: toDateTimeLocal(new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)),
    end: toDateTimeLocal(end),
    min: toDateTimeLocal(new Date(now.getTime() + DAY_MS)),
    defaultEnd: toDateTimeLocal(end),
  };
}

function getSettingDateTimeValue(day?: number | null, timeMinutes?: number | null) {
  if (!day) return "";
  const now = new Date();
  const maxDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (day > maxDay) return "";
  const minutes = timeMinutes ?? 23 * 60 + 59;
  const value = toDateTimeLocal(
    new Date(now.getFullYear(), now.getMonth(), day, Math.floor(minutes / 60), minutes % 60, 0, 0),
  );
  const bounds = getCurrentMonthBounds();
  return value >= bounds.min && value <= bounds.end ? value : "";
}

function getMonthlySettingLabel(day?: number | null, timeMinutes?: number | null) {
  if (!day) return "Cuối tháng lúc 23:59";
  const now = new Date();
  const maxDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const minutes = timeMinutes ?? 23 * 60 + 59;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} ngày ${Math.min(day, maxDay)}/${now.getMonth() + 1}`;
}

function MonthlyIssueDateModal({
  settingDay,
  settingTimeMinutes,
  promptMode = false,
  onClose,
}: {
  settingDay?: number | null;
  settingTimeMinutes?: number | null;
  promptMode?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const bounds = getCurrentMonthBounds();
  const hasSelectableDate = bounds.min <= bounds.end;
  const [date, setDate] = useState(getSettingDateTimeValue(settingDay, settingTimeMinutes));
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: async () => {
      await api.patch("/invoices/admin/monthly-setting", {
        scheduledIssueAt: date ? new Date(date).toISOString() : null,
      });
      if (promptMode) {
        await api.post("/invoices/admin/monthly-prompt/seen");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["monthly-prompt"] });
      onClose();
    },
    onError: (e: any) => setErr(e.response?.data?.message || "Không thể lưu ngày xuất"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          {promptMode ? "Chọn ngày xuất hóa đơn tháng mới" : "Chọn ngày xuất hóa đơn"}
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Chỉ chọn được ngày giờ trong tháng hiện tại và phải cách hiện tại ít nhất 24 giờ. Bỏ trống để xuất vào cuối tháng lúc 23:59.
        </p>
        {err && (
          <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, color: "#f43f5e", fontSize: 13 }}>
            {err}
          </div>
        )}
        <label className="form-label">Ngày giờ xuất trong tháng hiện tại</label>
        <input
          className="input"
          type="datetime-local"
          min={hasSelectableDate ? bounds.min : bounds.start}
          max={bounds.end}
          placeholder="Cuối tháng"
          value={date}
          disabled={!hasSelectableDate}
          onChange={(e) => setDate(e.target.value)}
        />
        {!hasSelectableDate && (
          <p style={{ fontSize: 12, color: "#f59e0b", marginTop: 8 }}>
            Tháng hiện tại không còn ngày nào cách hiện tại đủ 24 giờ. Bỏ trống để dùng mặc định cuối tháng.
          </p>
        )}
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setDate(bounds.defaultEnd)}>
          Dùng mặc định cuối tháng
        </button>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Để sau
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceActionModal({ modal, onClose }: { modal: NonNullable<InvoiceModal>; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(modal?.invoice?.depositApplied ?? 0));
  const [minimumScheduleAt] = useState(() => toDateTimeLocal(new Date(Date.now() + DAY_MS)));
  const [date, setDate] = useState(
    modal?.invoice?.scheduledIssueAt ? toDateTimeLocal(modal.invoice.scheduledIssueAt) : minimumScheduleAt,
  );
  const [err, setErr] = useState("");

  const depositMut = useMutation({
    mutationFn: () =>
      api.patch(`/invoices/${modal?.invoice.id}/deposit`, {
        amount: Number(amount),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      onClose();
    },
    onError: (e: any) => setErr(e.response?.data?.message || "Không thể cập nhật tiền cọc"),
  });

  const scheduleMut = useMutation({
    mutationFn: () =>
      api.post("/invoices/admin/schedule-student", {
        studentId: modal?.invoice.studentId,
        scheduledIssueAt: new Date(date).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      onClose();
    },
    onError: (e: any) => setErr(e.response?.data?.message || "Không thể hẹn ngày xuất"),
  });

  const isDeposit = modal.type === "deposit";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
            {isDeposit ? "Tiền cọc trừ vào hóa đơn" : "Hẹn xuất hóa đơn riêng"}
          </h3>
          <button className="btn btn-ghost btn-sm" style={{ padding: 6 }} onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        {err && (
          <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, color: "#f43f5e", fontSize: 13 }}>
            {err}
          </div>
        )}
        <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
          <strong>{modal.invoice.student?.profile?.fullName ?? "Học sinh"}</strong>
          <p style={{ color: "var(--text-muted)", marginTop: 4 }}>{modal.invoice.periodLabel}</p>
        </div>
        {isDeposit ? (
          <>
            <label className="form-label">Số tiền cọc áp dụng</label>
            <input className="input" type="number" min={0} step={10000} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
              Hóa đơn có thể âm nếu tiền cọc lớn hơn học phí.
            </p>
          </>
        ) : (
          <>
            <label className="form-label">Ngày giờ xuất hóa đơn</label>
            <input className="input" type="datetime-local" min={minimumScheduleAt} value={date} onChange={(e) => setDate(e.target.value)} />
          </>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={depositMut.isPending || scheduleMut.isPending}
            onClick={() => (isDeposit ? depositMut.mutate() : scheduleMut.mutate())}
          >
            {depositMut.isPending || scheduleMut.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssueAllNowModal({ onClose, onIssued }: { onClose: () => void; onIssued: (message: string) => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const mut = useMutation({
    mutationFn: () => api.post("/invoices/admin/issue-all-now", { password }),
    onSuccess: (res) => {
      const result = getData<any>(res);
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-dashboard"] });
      onIssued(
        `Đã xuất ${result.issuedCount ?? 0} hóa đơn. Bỏ qua ${result.skippedZeroAmountCount ?? 0} hóa đơn có số tiền cần thu bằng 0.`,
      );
      onClose();
    },
    onError: (e: any) => setErr(e.response?.data?.message || "Không thể xuất hóa đơn"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <KeyRound size={18} color="#f59e0b" />
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
            Xác nhận xuất tất cả hóa đơn
          </h3>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
          Hệ thống sẽ xuất ngay tất cả hóa đơn nháp, trừ các hóa đơn có số tiền cần thu bằng 0. Vui lòng nhập mật khẩu admin hiện tại để tiếp tục.
        </p>
        {err && (
          <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, color: "#f43f5e", fontSize: 13 }}>
            {err}
          </div>
        )}
        <label className="form-label">Mật khẩu admin</label>
        <input
          className="input"
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && password.trim()) mut.mutate();
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-success" style={{ flex: 1 }} disabled={mut.isPending || !password.trim()} onClick={() => mut.mutate()}>
            {mut.isPending ? "Đang xuất..." : "Xuất ngay"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminInvoicesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("DRAFT");
  const [modal, setModal] = useState<InvoiceModal>(null);
  const [showSettingModal, setShowSettingModal] = useState(false);
  const [showIssueAllModal, setShowIssueAllModal] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const [notice, setNotice] = useState("");

  const { data: dashboard } = useQuery({
    queryKey: ["invoice-dashboard"],
    queryFn: () => api.get("/invoices/admin/dashboard").then((r) => getData<any>(r)),
  });
  const { data: prompt } = useQuery({
    queryKey: ["monthly-prompt"],
    queryFn: () => api.get("/invoices/admin/monthly-prompt").then((r) => getData<any>(r)),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["admin-invoices", status],
    queryFn: () =>
      api
        .get("/invoices", { params: { status: status || undefined } })
        .then((r) => getData<any[]>(r)),
  });
  const issueMut = useMutation({
    mutationFn: (invoiceId: string) => api.patch(`/invoices/${invoiceId}/issue`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-dashboard"] });
    },
  });

  const invoices: any[] = data ?? [];
  const counts = dashboard?.counts ?? {};
  const refreshTab = () => {
    setNotice("");
    qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    qc.invalidateQueries({ queryKey: ["invoice-dashboard"] });
    qc.invalidateQueries({ queryKey: ["monthly-prompt"] });
  };

  return (
    <div>
      <Header title="Hóa đơn" subtitle="Bản nháp học phí tháng, tiền cọc và lịch xuất hóa đơn" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
          {[
            ["Nháp", counts.drafts ?? 0, "#6366f1"],
            ["Đang thanh toán", counts.issued ?? 0, "#f59e0b"],
            ["Đã thanh toán", counts.paid ?? 0, "#10b981"],
            ["Học sinh đang học", counts.activeStudents ?? 0, "#06b6d4"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="card" style={{ padding: 14 }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{label}</p>
              <p style={{ color: String(color), fontSize: 22, fontWeight: 800, marginTop: 4 }}>{String(value)}</p>
            </div>
          ))}
        </div>

        {notice && (
          <div style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13 }}>
            {notice}
          </div>
        )}

        <div className="card" style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label className="form-label">Ngày xuất tự động trong tháng</label>
            <p style={{ fontWeight: 800, color: "var(--text-primary)", minWidth: 150 }}>
              {getMonthlySettingLabel(
                dashboard?.setting?.monthlyIssueDay,
                dashboard?.setting?.monthlyIssueTimeMinutes,
              )}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowSettingModal(true)}>
            <CalendarClock size={14} /> Chọn ngày xuất
          </button>
          <button className="btn btn-ghost" onClick={refreshTab}>
            <RefreshCw size={14} /> Làm mới
          </button>
          <button className="btn btn-success" onClick={() => setShowIssueAllModal(true)}>
            <Send size={14} /> Xuất tất cả hóa đơn ngay bây giờ
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
            Mặc định nếu không chọn: cuối tháng hiện tại
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", ""].map((s) => (
            <button key={s || "all"} className={`btn btn-sm ${status === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatus(s)}>
              {s ? STATUS_LABELS[s] ?? s : "Tất cả"}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Học sinh</th>
                <th>Kỳ / lịch xuất</th>
                <th>Học phí</th>
                <th>Cọc</th>
                <th>Cần thu</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((__, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                    Chưa có hóa đơn
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <p style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>{inv.student?.profile?.fullName ?? "—"}</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{inv.student?.email}</p>
                    </td>
                    <td>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>{inv.periodLabel}</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {formatDate(inv.periodStart, "dd/MM")} - {formatDate(inv.periodEnd, "dd/MM/yyyy")}
                      </p>
                      {inv.scheduledIssueAt && (
                        <p style={{ fontSize: 11, color: "#f59e0b" }}>Hẹn: {formatDate(inv.scheduledIssueAt, "HH:mm dd/MM")}</p>
                      )}
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(inv.grossAmount ?? inv.totalAmount)}</td>
                    <td style={{ color: "#06b6d4", fontWeight: 700 }}>{formatCurrency(inv.depositApplied ?? 0)}</td>
                    <td style={{ color: inv.totalAmount < 0 ? "#10b981" : "#f43f5e", fontWeight: 800 }}>
                      {formatCurrency(inv.totalAmount)}
                    </td>
                    <td><span className={`badge ${getStatusBadgeClass(inv.status)}`}>{STATUS_LABELS[inv.status] ?? inv.status}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {inv.status !== "PAID" && (
                          <button className="btn btn-ghost btn-sm" title="Tiền cọc" onClick={() => setModal({ type: "deposit", invoice: inv })}>
                            <Coins size={13} />
                          </button>
                        )}
                        {inv.status === "DRAFT" && (
                          <button className="btn btn-ghost btn-sm" title="Hẹn riêng" onClick={() => setModal({ type: "schedule", invoice: inv })}>
                            <CalendarClock size={13} />
                          </button>
                        )}
                        {inv.status === "DRAFT" && (
                          <button
                            className="btn btn-success btn-sm"
                            title={inv.totalAmount === 0 ? "Hóa đơn 0 đồng không thể xuất" : "Xuất ngay"}
                            disabled={issueMut.isPending || inv.totalAmount === 0}
                            onClick={() => issueMut.mutate(inv.id)}
                          >
                            <CheckCircle size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <InvoiceActionModal
          key={`${modal.type}-${modal.invoice.id}`}
          modal={modal}
          onClose={() => setModal(null)}
        />
      )}
      {showSettingModal && (
        <MonthlyIssueDateModal
          settingDay={dashboard?.setting?.monthlyIssueDay}
          settingTimeMinutes={dashboard?.setting?.monthlyIssueTimeMinutes}
          onClose={() => setShowSettingModal(false)}
        />
      )}
      {showIssueAllModal && (
        <IssueAllNowModal
          onClose={() => setShowIssueAllModal(false)}
          onIssued={(message) => setNotice(message)}
        />
      )}
      {prompt?.shouldPrompt && !dismissedPrompt && (
        <MonthlyIssueDateModal
          settingDay={prompt?.setting?.monthlyIssueDay}
          settingTimeMinutes={prompt?.setting?.monthlyIssueTimeMinutes}
          promptMode
          onClose={() => setDismissedPrompt(true)}
        />
      )}
    </div>
  );
}
