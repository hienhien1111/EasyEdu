"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  ClipboardCheck,
  Clock,
  Loader2,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { DAY_LABELS, formatDate, getInitials } from "@/lib/utils";

const STATUSES = [
  { value: "NOT_PRESENT", label: "Chưa có mặt", color: "#64748b" },
  { value: "PRESENT", label: "Có mặt", color: "#10b981" },
  { value: "ABSENT_EXCUSED", label: "Vắng phép", color: "#f59e0b" },
  { value: "ABSENT_UNEXCUSED", label: "Vắng KP", color: "#f43f5e" },
];

function getSessionKey(session: any) {
  return `${session.scheduleId ?? "extra"}:${session.weeklyOverrideId ?? "base"}:${session.sessionDate}`;
}

function getSessionCardKey(session: any) {
  const studentsKey = (session.students ?? [])
    .map(
      (student: any) =>
        `${student.studentId}:${student.status}:${student.makeupSourceId ?? ""}`,
    )
    .join("|");
  return `${getSessionKey(session)}:${studentsKey}`;
}

function buildInitialRecords(students: any[]) {
  return Object.fromEntries(
    students.map((student) => [
      student.studentId,
      student.status ?? "NOT_PRESENT",
    ]),
  ) as Record<string, string>;
}

function AttendanceSessionCard({ session }: { session: any }) {
  const qc = useQueryClient();
  const students: any[] = session.students ?? [];
  const [records, setRecords] = useState<Record<string, string>>(() =>
    buildInitialRecords(students),
  );
  const [showMakeup, setShowMakeup] = useState(false);

  const { data: makeupCandidates, isLoading: isLoadingMakeup } = useQuery({
    queryKey: ["eligible-makeup", session.classId],
    queryFn: () =>
      api
        .get("/attendance/eligible-makeup", {
          params: { classId: session.classId },
        })
        .then((r) => getData<any[]>(r)),
    enabled: showMakeup && !!session.classId,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      api.post("/attendance/save", {
        scheduleId: session.scheduleId ?? undefined,
        weeklyOverrideId: session.weeklyOverrideId ?? undefined,
        sessionDate: session.sessionDate,
        records: students.map((student) => ({
          studentId: student.studentId,
          status: records[student.studentId] ?? student.status ?? "NOT_PRESENT",
          makeupSourceId:
            student.makeupSourceId ??
            student.attendance?.makeupSourceId ??
            undefined,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-attendance"] });
      qc.invalidateQueries({ queryKey: ["unresolved-not-present"] });
      qc.invalidateQueries({ queryKey: ["teaching-history"] });
    },
  });

  const addMakeupMut = useMutation({
    mutationFn: (makeupSourceId: string) =>
      api.post("/attendance/makeup-student", {
        scheduleId: session.scheduleId ?? undefined,
        weeklyOverrideId: session.weeklyOverrideId ?? undefined,
        sessionDate: session.sessionDate,
        makeupSourceId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-attendance"] });
      qc.invalidateQueries({ queryKey: ["unresolved-not-present"] });
      qc.invalidateQueries({ queryKey: ["eligible-makeup", session.classId] });
      qc.invalidateQueries({ queryKey: ["teaching-history"] });
    },
  });

  const cancelMakeupMut = useMutation({
    mutationFn: (makeupSourceId: string) =>
      api.patch("/attendance/makeup-student/cancel", {
        scheduleId: session.scheduleId ?? undefined,
        weeklyOverrideId: session.weeklyOverrideId ?? undefined,
        sessionDate: session.sessionDate,
        makeupSourceId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-attendance"] });
      qc.invalidateQueries({ queryKey: ["unresolved-not-present"] });
      qc.invalidateQueries({ queryKey: ["eligible-makeup", session.classId] });
      qc.invalidateQueries({ queryKey: ["teaching-history"] });
    },
  });

  const stats = {
    present: Object.values(records).filter((status) => status === "PRESENT")
      .length,
    notPresent: Object.values(records).filter(
      (status) => status === "NOT_PRESENT",
    ).length,
    total: students.length,
  };

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            {session.class?.name}
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {session.class?.subject} · {DAY_LABELS[session.timeSlot?.dayOfWeek]}{" "}
            · {session.timeSlot?.startTime}-{session.timeSlot?.endTime} ·{" "}
            {session.room?.name}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          <Clock size={15} />
          <span>
            Kết thúc {formatDate(session.sessionEndAt, "HH:mm dd/MM/yyyy")}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            background: "var(--bg-secondary)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontWeight: 700,
            }}
          >
            Tổng học sinh
          </p>
          <p
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            {stats.total}
          </p>
        </div>
        <div
          style={{
            background: "rgba(16,185,129,0.09)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <p style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>
            Có mặt
          </p>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#10b981" }}>
            {stats.present}
          </p>
        </div>
        <div
          style={{
            background: "rgba(100,116,139,0.12)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <p style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>
            Chưa có mặt
          </p>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#94a3b8" }}>
            {stats.notPresent}
          </p>
        </div>
      </div>

      <div
        style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            marginRight: 2,
          }}
        >
          Chấm nhanh:
        </span>
        {STATUSES.map((status) => (
          <button
            key={status.value}
            className="btn btn-ghost btn-sm"
            style={{
              background: `${status.color}18`,
              color: status.color,
              borderColor: `${status.color}35`,
              fontSize: 11,
            }}
            onClick={() => {
              const next: Record<string, string> = {};
              students.forEach((student) => {
                next[student.studentId] =
                  student.isMakeup && status.value !== "PRESENT"
                    ? (records[student.studentId] ??
                      student.status ??
                      "NOT_PRESENT")
                    : status.value;
              });
              setRecords(next);
            }}
          >
            {status.label} tất cả
          </button>
        ))}
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto", fontSize: 11 }}
          onClick={() => setShowMakeup((value) => !value)}
        >
          <UserPlus size={13} /> Thêm học bù
        </button>
      </div>

      {showMakeup && (
        <div
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 14,
          }}
        >
          {isLoadingMakeup ? (
            <div className="skeleton" style={{ height: 48, borderRadius: 8 }} />
          ) : (makeupCandidates ?? []).length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Không có học sinh đủ điều kiện học bù
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(makeupCandidates ?? []).map((candidate: any) => {
                const fullName = candidate.student?.profile?.fullName ?? "—";
                const sourceTimeSlot =
                  candidate.weeklyOverride?.timeSlot ??
                  candidate.schedule?.timeSlot;
                return (
                  <div
                    key={candidate.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "var(--bg-card)",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "rgba(99,102,241,0.13)",
                        color: "#6366f1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(fullName)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                        }}
                      >
                        {fullName}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {candidate.class?.name} ·{" "}
                        {formatDate(candidate.sessionDate, "dd/MM/yyyy")} ·{" "}
                        {sourceTimeSlot?.startTime}-{sourceTimeSlot?.endTime}
                      </p>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={addMakeupMut.isPending}
                      onClick={() => addMakeupMut.mutate(candidate.id)}
                    >
                      {addMakeupMut.isPending ? (
                        <Loader2 size={13} className="animate-spin-slow" />
                      ) : (
                        <UserPlus size={13} />
                      )}
                      Thêm
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {addMakeupMut.isError && (
            <p style={{ fontSize: 12, color: "#f43f5e", marginTop: 10 }}>
              {(addMakeupMut.error as any)?.response?.data?.message ??
                "Không thể thêm học sinh học bù"}
            </p>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: 460,
          overflowY: "auto",
        }}
      >
        {students.map((student) => {
          const current =
            records[student.studentId] ?? student.status ?? "NOT_PRESENT";
          const currentStatus =
            STATUSES.find((status) => status.value === current) ?? STATUSES[0];
          const fullName =
            student.fullName ?? student.student?.profile?.fullName ?? "—";

          return (
            <div
              key={student.studentId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "var(--bg-secondary)",
                border: `1px solid ${currentStatus.color}24`,
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: `${currentStatus.color}18`,
                  color: currentStatus.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {getInitials(fullName)}
              </div>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fullName}
                {student.isMakeup && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#6366f1",
                      background: "rgba(99,102,241,0.13)",
                      borderRadius: 6,
                      padding: "2px 6px",
                    }}
                  >
                    Học bù
                  </span>
                )}
              </span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {student.isMakeup ? (
                  <>
                    <button
                      type="button"
                      style={{
                        padding: "5px 9px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: "pointer",
                        border: "1px solid",
                        transition: "all 0.15s",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background:
                          current === "PRESENT"
                            ? "rgba(16,185,129,0.14)"
                            : "transparent",
                        borderColor:
                          current === "PRESENT"
                            ? "rgba(16,185,129,0.45)"
                            : "var(--border)",
                        color:
                          current === "PRESENT"
                            ? "#10b981"
                            : "var(--text-muted)",
                      }}
                      onClick={() =>
                        setRecords((value) => ({
                          ...value,
                          [student.studentId]: "PRESENT",
                        }))
                      }
                    >
                      <CheckCircle size={12} /> Có mặt
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: "5px 9px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: student.makeupSourceId
                          ? "pointer"
                          : "not-allowed",
                        border: "1px solid rgba(244,63,94,0.34)",
                        transition: "all 0.15s",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: "rgba(244,63,94,0.08)",
                        color: "#f43f5e",
                        opacity:
                          cancelMakeupMut.isPending || !student.makeupSourceId
                            ? 0.65
                            : 1,
                      }}
                      disabled={
                        cancelMakeupMut.isPending || !student.makeupSourceId
                      }
                      onClick={() =>
                        student.makeupSourceId &&
                        cancelMakeupMut.mutate(student.makeupSourceId)
                      }
                    >
                      {cancelMakeupMut.isPending ? (
                        <Loader2 size={12} className="animate-spin-slow" />
                      ) : (
                        <XCircle size={12} />
                      )}
                      Hủy
                    </button>
                  </>
                ) : (
                  STATUSES.map((status) => (
                    <button
                      key={status.value}
                      type="button"
                      style={{
                        padding: "5px 9px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: "pointer",
                        border: "1px solid",
                        transition: "all 0.15s",
                        background:
                          current === status.value
                            ? `${status.color}22`
                            : "transparent",
                        borderColor:
                          current === status.value
                            ? `${status.color}55`
                            : "var(--border)",
                        color:
                          current === status.value
                            ? status.color
                            : "var(--text-muted)",
                      }}
                      onClick={() =>
                        setRecords((value) => ({
                          ...value,
                          [student.studentId]: status.value,
                        }))
                      }
                    >
                      {status.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
        {students.length === 0 && (
          <p
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              padding: 30,
            }}
          >
            Lớp chưa có học sinh được duyệt
          </p>
        )}
      </div>

      {saveMut.isError && (
        <p style={{ fontSize: 12, color: "#f43f5e", marginTop: 12 }}>
          {(saveMut.error as any)?.response?.data?.message ??
            "Không thể lưu điểm danh"}
        </p>
      )}
      {cancelMakeupMut.isError && (
        <p style={{ fontSize: 12, color: "#f43f5e", marginTop: 12 }}>
          {(cancelMakeupMut.error as any)?.response?.data?.message ??
            "Không thể hủy học sinh học bù"}
        </p>
      )}

      <div
        style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}
      >
        <button
          className="btn btn-primary"
          disabled={saveMut.isPending || students.length === 0}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin-slow" /> Đang lưu...
            </>
          ) : (
            <>
              <CheckCircle size={14} /> Xác nhận điểm danh
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function TeacherAttendancePage() {
  const {
    data: sessions,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["current-attendance"],
    queryFn: () =>
      api.get("/attendance/current").then((r) => getData<any[]>(r)),
    refetchInterval: 30_000,
  });

  const sessionList: any[] = sessions ?? [];

  return (
    <div>
      <Header
        title="Điểm danh"
        subtitle="Chỉ chấm điểm danh cho buổi học đang diễn ra"
      />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(2)].map((_, index) => (
              <div
                key={index}
                className="skeleton"
                style={{ height: 260, borderRadius: 12 }}
              />
            ))}
          </div>
        ) : isError ? (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "56px 24px",
              color: "#f43f5e",
              borderColor: "rgba(244,63,94,0.3)",
              background: "rgba(244,63,94,0.06)",
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 800 }}>
              Không tải được dữ liệu điểm danh
            </p>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              {(error as any)?.response?.data?.message ??
                "Vui lòng tải lại trang hoặc kiểm tra API."}
            </p>
          </div>
        ) : sessionList.length === 0 ? (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "70px 24px",
              color: "var(--text-muted)",
            }}
          >
            <ClipboardCheck
              size={46}
              style={{ margin: "0 auto 14px", opacity: 0.22, display: "block" }}
            />
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-secondary)",
              }}
            >
              Hiện không có buổi học nào đang diễn ra
            </p>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              Buổi học sẽ xuất hiện khi đã đến đúng thứ và giờ bắt đầu.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sessionList.map((session) => (
              <AttendanceSessionCard
                key={getSessionCardKey(session)}
                session={session}
              />
            ))}
          </div>
        )}

        {sessionList.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--text-muted)",
              fontSize: 12,
              marginTop: 16,
            }}
          >
            <Users size={14} />
            <span>
              Học sinh mặc định là Chưa có mặt; giáo viên chấm Có mặt thủ công.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
