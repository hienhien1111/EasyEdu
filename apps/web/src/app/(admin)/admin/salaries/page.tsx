"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle,
  Copy,
  Edit3,
  Loader2,
  QrCode,
  RefreshCw,
  Send,
  WalletCards,
  X,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  getInitials,
  getStatusBadgeClass,
} from "@/lib/utils";

type TeacherProfile = {
  salaryQrCodeUrl?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
};

type Teacher = {
  id: string;
  email?: string | null;
  username?: string | null;
  profile?: { fullName?: string | null } | null;
  teacherProfile?: TeacherProfile | null;
};

type SalaryItem = {
  id: string;
  class?: { name?: string | null } | null;
  note?: string | null;
  primarySessionsTaught: number;
  extraSessionsTaught: number;
  presentCount: number;
  absentUnexcusedCount: number;
  revenueAmount: number;
  salaryAmount: number;
  cashCollected: number;
};

type Salary = {
  id: string;
  teacherId: string;
  teacher?: Teacher | null;
  periodLabel: string;
  periodStart: string | Date;
  periodEnd: string | Date;
  scheduledFinalizeAt?: string | Date | null;
  status: string;
  totalPrimarySessions: number;
  totalExtraSessions: number;
  totalPresentCount: number;
  totalAbsentUnexcusedCount: number;
  totalRevenue: number;
  salaryPercentage: number;
  grossSalary: number;
  cashDeduction: number;
  netSalary: number;
  manualAdjustment?: number | null;
  note?: string | null;
  items?: SalaryItem[];
};

type SalaryDashboard = {
  setting?: {
    monthlyFinalizeDay?: number | null;
    monthlyFinalizeTimeMinutes?: number | null;
  } | null;
  counts?: {
    drafts?: number;
    needsPayment?: number;
    paid?: number;
    activeTeachers?: number;
  };
};

type SalaryPrompt = {
  shouldPrompt?: boolean;
  setting?: SalaryDashboard["setting"];
};

type SyncDraftsResult = {
  count?: number;
};

type FinalizeAllResult = {
  finalizedCount?: number;
};

type ApiErrorShape = {
  response?: {
    data?: {
      message?: string | string[];
    };
  };
};

type SalaryModal = { type: "schedule"; salary: Salary } | null;

const DAY_MS = 24 * 60 * 60 * 1000;

const SALARY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  NEEDS_PAYMENT: "Cần thanh toán",
  PAID: "Đã thanh toán",
  FINALIZED: "Đã thanh toán",
};

const STATUS_FILTERS = [
  { value: "DRAFT", label: "Nháp" },
  { value: "NEEDS_PAYMENT", label: "Cần thanh toán" },
  { value: "PAID", label: "Đã thanh toán" },
  { value: "ALL", label: "Tất cả" },
] as const;

function getErrorMessage(error: unknown, fallback: string) {
  const message = (error as ApiErrorShape).response?.data?.message;
  if (Array.isArray(message)) return message.join(", ");
  return message || fallback;
}

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

function MonthlyFinalizeDateModal({
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
      await api.patch("/salaries/admin/monthly-setting", {
        scheduledFinalizeAt: date ? new Date(date).toISOString() : null,
      });
      if (promptMode) {
        await api.post("/salaries/admin/monthly-prompt/seen");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary-dashboard"] });
      qc.invalidateQueries({ queryKey: ["salaries"] });
      qc.invalidateQueries({ queryKey: ["salary-monthly-prompt"] });
      onClose();
    },
    onError: (e: unknown) => setErr(getErrorMessage(e, "Không thể lưu ngày chốt lương")),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          {promptMode ? "Chọn ngày chốt lương tháng mới" : "Chọn ngày chốt lương"}
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Chỉ chọn được ngày giờ trong tháng hiện tại và phải cách hiện tại ít nhất 24 giờ. Bỏ trống để chốt vào cuối tháng lúc 23:59.
        </p>
        {err && (
          <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, color: "#f43f5e", fontSize: 13 }}>
            {err}
          </div>
        )}
        <label className="form-label">Ngày giờ chốt trong tháng hiện tại</label>
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

