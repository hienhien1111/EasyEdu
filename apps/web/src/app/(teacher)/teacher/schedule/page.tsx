"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, Loader2, AlertCircle, Plus, RefreshCw,
  Clock, CalendarDays, ArrowRight, Check, RotateCcw, Trash2,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

/* ─── Constants ─────────────────────────────────────────────────── */
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
type Day = typeof DAYS[number];
const EMPTY_ARRAY: never[] = [];

const SUBJECT_COLORS: Record<string, string> = {
  "Toán": "#6366f1", "Văn": "#f43f5e", "Anh văn": "#10b981",
  "Vật lý": "#f59e0b", "Hóa học": "#22d3ee", "Sinh học": "#a855f7",
  "Tin học": "#fb923c", "Lịch sử": "#84cc16",
};
const getSubjectColor = (s: string) => SUBJECT_COLORS[s] ?? "#9198c5";

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const d = new Date(weekStart);
  const e = new Date(weekEnd);
  const fmt = (dt: Date) =>
    `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(d)} – ${fmt(e)}/${e.getFullYear()}`;
}

/* ─── Cell Action Drawer ─────────────────────────────────────────── */
// Hiện khi click vào ô lịch học của mình: các hành động
function CellActionDrawer({
  schedule, weekEnd, onClose, onSelectChange, onRevert,
}: {
  schedule: any;
  weekEnd: string;
  onClose: () => void;
  onSelectChange: () => void; // mở chế độ chọn ô đích
  onRevert: () => void;
}) {
  const weekEndFmt = new Date(weekEnd).toLocaleDateString("vi-VN");
  const subjectColor = getSubjectColor(schedule.class?.subject ?? "");
  const isOverridden = schedule.isOverridden;
  const isNewSession = schedule.isNewSession;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 380, padding: 0, overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          background: `${subjectColor}14`,
          borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: subjectColor }}>{schedule.class?.name}</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{schedule.class?.subject}</p>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} />
              {schedule.effectiveRoom?.name} · {schedule.effectiveTimeSlot?.label}
            </p>
            {isOverridden && (
              <p style={{ fontSize: 10, color: "#f59e0b", marginTop: 3 }}>
                ✏️ Đã đổi tuần này — Gốc: {schedule.originalRoom?.name} · {schedule.originalTimeSlot?.label}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 6 }}>
            <X size={15} />
          </button>
        </div>

        {/* Actions */}
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Đổi lịch — chỉ cho lịch REGULAR (không phải new session) */}
          {!isNewSession && (
            <button
              onClick={onSelectChange}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 14px", borderRadius: 10,
                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
                cursor: "pointer", textAlign: "left", width: "100%",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.08)"; }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RefreshCw size={14} color="#818cf8" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Đổi lịch tuần này</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>Chọn ô trống trên thời khóa biểu</p>
              </div>
              <ArrowRight size={14} color="var(--text-muted)" style={{ marginLeft: "auto" }} />
            </button>
          )}

          {/* Hoàn tác override */}
          {(isOverridden || isNewSession) && schedule.override?.id && (
            <button
              onClick={onRevert}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 14px", borderRadius: 10,
                background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)",
                cursor: "pointer", textAlign: "left", width: "100%",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(244,63,94,0.12)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(244,63,94,0.06)"; }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(244,63,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isNewSession ? <Trash2 size={14} color="#f87171" /> : <RotateCcw size={14} color="#f87171" />}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#f87171" }}>
                  {isNewSession ? "Xóa buổi học tự thêm" : "Hoàn tác về lịch gốc"}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                  {isNewSession ? "Xóa buổi học extra tuần này" : `Về ${schedule.originalRoom?.name} · ${schedule.originalTimeSlot?.label}`}
                </p>
              </div>
            </button>
          )}

          <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: "4px 0", marginTop: 2 }}>
            ⚡ Thay đổi chỉ áp dụng tuần này · Đến {weekEndFmt}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Confirm Override Modal ────────────────────────────────────── */
