"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Loader2, Trash2, Clock, Edit2, Check, AlertCircle, LayoutGrid, Table2,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

/* ─── Constants ────────────────────────────────────────────────── */
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
type Day = typeof DAYS[number];

const SUBJECT_COLORS: Record<string, string> = {
  "Toán": "#6366f1", "Văn": "#f43f5e", "Anh văn": "#10b981",
  "Vật lý": "#f59e0b", "Hóa học": "#22d3ee", "Sinh học": "#a855f7",
  "Tin học": "#fb923c", "Lịch sử": "#84cc16",
};
const getSubjectColor = (s: string) => SUBJECT_COLORS[s] ?? "#9198c5";

/* ─── Add Timeslot Modal ────────────────────────────────────────── */
function AddSlotModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ dayOfWeek: "MON", startTime: "08:00", endTime: "10:00", label: "" });
  const [err, setErr] = useState("");

  const mut = useMutation({
    mutationFn: () => api.post("/schedules/timeslots", {
      ...form,
      label: form.label || `${DAY_LABELS[form.dayOfWeek]} ${form.startTime}–${form.endTime}`,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-grid"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Lỗi khi thêm khung giờ"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Thêm khung giờ mới</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Áp dụng cho tất cả phòng trong ngày đó</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={15} /></button>
        </div>
        {err && <div style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}><AlertCircle size={14} />{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="form-label">Thứ trong tuần</label>
            <select className="input" value={form.dayOfWeek}
              onChange={(e) => setForm(f => ({ ...f, dayOfWeek: e.target.value }))}>
              {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">Giờ bắt đầu</label>
              <input className="input" type="time" value={form.startTime}
                onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Giờ kết thúc</label>
              <input className="input" type="time" value={form.endTime}
                onChange={(e) => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="form-label">Nhãn (tuỳ chọn)</label>
            <input className="input" value={form.label}
              onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder={`${DAY_LABELS[form.dayOfWeek]} ${form.startTime}–${form.endTime}`} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={mut.isPending}
            onClick={() => { if (form.startTime >= form.endTime) { setErr("Giờ bắt đầu phải nhỏ hơn kết thúc"); return; } setErr(""); mut.mutate(); }}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : <><Plus size={14} /> Thêm</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Edit Timeslot Inline ──────────────────────────────────────── */
function EditSlotInline({ slot, onDone, allSlots }: { slot: any; onDone: () => void; allSlots: any[] }) {
  const qc = useQueryClient();
  const [start, setStart] = useState(slot.startTime);
  const [end, setEnd] = useState(slot.endTime);
  const [err, setErr] = useState("");

  const delMut = useMutation({
    mutationFn: () => api.delete(`/schedules/timeslots/${slot.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-grid"] }); onDone(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Không thể xóa"),
  });
  const saveMut = useMutation({
    mutationFn: () => api.patch(`/schedules/timeslots/${slot.id}`, { startTime: start, endTime: end }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-grid"] }); onDone(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Lỗi cập nhật"),
  });

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
        <input type="time" value={start} onChange={e => setStart(e.target.value)}
          style={{ flex: 1, fontSize: 11, padding: "2px 4px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)" }} />
        <span style={{ color: "var(--text-muted)" }}>–</span>
        <input type="time" value={end} onChange={e => setEnd(e.target.value)}
          style={{ flex: 1, fontSize: 11, padding: "2px 4px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)" }} />
      </div>
      {err && <p style={{ fontSize: 10, color: "#f43f5e", marginBottom: 4 }}>{err}</p>}
      <div style={{ display: "flex", gap: 3 }}>
        <button className="btn btn-success btn-sm" style={{ flex: 1, padding: "3px 6px", fontSize: 10 }}
          onClick={() => { if (start >= end) { setErr("Giờ bắt đầu phải nhỏ hơn kết thúc"); return; } setErr(""); saveMut.mutate(); }}
          disabled={saveMut.isPending}><Check size={10} /></button>
        <button className="btn btn-danger btn-sm" style={{ flex: 1, padding: "3px 6px", fontSize: 10 }}
          onClick={() => { if (confirm("Xóa khung giờ? Lịch phân công sẽ bị xóa theo.")) delMut.mutate(); }}
          disabled={delMut.isPending}><Trash2 size={10} /></button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, padding: "3px 6px", fontSize: 10 }}
          onClick={onDone}><X size={10} /></button>
      </div>
    </div>
  );
}

/* ─── Assign Modal ──────────────────────────────────────────────── */
function AssignModal({ cell, rooms, classes, onClose }: any) {
  const qc = useQueryClient();
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [err, setErr] = useState("");
  const selectedClass = classes.find((c: any) => c.id === classId);

  const mut = useMutation({
    mutationFn: () => api.post("/schedules/assign", {
      classId, roomId: cell.roomId, timeSlotId: cell.timeSlotId,
      teacherId: selectedClass?.teacherId ?? "",
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-grid"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Xảy ra lỗi"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Phân công lịch học</h3>
            <p style={{ fontSize: 12, color: "var(--accent-secondary)", marginTop: 2 }}>
              {rooms.find((r: any) => r.id === cell.roomId)?.name} · {DAY_LABELS[cell.day]} · {cell.timeLabel}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={15} /></button>
        </div>
        {err && <div style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}><AlertCircle size={14} /> {err}</div>}
        {classes.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "16px 0" }}>Không có lớp học nào khả dụng.</p>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Chọn lớp học</label>
              <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.subject}</option>)}
              </select>
            </div>
            {selectedClass && (
              <div style={{ background: "rgba(99,102,241,0.07)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--text-secondary)" }}>
                Giáo viên: <strong style={{ color: "var(--text-primary)" }}>{selectedClass.teacherName ?? "—"}</strong>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={mut.isPending || !classId} onClick={() => mut.mutate()}>
                {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : "Phân công"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Overview Table ────────────────────────────────────────────── */
/**
 * Bảng tổng hợp: cột đầu = Thứ + khung giờ có lịch, cột tiếp = mỗi phòng.
 * Chỉ hiển thị các hàng (day-timeRange) có ít nhất 1 lịch học.
 */
function OverviewTable({
  allRooms, allTimeSlots, schedules, classes, onAssign, onDeleteSchedule,
}: {
  allRooms: any[];
  allTimeSlots: any[];
  schedules: any[];
  classes: any[];
  onAssign: (cell: any) => void;
  onDeleteSchedule: (id: string) => void;
}) {
  // Build schedule lookup: "roomId-timeSlotId" → schedule
  const scheduleMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of schedules) m[`${s.roomId}-${s.timeSlotId}`] = s;
    return m;
  }, [schedules]);

  // Map slot lookup
  const slotById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of allTimeSlots) m[s.id] = s;
    return m;
  }, [allTimeSlots]);

  // Build rows: each row = { day, startTime, endTime, slots: Record<roomId, slotId|null> }
  // Group by day → group by timeRange
  type Row = { day: Day; startTime: string; endTime: string; slotByRoom: Record<string, any> };

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];

    for (const day of DAYS) {
      const daySlots = allTimeSlots
        .filter(s => s.dayOfWeek === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      // unique time ranges for this day
      const timeRanges: Array<{ startTime: string; endTime: string }> = [];
      const seen = new Set<string>();
      for (const s of daySlots) {
        const k = `${s.startTime}-${s.endTime}`;
        if (!seen.has(k)) { seen.add(k); timeRanges.push({ startTime: s.startTime, endTime: s.endTime }); }
      }

      for (const tr of timeRanges) {
        // For each room: find slot matching this day+timeRange
        const slotByRoom: Record<string, any> = {};
        for (const room of allRooms) {
          const slot = daySlots.find(s => s.startTime === tr.startTime && s.endTime === tr.endTime);
          slotByRoom[room.id] = slot ?? null;
        }
        // Only include row if at least 1 schedule exists
        const hasSchedule = allRooms.some(room => {
          const slot = slotByRoom[room.id];
          return slot && scheduleMap[`${room.id}-${slot.id}`];
        });
        if (hasSchedule) {
          result.push({ day, startTime: tr.startTime, endTime: tr.endTime, slotByRoom });
        }
      }
    }
    return result;
  }, [allTimeSlots, allRooms, scheduleMap]);

  if (rows.length === 0) {
    return (
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
        <LayoutGrid size={36} style={{ margin: "0 auto 12px", opacity: 0.2, display: "block" }} />
        <p style={{ fontSize: 13 }}>Chưa có lịch học nào được phân công.</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Chọn một phòng cụ thể để thêm lịch.</p>
      </div>
    );
  }

  // Group rows by day for merged day cell display
  const dayGroups: Array<{ day: Day; rows: Row[]; startIdx: number }> = [];
  let currentDay: Day | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.day !== currentDay) {
      currentDay = row.day;
      dayGroups.push({ day: row.day, rows: [row], startIdx: i });
    } else {
      dayGroups[dayGroups.length - 1].rows.push(row);
    }
  }

  return (
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
              {allRooms.map(room => (
                <th key={room.id} style={{
                  padding: "10px 8px", textAlign: "center",
                  fontSize: 11, fontWeight: 700, color: "var(--accent-secondary)",
                  background: "rgba(19,22,41,0.7)", borderBottom: "1px solid var(--border)",
                  borderLeft: "1px solid rgba(37,42,69,0.5)",
                  whiteSpace: "nowrap",
                }}>
                  {room.name}
                  <span style={{ display: "block", fontSize: 9, color: "var(--text-muted)", fontWeight: 400, marginTop: 1 }}>{room.capacity} chỗ</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayGroups.map(({ day, rows: dayRows }) => (
              dayRows.map((row, ri) => (
                <tr key={`${day}-${row.startTime}`} style={{ borderBottom: "1px solid rgba(37,42,69,0.35)" }}>
                  {/* Day cell — only first row of each day group */}
                  {ri === 0 && (
                    <td
                      rowSpan={dayRows.length}
                      style={{
                        padding: "10px 14px",
                        verticalAlign: "top",
                        background: "rgba(13,15,26,0.35)",
                        borderRight: "1px solid rgba(37,42,69,0.5)",
                        borderBottom: "2px solid rgba(99,102,241,0.25)",
                      }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-secondary)", marginBottom: 6 }}>
                        {DAY_LABELS[day]}
                      </p>
                      {dayRows.map((r, rri) => (
                        <p key={rri} style={{
                          fontSize: 11, color: "var(--text-muted)", fontWeight: 500,
                          display: "flex", alignItems: "center", gap: 4, marginBottom: 2,
                        }}>
                          <Clock size={9} /> {r.startTime}–{r.endTime}
                        </p>
                      ))}
                    </td>
                  )}

                  {/* Room cells */}
                  {allRooms.map(room => {
                    const slot = row.slotByRoom[room.id];
                    const schedule = slot ? scheduleMap[`${room.id}-${slot.id}`] : null;
                    const color = schedule ? getSubjectColor(schedule.class?.subject) : null;

                    return (
                      <td key={room.id} style={{
                        padding: 5,
                        borderLeft: "1px solid rgba(37,42,69,0.5)",
                        verticalAlign: "top",
                        minWidth: 100,
                        height: 60,
                      }}>
                        {schedule ? (
                          <div style={{
                            height: "100%", minHeight: 52,
                            background: `${color}12`, border: `1px solid ${color}40`,
                            borderRadius: 8, padding: "4px 7px", position: "relative",
                          }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: color ?? undefined, lineHeight: 1.3 }}>
                              {schedule.class?.name}
                            </p>
                            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                              {schedule.class?.subject}
                            </p>
                            <button
                              className="btn btn-danger btn-sm"
                              style={{ position: "absolute", top: 3, right: 3, padding: "2px 3px", minHeight: "unset" }}
                              onClick={() => { if (confirm("Xóa lịch này?")) onDeleteSchedule(schedule.id); }}
                            ><Trash2 size={9} /></button>
                          </div>
                        ) : slot ? (
                          <button
                            onClick={() => onAssign({ roomId: room.id, timeSlotId: slot.id, day, timeLabel: `${row.startTime}–${row.endTime}` })}
                            style={{
                              width: "100%", height: "100%", minHeight: 52,
                              background: "transparent", border: "1px dashed transparent",
                              borderRadius: 8, cursor: "pointer", display: "flex",
                              alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                              color: "var(--text-muted)", opacity: 0.25,
                            }}
                            onMouseEnter={e => {
                              const el = e.currentTarget as HTMLButtonElement;
                              el.style.opacity = "1"; el.style.borderColor = "var(--accent-primary)";
                              el.style.background = "rgba(99,102,241,0.06)";
                            }}
                            onMouseLeave={e => {
                              const el = e.currentTarget as HTMLButtonElement;
                              el.style.opacity = "0.25"; el.style.borderColor = "transparent";
                              el.style.background = "transparent";
                            }}
                          ><Plus size={14} /></button>
                        ) : (
                          <div style={{ height: "100%", minHeight: 52, background: "rgba(13,15,26,0.15)", borderRadius: 8 }} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Room Table (individual) ───────────────────────────────────── */
function RoomTable({
  room, allTimeSlots, scheduleMap, classes, onAssign, onDeleteSchedule,
}: {
  room: any; allTimeSlots: any[]; scheduleMap: Record<string, any>;
  classes: any[]; onAssign: (cell: any) => void; onDeleteSchedule: (id: string) => void;
}) {
  const [editSlotId, setEditSlotId] = useState<string | null>(null);

  const timeRanges = useMemo(() => {
    const seen = new Set<string>();
    const ranges: Array<{ startTime: string; endTime: string }> = [];
    allTimeSlots.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)).forEach(s => {
      const key = `${s.startTime}-${s.endTime}`;
      if (!seen.has(key)) { seen.add(key); ranges.push({ startTime: s.startTime, endTime: s.endTime }); }
    });
    return ranges;
  }, [allTimeSlots]);

  const slotLookup = useMemo(() => {
    const m: Record<string, any> = {};
    allTimeSlots.forEach(s => { m[`${s.startTime}-${s.endTime}-${s.dayOfWeek}`] = s; });
    return m;
  }, [allTimeSlots]);

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "14px 18px", background: "rgba(99,102,241,0.07)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-primary)", boxShadow: "0 0 8px rgba(99,102,241,0.6)" }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{room.name}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 2 }}>· {room.capacity} chỗ</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ width: 112, padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border)", background: "rgba(19,22,41,0.6)" }}>Khung giờ</th>
              {DAYS.map(day => (
                <th key={day} style={{ padding: "10px 8px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--accent-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border)", borderLeft: "1px solid rgba(37,42,69,0.4)", background: "rgba(19,22,41,0.6)", whiteSpace: "nowrap" }}>
                  {DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeRanges.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)", fontSize: 13 }}>Chưa có khung giờ.</td></tr>
            ) : (
              timeRanges.map(({ startTime, endTime }) => (
                <tr key={`${startTime}-${endTime}`} style={{ borderBottom: "1px solid rgba(37,42,69,0.4)" }}>
                  <td style={{ padding: "8px 12px", verticalAlign: "middle", background: "rgba(13,15,26,0.3)", borderRight: "1px solid rgba(37,42,69,0.4)", minWidth: 112 }}>
                    {(() => {
                      const repSlot = allTimeSlots.find(s => s.startTime === startTime && s.endTime === endTime);
                      if (!repSlot) return null;
                      return editSlotId === `${startTime}-${endTime}` ? (
                        <EditSlotInline slot={repSlot} allSlots={allTimeSlots} onDone={() => setEditSlotId(null)} />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <Clock size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, flex: 1 }}>{startTime}–{endTime}</span>
                          <button className="btn btn-ghost btn-sm" style={{ padding: "2px 4px", opacity: 0.4 }}
                            onClick={() => setEditSlotId(`${startTime}-${endTime}`)} title="Sửa khung giờ"><Edit2 size={10} /></button>
                        </div>
                      );
                    })()}
                  </td>
                  {DAYS.map(day => {
                    const slot = slotLookup[`${startTime}-${endTime}-${day}`];
                    const schedule = slot ? scheduleMap[`${room.id}-${slot.id}`] : null;
                    const color = schedule ? getSubjectColor(schedule.class?.subject) : null;
                    return (
                      <td key={day} style={{ padding: 5, verticalAlign: "top", borderLeft: "1px solid rgba(37,42,69,0.4)", minWidth: 110, height: 70 }}>
                        {schedule ? (
                          <div style={{ height: "100%", minHeight: 60, background: `${color}12`, border: `1px solid ${color}40`, borderRadius: 8, padding: "5px 7px", position: "relative" }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: color ?? undefined, lineHeight: 1.3 }}>{schedule.class?.name}</p>
                            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{schedule.class?.subject}</p>
                            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>{schedule.creator?.profile?.fullName ?? "—"}</p>
                            <button className="btn btn-danger btn-sm" style={{ position: "absolute", top: 4, right: 4, padding: "2px 4px", minHeight: "unset" }}
                              onClick={() => { if (confirm("Xóa lịch này?")) onDeleteSchedule(schedule.id); }}><Trash2 size={9} /></button>
                          </div>
                        ) : slot ? (
                          <button onClick={() => onAssign({ roomId: room.id, timeSlotId: slot.id, day, timeLabel: `${startTime}–${endTime}` })}
                            style={{ width: "100%", height: "100%", minHeight: 60, background: "transparent", border: "1px dashed var(--border)", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", color: "var(--text-muted)", opacity: 0.4 }}
                            onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.opacity = "1"; el.style.borderColor = "var(--accent-primary)"; el.style.background = "rgba(99,102,241,0.06)"; }}
                            onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.opacity = "0.4"; el.style.borderColor = "var(--border)"; el.style.background = "transparent"; }}>
                            <Plus size={16} />
                          </button>
                        ) : (
                          <div style={{ height: "100%", minHeight: 60, background: "rgba(13,15,26,0.2)", borderRadius: 8 }} />
                        )}
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
  );
}

/* ─── Main Page ─────────────────────────────────────────────────── */
export default function AdminSchedulePage() {
  const qc = useQueryClient();
  const [assignCell, setAssignCell] = useState<any>(null);
  const [filterRoom, setFilterRoom] = useState<string | null>(null); // null = overview
  const [showAddSlot, setShowAddSlot] = useState(false);

  const { data: grid, isLoading } = useQuery({
    queryKey: ["schedule-grid"],
    queryFn: () => api.get("/schedules/grid").then(r => getData<any>(r)),
  });

  const { data: classesData } = useQuery({
    queryKey: ["classes-full"],
    queryFn: () => api.get("/classes", { params: { limit: 100 } }).then(r => getData<any>(r)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule-grid"] }),
  });

  const allRooms: any[] = grid?.rooms ?? [];
  const allTimeSlots: any[] = grid?.timeSlots ?? [];
  const schedules: any[] = grid?.schedules ?? [];
  const classes: any[] = classesData?.data ?? [];

  const selectedRoom = filterRoom ? allRooms.find(r => r.id === filterRoom) : null;

  const scheduleMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of schedules) m[`${s.roomId}-${s.timeSlotId}`] = s;
    return m;
  }, [schedules]);

  return (
    <div>
      <Header title="Thời khóa biểu" subtitle="UC-05 — Bảng tổng hợp + từng phòng" />
      <div style={{ padding: "20px 28px" }} className="animate-fadein">

        {/* Controls */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          {/* Room tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {/* Overview button */}
            <button
              className={`btn btn-sm ${!filterRoom ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilterRoom(null)}
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              <Table2 size={13} /> Tổng hợp
            </button>
            {allRooms.map((r: any) => (
              <button
                key={r.id}
                className={`btn btn-sm ${filterRoom === r.id ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilterRoom(filterRoom === r.id ? null : r.id)}
              >{r.name}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddSlot(true)}>
            <Clock size={13} /> Thêm khung giờ
          </button>
        </div>

        {/* Subject legend */}
        <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Môn:</span>
          {Object.entries(SUBJECT_COLORS).map(([subj, color]) => (
            <div key={subj} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{subj}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 180, borderRadius: 16 }} />)}
          </div>
        ) : !filterRoom ? (
          /* OVERVIEW — shown when no room is selected */
          <OverviewTable
            allRooms={allRooms}
            allTimeSlots={allTimeSlots}
            schedules={schedules}
            classes={classes}
            onAssign={setAssignCell}
            onDeleteSchedule={(id) => deleteMut.mutate(id)}
          />
        ) : selectedRoom ? (
          /* SINGLE ROOM TABLE */
          <RoomTable
            room={selectedRoom}
            allTimeSlots={allTimeSlots}
            scheduleMap={scheduleMap}
            classes={classes}
            onAssign={setAssignCell}
            onDeleteSchedule={(id) => deleteMut.mutate(id)}
          />
        ) : null}
      </div>

      {showAddSlot && <AddSlotModal onClose={() => setShowAddSlot(false)} />}
      {assignCell && (
        <AssignModal
          cell={assignCell}
          rooms={allRooms}
          classes={classes}
          onClose={() => setAssignCell(null)}
        />
      )}
    </div>
  );
}
