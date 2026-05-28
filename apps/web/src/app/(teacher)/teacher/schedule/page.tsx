"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, X, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

function AbsenceModal({ schedule, onClose }: { schedule: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => api.post("/schedules/report-absence", { scheduleId: schedule.id, reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-schedule"] }); onClose(); },
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>📢 Báo nghỉ ca dạy</h3>
        <div style={{ background: "var(--bg-secondary)", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{schedule.class?.name}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{DAY_LABELS[schedule.timeSlot?.dayOfWeek]} — {schedule.timeSlot?.startTime}–{schedule.timeSlot?.endTime} — {schedule.room?.name}</p>
        </div>
        <label className="form-label">Lý do nghỉ (bắt buộc)</label>
        <textarea className="input" rows={3} placeholder="Nhập lý do..." value={reason} onChange={(e) => setReason(e.target.value)} style={{ resize: "none" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-danger" style={{ flex: 1 }} disabled={!reason.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Đang gửi..." : "Gửi báo nghỉ"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeacherSchedulePage() {
  const [absenceSchedule, setAbsenceSchedule] = useState<any>(null);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["my-schedule"],
    queryFn: () => api.get("/schedules/my").then(r => getData<any[]>(r)),
  });

  const list: any[] = schedules ?? [];
  const byDay: Record<string, any[]> = {};
  for (const s of list) {
    const d = s.timeSlot?.dayOfWeek ?? "MON";
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(s);
  }

  const TYPE_COLORS: Record<string, string> = { REGULAR: "#6366f1", MAKEUP: "#10b981", CANCELLED: "#f43f5e" };
  const TYPE_LABELS: Record<string, string> = { REGULAR: "Lịch cố định", MAKEUP: "Học bù", CANCELLED: "Đã báo nghỉ" };

  return (
    <div>
      <Header title="Thời khóa biểu" subtitle="UC-13 — Xem lịch, báo nghỉ, đăng ký học bù" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Summary */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLORS[type] }} />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: TYPE_COLORS[type] }}>
                {list.filter(s => s.type === type).length}
              </span>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="skeleton" style={{ height: 300, borderRadius: 16 }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {["MON","TUE","WED","THU","FRI","SAT"].map(day => {
              const daySchedules = byDay[day] ?? [];
              if (!daySchedules.length) return null;
              return (
                <div key={day}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {DAY_LABELS[day]}
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {daySchedules.map((s: any) => {
                      const color = TYPE_COLORS[s.type] ?? "#9198c5";
                      return (
                        <div key={s.id} style={{ background: "var(--bg-card)", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{s.class?.name}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, background: `${color}18`, color, borderRadius: 4, padding: "2px 6px" }}>{TYPE_LABELS[s.type]}</span>
                            </div>
                            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              🕐 {s.timeSlot?.startTime}–{s.timeSlot?.endTime} · 🚪 {s.room?.name} · 📚 {s.class?.subject}
                            </p>
                          </div>
                          {s.type === "REGULAR" && (
                            <button className="btn btn-danger btn-sm" onClick={() => setAbsenceSchedule(s)}>
                              Báo nghỉ
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {list.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                <Calendar size={40} style={{ margin: "0 auto 12px", opacity: 0.3, display: "block" }} />
                <p>Chưa có lịch dạy nào</p>
              </div>
            )}
          </div>
        )}
      </div>
      {absenceSchedule && <AbsenceModal schedule={absenceSchedule} onClose={() => setAbsenceSchedule(null)} />}
    </div>
  );
}