function ConfirmOverrideModal({
  schedule, targetCell, weekEnd, onClose, onConfirm, isPending, error,
}: {
  schedule: any;
  targetCell: { room: any; slot: any };
  weekEnd: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
  error: string;
}) {
  const [reason, setReason] = useState("");
  const weekEndFmt = new Date(weekEnd).toLocaleDateString("vi-VN");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
            Xác nhận đổi lịch
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
            <X size={15} />
          </button>
        </div>

        {/* Summary */}
        <div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
            {schedule.class?.name} — {schedule.class?.subject}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>Từ</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#f87171" }}>{schedule.effectiveRoom?.name}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{schedule.effectiveTimeSlot?.label}</p>
            </div>
            <ArrowRight size={16} color="var(--text-muted)" />
            <div style={{ flex: 1, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>Sang</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#10b981" }}>{targetCell.room.name}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{targetCell.slot.label}</p>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#f43f5e" }}>
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Lý do (tuỳ chọn)</label>
          <input
            className="input"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="VD: Phòng đang sửa chữa, đổi ca..."
            autoFocus
          />
        </div>

        <p style={{ fontSize: 11, color: "#f59e0b", marginBottom: 14 }}>
          ⚡ Chỉ áp dụng tuần này đến {weekEndFmt}. Tuần sau lịch tự về mặc định.
        </p>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button
            className="btn btn-primary"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            disabled={isPending}
            onClick={() => onConfirm(reason)}
          >
            {isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : <><Check size={14} /> Xác nhận đổi lịch</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Add Session Modal ──────────────────────────────────────────── */
function AddSessionModal({
  cell, myClasses, weekEnd, isLoadingClasses, onClose,
}: {
  cell: { roomId: string; timeSlotId: string; roomName: string; slotLabel: string };
  myClasses: any[]; weekEnd: string; isLoadingClasses: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [classId, setClassId] = useState(myClasses[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const weekEndFmt = new Date(weekEnd).toLocaleDateString("vi-VN");
  const selectedClassId = myClasses.some((c) => c.id === classId) ? classId : myClasses[0]?.id ?? "";

  const mut = useMutation({
    mutationFn: () => api.post("/schedules/weekly-session", {
      classId: selectedClassId, roomId: cell.roomId, timeSlotId: cell.timeSlotId, reason,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teacher-grid"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Lỗi khi thêm buổi học"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Thêm buổi học tuần này</h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>📍 {cell.roomName} · {cell.slotLabel}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}><X size={15} /></button>
        </div>

        {err && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#f43f5e" }}>
            <AlertCircle size={13} /> {err}
          </div>
        )}

        {isLoadingClasses ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: "var(--text-muted)", padding: "20px 0" }}>
            <Loader2 size={14} className="animate-spin-slow" /> Đang tải lớp của bạn...
          </div>
        ) : myClasses.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>Bạn chưa dạy lớp nào.</p>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Chọn lớp của bạn</label>
              <select className="input" value={selectedClassId} onChange={e => setClassId(e.target.value)}>
                {myClasses.map(c => <option key={c.id} value={c.id}>{c.name} · {c.subject}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Lý do (tuỳ chọn)</label>
              <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="VD: Học bù, học thêm..." />
            </div>
            <p style={{ fontSize: 11, color: "#f59e0b", marginBottom: 14 }}>
              ⚡ Buổi học này chỉ tồn tại tuần này đến {weekEndFmt}. Tuần sau sẽ tự xóa.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
              <button
                className="btn btn-primary" style={{ flex: 1 }}
                disabled={mut.isPending || !selectedClassId}
                onClick={() => { setErr(""); mut.mutate(); }}
              >
                {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : "Thêm buổi học"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Teacher Weekly Grid ────────────────────────────────────────── */
// selectMode = đang chọn ô đích để đổi lịch
function TeacherWeekGrid({
  teacherGrid,
  onCellClick,   // click ô có lịch của mình → mở action drawer
  onEmptyClick,  // click ô trống → thêm buổi học HOẶC chọn đích đổi lịch
  selectMode, selectSource, // khi đang trong chế độ chọn ô đích
}: {
  teacherGrid: any;
  onCellClick: (sch: any) => void;
  onEmptyClick: (cell: { roomId: string; timeSlotId: string; roomName: string; slotLabel: string; room: any; slot: any }) => void;
  selectMode: boolean;
  selectSource: any | null;
}) {
  const rooms: any[] = teacherGrid?.rooms ?? EMPTY_ARRAY;
  const timeSlots: any[] = teacherGrid?.timeSlots ?? EMPTY_ARRAY;
  const schedules: any[] = teacherGrid?.schedules ?? EMPTY_ARRAY;
  const weekStart: string = teacherGrid?.weekStart ?? "";
  const weekEnd: string = teacherGrid?.weekEnd ?? "";

  const cellMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of schedules) {
      const rId = s.effectiveRoomId ?? s.roomId;
      const tId = s.effectiveTimeSlotId ?? s.timeSlotId;
      m[`${rId}-${tId}`] = s;
    }
    return m;
  }, [schedules]);

  type Row = { day: Day; startTime: string; endTime: string; slotByRoom: Record<string, any> };

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    for (const day of DAYS) {
      const daySlots = timeSlots.filter(s => s.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const timeRanges: Array<{ startTime: string; endTime: string }> = [];
      const seen = new Set<string>();
      for (const s of daySlots) {
        const k = `${s.startTime}-${s.endTime}`;
        if (!seen.has(k)) { seen.add(k); timeRanges.push({ startTime: s.startTime, endTime: s.endTime }); }
      }
      for (const tr of timeRanges) {
        const slotByRoom: Record<string, any> = {};
        for (const room of rooms) {
          const slot = daySlots.find(s => s.startTime === tr.startTime && s.endTime === tr.endTime);
          slotByRoom[room.id] = slot ?? null;
        }
        result.push({ day, startTime: tr.startTime, endTime: tr.endTime, slotByRoom });
      }
    }
    return result;
  }, [timeSlots, rooms]);

  const dayGroups = useMemo(() => {
    const g: Array<{ day: Day; rows: Row[] }> = [];
    let currentDay: Day | null = null;
    for (const row of rows) {
      if (row.day !== currentDay) {
        currentDay = row.day;
        g.push({ day: row.day, rows: [row] });
      } else {
        g[g.length - 1].rows.push(row);
      }
    }
    return g;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
        <CalendarDays size={36} style={{ margin: "0 auto 12px", opacity: 0.2, display: "block" }} />
        <p style={{ fontSize: 13 }}>Chưa có khung giờ nào được tạo.</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Vui lòng liên hệ Admin để thiết lập thời khóa biểu.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Week header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 16px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <CalendarDays size={16} color="var(--accent-primary)" />
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
          Tuần: {weekStart && weekEnd ? formatWeekRange(weekStart, weekEnd) : "..."}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          — Từ Thứ 2 tuần sau, lịch về mặc định.
        </span>
      </div>

      {/* Select mode banner */}
      {selectMode && selectSource && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px", marginBottom: 14,
          background: "rgba(99,102,241,0.1)", border: "2px solid rgba(99,102,241,0.4)",
          borderRadius: 12, animation: "pulse 2s ease-in-out infinite",
        }}>
          <RefreshCw size={16} color="#818cf8" />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#818cf8" }}>Đang chọn ô đích để đổi lịch</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {selectSource.class?.name} · Hiện tại: {selectSource.effectiveRoom?.name} · {selectSource.effectiveTimeSlot?.label}
            </p>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Click vào ô trống (🟢) để chọn đích</p>
        </div>
      )}

      {/* Legend */}
      {!selectMode && (
        <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { color: "#6366f1", label: "Lịch của tôi" },
            { color: "#f59e0b", label: "Đã đổi tuần này" },
            { color: "#10b981", label: "Tự thêm tuần này" },
            { color: "#475569", label: "GV khác" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid table */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{
                  width: 140, padding: "10px 14px", textAlign: "left",
                  fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.5px",
                  background: "rgba(19,22,41,0.7)", borderBottom: "1px solid var(--border)",
                }}>Thứ / Khung giờ</th>
                {rooms.map(room => (
                  <th key={room.id} style={{
                    padding: "10px 8px", textAlign: "center",
                    fontSize: 11, fontWeight: 700, color: "var(--accent-secondary)",
                    background: "rgba(19,22,41,0.7)", borderBottom: "1px solid var(--border)",
                    borderLeft: "1px solid rgba(37,42,69,0.5)", whiteSpace: "nowrap",
                  }}>
                    {room.name}
                    <span style={{ display: "block", fontSize: 9, color: "var(--text-muted)", fontWeight: 400, marginTop: 1 }}>{room.capacity} chỗ</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayGroups.map(({ day, rows: dayRows }) =>
                dayRows.map((row, ri) => (
                  <tr key={`${day}-${row.startTime}`} style={{ borderBottom: "1px solid rgba(37,42,69,0.35)" }}>
                    {/* Merged day cell */}
                    {ri === 0 && (
                      <td rowSpan={dayRows.length} style={{
                        padding: "10px 14px", verticalAlign: "top",
                        background: "rgba(13,15,26,0.35)",
                        borderRight: "1px solid rgba(37,42,69,0.5)",
                        borderBottom: "2px solid rgba(99,102,241,0.25)",
                      }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-secondary)", marginBottom: 6 }}>{DAY_LABELS[day]}</p>
                        {dayRows.map((r, rri) => (
                          <p key={rri} style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                            <Clock size={9} /> {r.startTime}–{r.endTime}
                          </p>
                        ))}
                      </td>
                    )}

                    {/* Room cells */}
                    {rooms.map(room => {
                      const slot = row.slotByRoom[room.id];
                      const sch = slot ? cellMap[`${room.id}-${slot.id}`] : null;

                      if (!slot) {
                        return (
                          <td key={room.id} style={{ padding: 5, borderLeft: "1px solid rgba(37,42,69,0.5)", minWidth: 100, height: 60 }}>
                            <div style={{ height: "100%", minHeight: 52, background: "rgba(13,15,26,0.15)", borderRadius: 8 }} />
                          </td>
                        );
                      }

                      // Empty cell
                      if (!sch) {
                        const isSelectTarget = selectMode;
                        const canUseSlot = !slot.hasStarted;
                        return (
                          <td key={room.id} style={{ padding: 5, borderLeft: "1px solid rgba(37,42,69,0.5)", minWidth: 100, height: 60 }}>
                            <button
                              disabled={!canUseSlot}
                              onClick={() => canUseSlot && onEmptyClick({ roomId: room.id, timeSlotId: slot.id, roomName: room.name, slotLabel: slot.label, room, slot })}
                              style={{
                                width: "100%", height: "100%", minHeight: 52,
                                background: isSelectTarget ? "rgba(16,185,129,0.08)" : "transparent",
                                border: isSelectTarget ? "2px dashed #10b981" : "1px dashed transparent",
                                borderRadius: 8, cursor: canUseSlot ? "pointer" : "not-allowed", display: "flex",
                                alignItems: "center", justifyContent: "center",
                                color: !canUseSlot ? "var(--text-muted)" : isSelectTarget ? "#10b981" : "var(--text-muted)",
                                opacity: !canUseSlot ? 0.18 : isSelectTarget ? 1 : 0.25,
                                transition: "all 0.15s",
                                flexDirection: "column", gap: 3,
                              }}
                              onMouseEnter={e => {
                                if (!canUseSlot) return;
                                const el = e.currentTarget as HTMLButtonElement;
                                el.style.opacity = "1"; el.style.borderColor = "#10b981";
                                el.style.background = "rgba(16,185,129,0.08)";
                              }}
                              onMouseLeave={e => {
                                if (!canUseSlot) return;
                                const el = e.currentTarget as HTMLButtonElement;
                                if (!isSelectTarget) { el.style.opacity = "0.25"; el.style.borderColor = "transparent"; el.style.background = "transparent"; }
                              }}
                              title={!canUseSlot ? "Buổi học đã đến giờ bắt đầu" : isSelectTarget ? "Chọn ô này làm đích đổi lịch" : "Thêm buổi học tuần này"}
                            >
                              {!canUseSlot ? (
                                <span style={{ fontSize: 9, fontWeight: 600 }}>Đã đến giờ</span>
                              ) : isSelectTarget ? (
                                <>
                                  <Check size={14} />
                                  <span style={{ fontSize: 9, fontWeight: 600 }}>Chọn</span>
                                </>
                              ) : (
                                <Plus size={14} />
                              )}
                            </button>
                          </td>
                        );
                      }

                      // Cell with schedule
                      const isMine = sch.isMine;
                      const isOverridden = sch.isOverridden;
                      const isNewSession = sch.isNewSession;
                      const canEdit = sch.canEdit;
                      const subjectColor = getSubjectColor(sch.class?.subject ?? "");
                      const cellColor = !isMine ? "#475569" : isNewSession ? "#10b981" : isOverridden ? "#f59e0b" : subjectColor;

                      // Trong selectMode: ô có lịch = không chọn được → dim
                      const dimmed = selectMode && !isMine;

                      return (
                        <td key={room.id} style={{ padding: 5, borderLeft: "1px solid rgba(37,42,69,0.5)", minWidth: 100, height: 60, verticalAlign: "top" }}>
                          <div
                            onClick={() => !selectMode && canEdit ? onCellClick(sch) : undefined}
                            style={{
                              height: "100%", minHeight: 52,
                              background: `${cellColor}${isMine ? "14" : "08"}`,
                              border: `1px solid ${cellColor}${isMine ? "50" : "20"}`,
                              borderRadius: 8, padding: "4px 7px", position: "relative",
                              opacity: dimmed ? 0.3 : isMine ? 1 : 0.65,
                              cursor: canEdit && !selectMode ? "pointer" : "default",
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={e => {
                              if (canEdit && !selectMode) {
                                (e.currentTarget as HTMLDivElement).style.border = `1px solid ${cellColor}80`;
                                (e.currentTarget as HTMLDivElement).style.background = `${cellColor}22`;
                              }
                            }}
                            onMouseLeave={e => {
                              if (canEdit && !selectMode) {
                                (e.currentTarget as HTMLDivElement).style.border = `1px solid ${cellColor}50`;
                                (e.currentTarget as HTMLDivElement).style.background = `${cellColor}14`;
                              }
                            }}
                          >
                            <p style={{ fontSize: 11, fontWeight: 700, color: cellColor, lineHeight: 1.3 }}>{sch.class?.name}</p>
                            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{sch.class?.subject}</p>
                            {isOverridden && (
                              <div style={{ fontSize: 9, color: "#f59e0b", display: "flex", alignItems: "center", gap: 2, marginTop: 1 }}>
                                <RefreshCw size={7} /><span>Đã đổi</span>
                              </div>
                            )}
                            {isNewSession && (
                              <div style={{ fontSize: 9, color: "#10b981", display: "flex", alignItems: "center", gap: 2, marginTop: 1 }}>
                                <Plus size={7} /><span>Tự thêm</span>
                              </div>
                            )}
                            {/* Click hint icon */}
                            {canEdit && !selectMode && (
                              <div style={{ position: "absolute", top: 3, right: 4, opacity: 0.4, fontSize: 9, color: "var(--text-muted)" }}>
                                ···
                              </div>
                            )}
                            {isMine && !canEdit && (
                              <div style={{ position: "absolute", right: 4, bottom: 3, fontSize: 9, color: "var(--text-muted)" }}>
                                Đã đến giờ
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function TeacherSchedulePage() {
  const qc = useQueryClient();

  // State cho flow đổi lịch
  const [actionSchedule, setActionSchedule] = useState<any>(null); // ô đang click → drawer
  const [selectMode, setSelectMode] = useState(false);             // chế độ chọn ô đích
  const [selectSource, setSelectSource] = useState<any>(null);     // lịch đang muốn đổi
  const [targetCell, setTargetCell] = useState<any>(null);         // ô đích đã chọn
  const [confirmErr, setConfirmErr] = useState("");

  // State cho thêm buổi học
  const [addSessionCell, setAddSessionCell] = useState<any>(null);

  const { data: gridData, isLoading } = useQuery({
    queryKey: ["teacher-grid"],
    queryFn: () => api.get("/schedules/teacher-grid").then(r => getData<any>(r)),
    refetchInterval: 30000,
  });

  const { data: myClasses = [], isLoading: isClassesLoading } = useQuery({
    queryKey: ["my-classes"],
    queryFn: () => api.get("/classes/my/classes").then(r => getData<any[]>(r)),
  });

  const overrideMut = useMutation({
    mutationFn: ({ scheduleId, roomId, timeSlotId, reason }: any) =>
      api.post("/schedules/weekly-override", { scheduleId, roomId, timeSlotId, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-grid"] });
      cancelSelectMode();
    },
    onError: (e: any) => setConfirmErr(e.response?.data?.message || "Lỗi khi đổi lịch"),
  });

  const removeOverrideMut = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/weekly-override/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-grid"] }),
  });

  const mySchedules = (gridData?.schedules ?? []).filter((s: any) => s.isMine);
  const weekEnd: string = gridData?.weekEnd ?? "";

  // Stats
  const overridden = mySchedules.filter((s: any) => s.isOverridden).length;
  const newSessions = mySchedules.filter((s: any) => s.isNewSession).length;

  function cancelSelectMode() {
    setSelectMode(false);
    setSelectSource(null);
    setTargetCell(null);
    setConfirmErr("");
  }

  // Click ô có lịch của mình
  function handleCellClick(sch: any) {
    if (!sch?.canEdit) return;
    setActionSchedule(sch);
  }

  // Từ action drawer → chọn "Đổi lịch" → vào selectMode
  function handleStartSelectChange() {
    setSelectSource(actionSchedule);
    setActionSchedule(null);
    setSelectMode(true);
    setTargetCell(null);
    setConfirmErr("");
  }

  // Click ô trống
  function handleEmptyClick(cell: any) {
    if (cell.slot?.hasStarted) return;
    if (selectMode) {
      // Đang trong chế độ chọn đích → set targetCell → mở confirm modal
      setTargetCell(cell);
    } else {
      // Không trong selectMode → mở add session modal
      setAddSessionCell(cell);
    }
  }

  // Xác nhận đổi lịch
  function handleConfirmOverride(reason: string) {
    if (!selectSource || !targetCell) return;
    setConfirmErr("");
    overrideMut.mutate({
      scheduleId: selectSource.id,
      roomId: targetCell.roomId,
      timeSlotId: targetCell.timeSlotId,
      reason,
    });
  }

  // Hoàn tác từ action drawer
  function handleRevertFromDrawer() {
    const sch = actionSchedule;
    setActionSchedule(null);
    if (!sch?.override?.id) return;
    if (confirm(sch.isNewSession ? "Xóa buổi học tự thêm này?" : "Hoàn tác về lịch gốc?")) {
      removeOverrideMut.mutate(sch.override.id);
    }
  }

  return (
    <div>
      <Header title="Thời khóa biểu" subtitle="Grid tuần hiện tại — Thứ 2 đến Chủ nhật" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Stats + cancel button */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "Tổng lịch của tôi", value: mySchedules.length, color: "#6366f1" },
              { label: "Đã đổi tuần này", value: overridden, color: "#f59e0b" },
              { label: "Buổi tự thêm", value: newSessions, color: "#10b981" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>
          {/* Cancel select mode */}
          {selectMode && (
            <button
              className="btn btn-ghost"
              onClick={cancelSelectMode}
              style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(244,63,94,0.3)", color: "#f87171" }}
            >
              <X size={14} /> Hủy chọn ô
            </button>
          )}
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 16 }} />)}
          </div>
        ) : (
          <TeacherWeekGrid
            teacherGrid={gridData}
            onCellClick={handleCellClick}
            onEmptyClick={handleEmptyClick}
            selectMode={selectMode}
            selectSource={selectSource}
          />
        )}
      </div>

      {/* 1. Action Drawer — click ô của mình */}
      {actionSchedule && !selectMode && (
        <CellActionDrawer
          schedule={actionSchedule}
          weekEnd={weekEnd}
          onClose={() => setActionSchedule(null)}
          onSelectChange={handleStartSelectChange}
          onRevert={handleRevertFromDrawer}
        />
      )}

      {/* 2. Confirm Override — sau khi chọn ô đích */}
      {selectMode && targetCell && selectSource && (
        <ConfirmOverrideModal
          schedule={selectSource}
          targetCell={targetCell}
          weekEnd={weekEnd}
          onClose={() => { setTargetCell(null); setConfirmErr(""); }}
          onConfirm={handleConfirmOverride}
          isPending={overrideMut.isPending}
          error={confirmErr}
        />
      )}

      {/* 3. Add Session Modal — click ô trống khi không trong selectMode */}
      {addSessionCell && !selectMode && (
        <AddSessionModal
          cell={addSessionCell}
          myClasses={myClasses}
          weekEnd={weekEnd}
          isLoadingClasses={isClassesLoading}
          onClose={() => setAddSessionCell(null)}
        />
      )}
    </div>
  );
}