function SalaryActionModal({ modal, onClose }: { modal: NonNullable<SalaryModal>; onClose: () => void }) {
  const qc = useQueryClient();
  const [minimumScheduleAt] = useState(() => toDateTimeLocal(new Date(Date.now() + DAY_MS)));
  const [date, setDate] = useState(
    modal.salary?.scheduledFinalizeAt ? toDateTimeLocal(modal.salary.scheduledFinalizeAt) : minimumScheduleAt,
  );
  const [err, setErr] = useState("");
  const scheduleMut = useMutation({
    mutationFn: () =>
      api.post("/salaries/admin/schedule-teacher", {
        teacherId: modal.salary.teacherId,
        scheduledFinalizeAt: new Date(date).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salaries"] });
      qc.invalidateQueries({ queryKey: ["salary-dashboard"] });
      onClose();
    },
    onError: (e: unknown) => setErr(getErrorMessage(e, "Không thể hẹn ngày chốt lương")),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Hẹn chốt lương riêng</h3>
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
          <strong>{modal.salary.teacher?.profile?.fullName ?? "Giáo viên"}</strong>
          <p style={{ color: "var(--text-muted)", marginTop: 4 }}>{modal.salary.periodLabel}</p>
        </div>
        <label className="form-label">Ngày giờ chốt lương</label>
        <input className="input" type="datetime-local" min={minimumScheduleAt} value={date} onChange={(e) => setDate(e.target.value)} />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={scheduleMut.isPending} onClick={() => scheduleMut.mutate()}>
            {scheduleMut.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FinalizeAllNowModal({ onClose, onFinalized }: { onClose: () => void; onFinalized: (message: string) => void }) {
  const qc = useQueryClient();
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: () => api.post("/salaries/admin/finalize-all-now"),
    onSuccess: (res) => {
      const result = getData<FinalizeAllResult>(res);
      qc.invalidateQueries({ queryKey: ["salaries"] });
      qc.invalidateQueries({ queryKey: ["salary-dashboard"] });
      onFinalized(`Đã chốt ${result.finalizedCount ?? 0} bảng lương và tạo nháp mới để tiếp tục ghi nhận.`);
      onClose();
    },
    onError: (e: unknown) => setErr(getErrorMessage(e, "Không thể chốt lương")),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Send size={18} color="#10b981" />
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Chốt tất cả lương hiện tại</h3>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
          Hệ thống sẽ chốt toàn bộ bảng lương nháp của giáo viên hiện đang có lớp, chuyển sang trạng thái cần thanh toán và tạo bảng nháp mới cho phần còn lại của kỳ.
        </p>
        {err && (
          <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, color: "#f43f5e", fontSize: 13 }}>
            {err}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-success" style={{ flex: 1 }} disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Đang chốt..." : "Chốt ngay"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditSalaryModal({ salary, onClose }: { salary: Salary; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    salaryPercentage: String(salary.salaryPercentage ?? 0),
    manualAdjustment: String(salary.manualAdjustment ?? 0),
    note: salary.note ?? "",
  });
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api.patch(`/salaries/${salary.id}`, {
        salaryPercentage: Number(form.salaryPercentage),
        manualAdjustment: Number(form.manualAdjustment),
        note: form.note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salaries"] });
      qc.invalidateQueries({ queryKey: ["salary-dashboard"] });
      onClose();
    },
    onError: (e: unknown) => setErr(getErrorMessage(e, "Cập nhật bảng lương thất bại")),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Chỉnh bảng lương</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, color: "#f43f5e", fontSize: 13 }}>{err}</div>}
        <label className="form-label">Hệ số lương (%)</label>
        <input className="input" type="number" min={0} max={100} value={form.salaryPercentage} onChange={(e) => setForm((f) => ({ ...f, salaryPercentage: e.target.value }))} />
        <label className="form-label" style={{ marginTop: 12 }}>Điều chỉnh thủ công</label>
        <input className="input" type="number" value={form.manualAdjustment} onChange={(e) => setForm((f) => ({ ...f, manualAdjustment: e.target.value }))} />
        <label className="form-label" style={{ marginTop: 12 }}>Ghi chú</label>
        <textarea className="input" rows={3} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} style={{ resize: "none" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SalaryPaymentModal({ salary, onClose }: { salary: Salary; onClose: () => void }) {
  const qc = useQueryClient();
  const profile = salary.teacher?.teacherProfile;
  const payMut = useMutation({
    mutationFn: () => api.patch(`/salaries/${salary.id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salaries"] });
      qc.invalidateQueries({ queryKey: ["salary-dashboard"] });
      onClose();
    },
  });
  const copyText = (value?: string | null) => {
    if (!value) return;
    void navigator.clipboard?.writeText(value);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Thanh toán lương</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {profile?.salaryQrCodeUrl ? (
            <img
              src={profile.salaryQrCodeUrl}
              alt="QR nhận lương"
              style={{
                width: 220,
                height: 220,
                objectFit: "contain",
                background: "white",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            />
          ) : (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 28, color: "var(--text-muted)" }}>
              Giáo viên chưa thêm ảnh QR nhận lương
            </div>
          )}
        </div>
        <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>{salary.teacher?.profile?.fullName ?? "—"}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{salary.periodLabel}</p>
          <p style={{ fontSize: 18, color: "#10b981", fontWeight: 900, marginTop: 8 }}>{formatCurrency(salary.netSalary)}</p>
        </div>
        {[
          { label: "Ngân hàng", value: profile?.bankName },
          { label: "Số tài khoản", value: profile?.bankAccountNumber },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {item.value || "—"}
              {item.value && (
                <button className="btn btn-ghost btn-sm" style={{ padding: 5 }} onClick={() => copyText(item.value)}>
                  <Copy size={12} />
                </button>
              )}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Đóng</button>
          <button className="btn btn-success" style={{ flex: 1 }} disabled={payMut.isPending} onClick={() => payMut.mutate()}>
            {payMut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang xác nhận...</> : "Xác nhận đã thanh toán"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSalariesPage() {
  const qc = useQueryClient();
  const [expandId, setExpandId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("DRAFT");
  const [editSalary, setEditSalary] = useState<Salary | null>(null);
  const [paymentSalary, setPaymentSalary] = useState<Salary | null>(null);
  const [modal, setModal] = useState<SalaryModal>(null);
  const [showSettingModal, setShowSettingModal] = useState(false);
  const [showFinalizeAllModal, setShowFinalizeAllModal] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const [notice, setNotice] = useState("");

  const { data: dashboard } = useQuery({
    queryKey: ["salary-dashboard"],
    queryFn: () => api.get("/salaries/admin/dashboard").then((r) => getData<SalaryDashboard>(r)),
  });
  const { data: prompt } = useQuery({
    queryKey: ["salary-monthly-prompt"],
    queryFn: () => api.get("/salaries/admin/monthly-prompt").then((r) => getData<SalaryPrompt>(r)),
  });
  const { data: salaries, isLoading } = useQuery({
    queryKey: ["salaries", statusFilter],
    queryFn: () =>
      api
        .get("/salaries", {
          params: { status: statusFilter === "ALL" ? undefined : statusFilter },
        })
        .then((r) => getData<Salary[]>(r)),
  });

  const issueMut = useMutation({
    mutationFn: (id: string) => api.patch(`/salaries/${id}/issue`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salaries"] });
      qc.invalidateQueries({ queryKey: ["salary-dashboard"] });
    },
  });

  const refreshMut = useMutation({
    mutationFn: async () => {
      await api.post("/salaries/admin/run-due");
      return api.post("/salaries/admin/sync-drafts");
    },
    onSuccess: (res) => {
      const result = getData<SyncDraftsResult>(res);
      qc.invalidateQueries({ queryKey: ["salaries"] });
      qc.invalidateQueries({ queryKey: ["salary-dashboard"] });
      qc.invalidateQueries({ queryKey: ["salary-monthly-prompt"] });
      setNotice(`Đã làm mới ${result.count ?? 0} bảng lương nháp.`);
    },
  });

  const counts = dashboard?.counts ?? {};
  const list: Salary[] = salaries ?? [];

  return (
    <div>
      <Header title="Tính lương Giáo viên" subtitle="Bảng lương nháp tự động, lịch chốt và thanh toán lương giáo viên" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
          {[
            ["Nháp", counts.drafts ?? 0, "#6366f1"],
            ["Cần thanh toán", counts.needsPayment ?? 0, "#f59e0b"],
            ["Đã thanh toán", counts.paid ?? 0, "#10b981"],
            ["Giáo viên có lớp", counts.activeTeachers ?? 0, "#06b6d4"],
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
            <label className="form-label">Ngày chốt tự động trong tháng</label>
            <p style={{ fontWeight: 800, color: "var(--text-primary)", minWidth: 150 }}>
              {getMonthlySettingLabel(
                dashboard?.setting?.monthlyFinalizeDay,
                dashboard?.setting?.monthlyFinalizeTimeMinutes,
              )}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowSettingModal(true)}>
            <CalendarClock size={14} /> Chọn ngày chốt
          </button>
          <button className="btn btn-ghost" disabled={refreshMut.isPending} onClick={() => refreshMut.mutate()}>
            {refreshMut.isPending ? <Loader2 size={14} className="animate-spin-slow" /> : <RefreshCw size={14} />}
            Làm mới
          </button>
          <button className="btn btn-success" onClick={() => setShowFinalizeAllModal(true)}>
            <Send size={14} /> Chốt lương tất cả giáo viên hiện tại
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
            Mặc định nếu không chọn: cuối tháng hiện tại
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={`btn btn-sm ${statusFilter === filter.value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 128, borderRadius: 12 }} />)
          ) : list.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
              <WalletCards size={40} style={{ margin: "0 auto 12px", opacity: 0.3, display: "block" }} />
              <p>Chưa có bảng lương nào</p>
            </div>
          ) : list.map((salary) => (
            <div key={salary.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <button
                  onClick={() => setExpandId(expandId === salary.id ? null : salary.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", flex: 1 }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(16,185,129,0.15)", border: "1.5px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#10b981" }}>
                    {getInitials(salary.teacher?.profile?.fullName ?? undefined)}
                  </div>
                  <div>
                    <p style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 14 }}>{salary.teacher?.profile?.fullName ?? "—"}</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{salary.periodLabel} • {formatDate(salary.periodStart, "dd/MM")} - {formatDate(salary.periodEnd, "dd/MM/yyyy")}</p>
                    {salary.scheduledFinalizeAt && salary.status === "DRAFT" && (
                      <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>Hẹn chốt: {formatDate(salary.scheduledFinalizeAt, "HH:mm dd/MM")}</p>
                    )}
                  </div>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 18, fontWeight: 900, color: salary.netSalary >= 0 ? "#10b981" : "#f43f5e" }}>{formatCurrency(salary.netSalary)}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Lương thực tế</p>
                  </div>
                  <span className={`badge ${getStatusBadgeClass(salary.status)}`}>
                    {SALARY_STATUS_LABELS[salary.status] ?? salary.status}
                  </span>
                  {salary.status !== "PAID" && salary.status !== "FINALIZED" && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSalary(salary)} title="Chỉnh hệ số lương">
                      <Edit3 size={13} />
                    </button>
                  )}
                  {salary.status === "DRAFT" && (
                    <button className="btn btn-ghost btn-sm" title="Hẹn riêng" onClick={() => setModal({ type: "schedule", salary })}>
                      <CalendarClock size={13} />
                    </button>
                  )}
                  {salary.status === "DRAFT" && (
                    <button className="btn btn-success btn-sm" disabled={issueMut.isPending} onClick={() => issueMut.mutate(salary.id)}>
                      <CheckCircle size={13} /> Chốt
                    </button>
                  )}
                  {salary.status === "NEEDS_PAYMENT" && (
                    <button className="btn btn-primary btn-sm" onClick={() => setPaymentSalary(salary)}>
                      <QrCode size={13} /> QR
                    </button>
                  )}
                </div>
              </div>

              {expandId === salary.id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
                    {[
                      { label: "Buổi dạy chính", value: `${salary.totalPrimarySessions} buổi`, color: "#6366f1" },
                      { label: "Buổi dạy mở rộng", value: `${salary.totalExtraSessions} buổi`, color: "#06b6d4" },
                      { label: "Có mặt / vắng KP", value: `${salary.totalPresentCount} / ${salary.totalAbsentUnexcusedCount}`, color: "#10b981" },
                      { label: "Hệ số lương", value: `${salary.salaryPercentage}%`, color: "#f59e0b" },
                      { label: "Doanh thu tính lương", value: formatCurrency(salary.totalRevenue), color: "#6366f1" },
                      { label: "Lương ban đầu", value: formatCurrency(salary.grossSalary), color: "#10b981" },
                      { label: "Tiền mặt đã thu", value: `- ${formatCurrency(salary.cashDeduction)}`, color: "#f59e0b" },
                      { label: "Lương thực tế", value: formatCurrency(salary.netSalary), color: salary.netSalary >= 0 ? "#10b981" : "#f43f5e" },
                    ].map((item) => (
                      <div key={item.label} style={{ background: "var(--bg-secondary)", borderRadius: 8, padding: "11px 12px", minWidth: 0 }}>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{item.label}</p>
                        <p style={{ fontSize: 14, fontWeight: 800, color: item.color }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Lớp</th>
                          <th>Buổi chính/mở rộng</th>
                          <th>Có mặt/vắng KP</th>
                          <th>Doanh thu</th>
                          <th>Lương lớp</th>
                          <th>Tiền mặt GV thu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(salary.items ?? []).map((item) => (
                          <tr key={item.id}>
                            <td>
                              <p style={{ fontWeight: 700, color: "var(--text-primary)" }}>{item.class?.name ?? "—"}</p>
                              <p style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.note}</p>
                            </td>
                            <td>{item.primarySessionsTaught}/{item.extraSessionsTaught}</td>
                            <td>{item.presentCount}/{item.absentUnexcusedCount}</td>
                            <td style={{ color: "#6366f1", fontWeight: 700 }}>{formatCurrency(item.revenueAmount)}</td>
                            <td style={{ color: "#10b981", fontWeight: 700 }}>{formatCurrency(item.salaryAmount)}</td>
                            <td style={{ color: "#f59e0b", fontWeight: 700 }}>{formatCurrency(item.cashCollected)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {salary.note && <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>{salary.note}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {modal && (
        <SalaryActionModal
          key={`${modal.type}-${modal.salary.id}`}
          modal={modal}
          onClose={() => setModal(null)}
        />
      )}
      {showSettingModal && (
        <MonthlyFinalizeDateModal
          settingDay={dashboard?.setting?.monthlyFinalizeDay}
          settingTimeMinutes={dashboard?.setting?.monthlyFinalizeTimeMinutes}
          onClose={() => setShowSettingModal(false)}
        />
      )}
      {showFinalizeAllModal && (
        <FinalizeAllNowModal
          onClose={() => setShowFinalizeAllModal(false)}
          onFinalized={(message) => setNotice(message)}
        />
      )}
      {prompt?.shouldPrompt && !dismissedPrompt && (
        <MonthlyFinalizeDateModal
          settingDay={prompt?.setting?.monthlyFinalizeDay}
          settingTimeMinutes={prompt?.setting?.monthlyFinalizeTimeMinutes}
          promptMode
          onClose={() => setDismissedPrompt(true)}
        />
      )}
      {editSalary && <EditSalaryModal salary={editSalary} onClose={() => setEditSalary(null)} />}
      {paymentSalary && <SalaryPaymentModal salary={paymentSalary} onClose={() => setPaymentSalary(null)} />}
    </div>
  );
}
