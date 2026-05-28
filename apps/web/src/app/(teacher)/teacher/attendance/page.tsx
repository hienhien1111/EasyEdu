"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Search, CheckCircle, Edit3, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import {
  formatDate,
  getInitials,
  ATTENDANCE_LABELS,
  getStatusBadgeClass,
  DAY_LABELS,
} from "@/lib/utils";

const STATUSES = [
  { value: "PRESENT", label: "Có mặt", color: "#10b981" },
  { value: "ABSENT_EXCUSED", label: "Vắng phép", color: "#f59e0b" },
  { value: "ABSENT_UNEXCUSED", label: "Vắng KP", color: "#f43f5e" },
  { value: "MAKEUP", label: "Học bù", color: "#6366f1" },
];

function EditModal({
  record,
  onClose,
}: {
  record: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(record.status);
  const [note, setNote] = useState(record.note ?? "");

  // Check 24h window
  const createdAt = new Date(record.createdAt ?? record.schedule?.date);
  const hoursElapsed = (Date.now() - createdAt.getTime()) / 3600000;
  const canEdit = hoursElapsed <= 24;

  const mut = useMutation({
    mutationFn: () =>
      api.patch(`/attendance/${record.id}`, { status, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-sessions"] });
      onClose();
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 8,
          }}
        >
          ✏️ Chỉnh sửa điểm danh
        </h3>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: 16,
          }}
        >
          {record.student?.profile?.fullName} —{" "}
          {formatDate(record.createdAt, "HH:mm dd/MM/yyyy")}
        </p>

        {!canEdit && (
          <div
            style={{
              background: "rgba(244,63,94,0.1)",
              border: "1px solid rgba(244,63,94,0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: "#f43f5e",
            }}
          >
            ⏰ Đã quá 24 giờ — không thể chỉnh sửa điểm danh này
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="form-label">Trạng thái</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STATUSES.map((s) => (
              <button
                key={s.value}
                disabled={!canEdit}
                onClick={() => setStatus(s.value)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: canEdit ? "pointer" : "not-allowed",
                  border: "1px solid",
                  transition: "all 0.15s",
                  background:
                    status === s.value ? `${s.color}20` : "transparent",
                  borderColor:
                    status === s.value ? `${s.color}50` : "var(--border)",
                  color: status === s.value ? s.color : "var(--text-muted)",
                  opacity: canEdit ? 1 : 0.5,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Ghi chú</label>
          <textarea
            className="input"
            rows={2}
            disabled={!canEdit}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Lý do vắng, bù học..."
            style={{ resize: "none" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ flex: 1 }}
          >
            Đóng
          </button>
          {canEdit && (
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin-slow" /> Đang lưu...
                </>
              ) : (
                "Lưu thay đổi"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeacherAttendancePage() {
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [search, setSearch] = useState("");

  const { data: myClasses } = useQuery({
    queryKey: ["my-classes-list"],
    queryFn: () =>
      api.get("/classes/my/classes").then((r) => getData<any[]>(r)),
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["attendance-sessions", selectedClass?.id],
    queryFn: () =>
      api
        .get(`/attendance/sessions`, {
          params: { classId: selectedClass!.id },
        })
        .then((r) => getData<any[]>(r)),
    enabled: !!selectedClass?.id,
  });

  const classes: any[] = myClasses ?? [];
  const sessionList: any[] = sessions ?? [];

  // Stats per session
  const getStats = (records: any[]) => ({
    present: records.filter((r) => r.status === "PRESENT").length,
    absent: records.filter((r) =>
      ["ABSENT_EXCUSED", "ABSENT_UNEXCUSED"].includes(r.status)
    ).length,
    total: records.length,
  });

  return (
    <div>
      <Header
        title="Điểm danh"
        subtitle="UC-11 — Xem lịch sử, chỉnh sửa trong 24h"
      />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
          {/* Class picker */}
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                marginBottom: 10,
              }}
            >
              Chọn lớp
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {classes.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    background:
                      selectedClass?.id === cls.id
                        ? "rgba(99,102,241,0.12)"
                        : "var(--bg-card)",
                    borderColor:
                      selectedClass?.id === cls.id
                        ? "rgba(99,102,241,0.4)"
                        : "var(--border)",
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        selectedClass?.id === cls.id
                          ? "var(--accent-secondary)"
                          : "var(--text-primary)",
                    }}
                  >
                    {cls.name}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {cls.subject} · {cls._count?.enrollments ?? 0} hs
                  </p>
                </button>
              ))}
              {classes.length === 0 && (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    padding: "20px 0",
                  }}
                >
                  Chưa có lớp
                </p>
              )}
            </div>
          </div>

          {/* Session list */}
          <div>
            {!selectedClass ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "80px 0",
                  color: "var(--text-muted)",
                }}
              >
                <ClipboardCheck
                  size={48}
                  style={{ margin: "0 auto 16px", opacity: 0.2, display: "block" }}
                />
                <p>Chọn một lớp để xem lịch sử điểm danh</p>
              </div>
            ) : isLoading ? (
              [...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ height: 120, borderRadius: 12, marginBottom: 12 }}
                />
              ))
            ) : sessionList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 0",
                  color: "var(--text-muted)",
                }}
              >
                <p>Chưa có buổi điểm danh nào</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sessionList.map((session: any) => {
                  const stats = getStats(session.records ?? []);
                  const attendRate =
                    stats.total > 0
                      ? Math.round((stats.present / stats.total) * 100)
                      : 0;

                  return (
                    <div key={session.scheduleId} className="card">
                      {/* Session header */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 14,
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: "var(--text-primary)",
                            }}
                          >
                            {DAY_LABELS[session.dayOfWeek]} —{" "}
                            {session.startTime}–{session.endTime}
                          </p>
                          <p
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              marginTop: 2,
                            }}
                          >
                            📅 {formatDate(session.date, "dd/MM/yyyy")} · 🚪{" "}
                            {session.room}
                          </p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ textAlign: "right" }}>
                            <p
                              style={{
                                fontSize: 20,
                                fontWeight: 800,
                                color:
                                  attendRate >= 80
                                    ? "#10b981"
                                    : attendRate >= 60
                                    ? "#f59e0b"
                                    : "#f43f5e",
                              }}
                            >
                              {attendRate}%
                            </p>
                            <p
                              style={{ fontSize: 11, color: "var(--text-muted)" }}
                            >
                              {stats.present}/{stats.total} có mặt
                            </p>
                          </div>
                          <div className="progress-bar" style={{ width: 60 }}>
                            <div
                              className="progress-fill"
                              style={{
                                width: `${attendRate}%`,
                                background:
                                  attendRate >= 80
                                    ? "linear-gradient(90deg,#10b981,#34d399)"
                                    : "linear-gradient(90deg,#f59e0b,#fbbf24)",
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Student rows */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(260px, 1fr))",
                          gap: 8,
                        }}
                      >
                        {(session.records ?? []).map((rec: any) => {
                          const s = STATUSES.find(
                            (s) => s.value === rec.status
                          );
                          const color = s?.color ?? "#9198c5";
                          const hoursElapsed =
                            (Date.now() -
                              new Date(rec.createdAt).getTime()) /
                            3600000;
                          const canEdit = hoursElapsed <= 24;

                          return (
                            <div
                              key={rec.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "8px 12px",
                                background: `${color}08`,
                                border: `1px solid ${color}25`,
                                borderRadius: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  background: `${color}18`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color,
                                  flexShrink: 0,
                                }}
                              >
                                {getInitials(rec.student?.profile?.fullName)}
                              </div>
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: "var(--text-primary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {rec.student?.profile?.fullName ?? "—"}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color,
                                  flexShrink: 0,
                                }}
                              >
                                {s?.label ?? rec.status}
                              </span>
                              {canEdit && (
                                <button
                                  onClick={() => setEditRecord(rec)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "var(--text-muted)",
                                    padding: 2,
                                    display: "flex",
                                  }}
                                  title="Chỉnh sửa (còn trong 24h)"
                                >
                                  <Edit3 size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {editRecord && (
        <EditModal record={editRecord} onClose={() => setEditRecord(null)} />
      )}
    </div>
  );
}
