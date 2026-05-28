"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, CheckCircle, UserX, X, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, getInitials, getStatusBadgeClass, STATUS_LABELS } from "@/lib/utils";

function AttendanceModal({ cls, onClose }: { cls: any; onClose: () => void }) {
  const qc = useQueryClient();

  // Get schedule for today
  const today = ["SUN","MON","TUE","WED","THU","FRI","SAT"][new Date().getDay()];
  const { data: scheduleData } = useQuery({
    queryKey: ["my-schedule"],
    queryFn: () => api.get("/schedules/my").then(r => getData<any[]>(r)),
  });
  const schedule = scheduleData?.find((s: any) => s.classId === cls.id);

  const [records, setRecords] = useState<Record<string, string>>({});

  const studentsFromEnrollments: any[] = cls.enrollments ?? [];

  const saveMut = useMutation({
    mutationFn: () => api.post("/attendance/save", {
      scheduleId: schedule?.id ?? "demo",
      records: studentsFromEnrollments.map((e: any) => ({
        studentId: e.studentId,
        status: records[e.studentId] ?? "PRESENT",
      })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-classes"] }); onClose(); },
  });

  const STATUSES = [
    { value: "PRESENT", label: "Có mặt", color: "#10b981" },
    { value: "ABSENT_EXCUSED", label: "Vắng phép", color: "#f59e0b" },
    { value: "ABSENT_UNEXCUSED", label: "Vắng KP", color: "#f43f5e" },
    { value: "MAKEUP", label: "Học bù", color: "#6366f1" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>📋 Điểm danh — {cls.name}</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{studentsFromEnrollments.length} học sinh</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>

        {/* Quick mark all */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", marginRight: 4 }}>Chấm nhanh:</span>
          {STATUSES.map(s => (
            <button key={s.value} className="btn btn-ghost btn-sm"
              style={{ background: `${s.color}18`, color: s.color, borderColor: `${s.color}30`, fontSize: 11 }}
              onClick={() => {
                const all: Record<string, string> = {};
                studentsFromEnrollments.forEach((e: any) => { all[e.studentId] = s.value; });
                setRecords(all);
              }}>
              {s.label} tất cả
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
          {studentsFromEnrollments.map((e: any) => {
            const status = records[e.studentId] ?? "PRESENT";
            const color = STATUSES.find(s => s.value === status)?.color ?? "#10b981";
            return (
              <div key={e.studentId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, border: `1.5px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>
                  {getInitials(e.student?.profile?.fullName)}
                </div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{e.student?.profile?.fullName ?? "—"}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {STATUSES.map(s => (
                    <button key={s.value}
                      style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                        background: status === s.value ? `${s.color}20` : "transparent",
                        borderColor: status === s.value ? `${s.color}50` : "var(--border)",
                        color: status === s.value ? s.color : "var(--text-muted)",
                      }}
                      onClick={() => setRecords(r => ({ ...r, [e.studentId]: s.value }))}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {studentsFromEnrollments.length === 0 && (
            <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>Lớp chưa có học sinh</p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={saveMut.isPending || !schedule} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : <><CheckCircle size={14} /> Lưu điểm danh</>}
          </button>
        </div>
        {!schedule && <p style={{ fontSize: 11, color: "#f59e0b", textAlign: "center", marginTop: 8 }}>⚠️ Không có lịch dạy hôm nay cho lớp này</p>}
      </div>
    </div>
  );
}

export default function TeacherClassesPage() {
  const [attendanceCls, setAttendanceCls] = useState<any>(null);

  const { data: classes, isLoading } = useQuery({
    queryKey: ["my-classes"],
    queryFn: () => api.get("/classes/my/classes").then(r => getData<any[]>(r)),
  });

  const list: any[] = classes ?? [];

  return (
    <div>
      <Header title="Lớp của tôi" subtitle="UC-12 — Quản lý lớp, duyệt học sinh, điểm danh" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Tổng lớp</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>{list.length}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Tổng học sinh</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
              {list.reduce((s, c) => s + (c._count?.enrollments ?? 0), 0)}
            </p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Chờ duyệt</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b", marginTop: 4 }}>
              {list.reduce((s, c) => s + (c.enrollments?.length ?? 0), 0)}
            </p>
          </div>
        </div>

        {/* Classes */}
        {isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 200 }} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))", gap: 16 }}>
            {list.map((cls: any) => (
              <div key={cls.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{cls.name}</h3>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{cls.subject} • Khối {cls.grade}</p>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setAttendanceCls(cls)}>
                    <CheckCircle size={13} /> Điểm danh
                  </button>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                    <p style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{cls._count?.enrollments ?? 0}</p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)" }}>Học sinh</p>
                  </div>
                  <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                    <p style={{ fontSize: 18, fontWeight: 800, color: cls.maxStudents }}>
                      {cls.maxStudents - (cls._count?.enrollments ?? 0)}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)" }}>Chỗ trống</p>
                  </div>
                  <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>{cls.enrollments?.length ?? 0}</p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)" }}>Chờ duyệt</p>
                  </div>
                </div>

                {/* Pending enrollments */}
                {cls.enrollments?.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                      Chờ duyệt vào lớp
                    </p>
                    {cls.enrollments.slice(0, 3).map((e: any) => (
                      <PendingRow key={e.id} enrollment={e} />
                    ))}
                    {cls.enrollments.length > 3 && (
                      <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 4 }}>
                        +{cls.enrollments.length - 3} học sinh khác...
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {list.length === 0 && (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                <Users size={40} style={{ margin: "0 auto 12px", opacity: 0.3, display: "block" }} />
                <p>Chưa được phân công lớp nào</p>
              </div>
            )}
          </div>
        )}
      </div>
      {attendanceCls && <AttendanceModal cls={attendanceCls} onClose={() => setAttendanceCls(null)} />}
    </div>
  );
}

function PendingRow({ enrollment }: { enrollment: any }) {
  const qc = useQueryClient();
  const approveMut = useMutation({
    mutationFn: () => api.patch(`/enrollments/${enrollment.id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-classes"] }),
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>
        {getInitials(enrollment.student?.profile?.fullName)}
      </div>
      <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)" }}>{enrollment.student?.profile?.fullName ?? "—"}</span>
      <button className="btn btn-success btn-sm" style={{ padding: "3px 8px", fontSize: 11 }} disabled={approveMut.isPending} onClick={() => approveMut.mutate()}>
        {approveMut.isPending ? "..." : "Duyệt"}
      </button>
    </div>
  );
}
