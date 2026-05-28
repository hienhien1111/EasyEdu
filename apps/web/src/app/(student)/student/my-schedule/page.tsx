"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, MapPin, BookOpen, Calendar } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

export default function StudentSchedulePage() {
  const { data: schedules, isLoading } = useQuery({
    queryKey: ["student-schedule"],
    queryFn: () => api.get("/schedules/student/upcoming").then(r => getData<any[]>(r)),
  });

  const { data: history } = useQuery({
    queryKey: ["attendance-history"],
    queryFn: () => api.get("/attendance/my-history").then(r => getData<any[]>(r)),
  });

  const list: any[] = schedules ?? [];
  const hist: any[] = history ?? [];

  const SUBJECT_COLORS: Record<string, string> = {
    "Toán": "#6366f1", "Văn": "#f43f5e", "Anh văn": "#10b981",
    "Vật lý": "#f59e0b", "Hóa học": "#22d3ee", "Sinh học": "#a855f7",
  };

  const ATTEND_COLORS: Record<string, string> = {
    PRESENT: "#10b981", ABSENT_EXCUSED: "#f59e0b", ABSENT_UNEXCUSED: "#f43f5e", MAKEUP: "#6366f1",
  };
  const ATTEND_LABELS: Record<string, string> = {
    PRESENT: "Có mặt", ABSENT_EXCUSED: "Vắng phép", ABSENT_UNEXCUSED: "Vắng KP", MAKEUP: "Học bù",
  };

  const presentCount = hist.filter(a => a.status === "PRESENT").length;
  const absentCount = hist.filter(a => ["ABSENT_EXCUSED", "ABSENT_UNEXCUSED"].includes(a.status)).length;
  const attendRate = hist.length > 0 ? Math.round((presentCount / hist.length) * 100) : 100;

  return (
    <div>
      <Header title="Lịch học của tôi" subtitle="UC-15 — Xem lịch sắp tới & lịch sử điểm danh" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Attendance stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Tỷ lệ điểm danh</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: attendRate >= 80 ? "#10b981" : "#f43f5e", marginTop: 4 }}>{attendRate}%</p>
            <div className="progress-bar" style={{ marginTop: 8 }}>
              <div className="progress-fill" style={{ width: `${attendRate}%`, background: attendRate >= 80 ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#f43f5e,#fb7185)" }} />
            </div>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Tổng buổi học</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>{hist.length}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Có mặt</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#10b981", marginTop: 4 }}>{presentCount}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Vắng mặt</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#f43f5e", marginTop: 4 }}>{absentCount}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20 }}>
          {/* Upcoming schedule */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              📅 Lịch sắp tới
            </h2>
            {isLoading ? (
              [...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 8 }} />)
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {list.slice(0, 10).map((s: any) => {
                  const color = SUBJECT_COLORS[s.class?.subject] ?? "#6366f1";
                  return (
                    <div key={s.id} style={{ background: "var(--bg-card)", border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: "14px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <p style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14, marginBottom: 4 }}>{s.class?.name}</p>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                              <Calendar size={11} /> {DAY_LABELS[s.timeSlot?.dayOfWeek]}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                              <Clock size={11} /> {s.timeSlot?.startTime}–{s.timeSlot?.endTime}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                              <MapPin size={11} /> {s.room?.name}
                            </span>
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, background: `${color}18`, color, borderRadius: 6, padding: "2px 8px" }}>
                          {s.class?.subject}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                    <Calendar size={36} style={{ margin: "0 auto 10px", opacity: 0.3, display: "block" }} />
                    <p>Không có lịch học sắp tới</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attendance history */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              📋 Lịch sử điểm danh gần đây
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hist.slice(0, 10).map((a: any) => {
                const color = ATTEND_COLORS[a.status] ?? "#9198c5";
                return (
                  <div key={a.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{a.schedule?.class?.name ?? "—"}</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {DAY_LABELS[a.schedule?.timeSlot?.dayOfWeek]} — {a.schedule?.timeSlot?.startTime}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}30`, borderRadius: 6, padding: "2px 8px" }}>
                      {ATTEND_LABELS[a.status]}
                    </span>
                  </div>
                );
              })}
              {hist.length === 0 && (
                <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px 0", fontSize: 13 }}>
                  Chưa có dữ liệu điểm danh
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
