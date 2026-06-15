"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Edit3,
  Loader2,
  Search,
  TimerOff,
  X,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { DAY_LABELS, formatDate, getInitials } from "@/lib/utils";

const STATUSES = [
  { value: "ALL", label: "Tất cả", color: "var(--text-muted)" },
  { value: "NOT_PRESENT", label: "Chưa có mặt", color: "#64748b" },
  { value: "PRESENT", label: "Có mặt", color: "#10b981" },
  { value: "ABSENT_EXCUSED", label: "Vắng phép", color: "#f59e0b" },
  { value: "ABSENT_UNEXCUSED", label: "Vắng KP", color: "#f43f5e" },
];

const EDIT_STATUSES = STATUSES.filter((status) => status.value !== "ALL");

function getStatus(value: string) {
  return (
    STATUSES.find((status) => status.value === value) ?? {
      value,
      label: value,
      color: "#9198c5",
    }
  );
}

function getSessionKey(session: any) {
  return `${session.scheduleId ?? "extra"}:${session.weeklyOverrideId ?? "base"}:${session.sessionDate}`;
}

function getInitialParam(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

function EditAttendanceModal({
  record,
  session,
  onClose,
}: {
  record: any;
  session: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(record.status);
  const [note, setNote] = useState(record.note ?? "");
  const canEdit = !!session.canEdit;
  const mut = useMutation({
    mutationFn: () => api.patch(`/attendance/${record.id}`, { status, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teaching-history"] });
      qc.invalidateQueries({ queryKey: ["unresolved-not-present"] });
      onClose();
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 430 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: "var(--text-primary)",
              }}
            >
              Sửa điểm danh
            </h3>
            <p
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}
            >
              {record.student?.profile?.fullName ?? "—"} ·{" "}
              {formatDate(session.sessionStartAt, "HH:mm dd/MM/yyyy")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: 6 }}
          >
            <X size={16} />
          </button>
        </div>

        {!canEdit && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(244,63,94,0.1)",
              border: "1px solid rgba(244,63,94,0.28)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
              fontSize: 12,
              color: "#f43f5e",
            }}
          >
            <TimerOff size={14} /> Buổi học đã quá thời hạn chỉnh sửa.
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="form-label">Trạng thái</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {EDIT_STATUSES.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={!canEdit}
                onClick={() => setStatus(item.value)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: canEdit ? "pointer" : "not-allowed",
                  border: "1px solid",
                  background:
                    status === item.value ? `${item.color}22` : "transparent",
                  borderColor:
                    status === item.value ? `${item.color}55` : "var(--border)",
                  color:
                    status === item.value ? item.color : "var(--text-muted)",
                  opacity: canEdit ? 1 : 0.55,
                }}
              >
                {item.label}
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
            onChange={(event) => setNote(event.target.value)}
            placeholder="Lý do vắng, ghi chú bổ sung..."
            style={{ resize: "none" }}
          />
        </div>

        {mut.isError && (
          <p style={{ fontSize: 12, color: "#f43f5e", marginBottom: 12 }}>
            {(mut.error as any)?.response?.data?.message ??
              "Không thể lưu thay đổi"}
          </p>
        )}

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
                  <Loader2 size={14} className="animate-spin-slow" /> Đang
                  lưu...
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

export default function TeacherTeachingHistoryPage() {
  const [classId, setClassId] = useState(() =>
    getInitialParam("classId", "ALL"),
  );
  const [status, setStatus] = useState(() => getInitialParam("status", "ALL"));
  const [search, setSearch] = useState(() => getInitialParam("search", ""));
  const [editTarget, setEditTarget] = useState<{
    record: any;
    session: any;
  } | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["my-classes"],
    queryFn: () =>
      api.get("/classes/my/classes").then((r) => getData<any[]>(r)),
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["teaching-history", classId, status, search],
    queryFn: () =>
      api
        .get("/attendance/teaching-history", {
          params: {
            classId: classId === "ALL" ? undefined : classId,
            status: status === "ALL" ? undefined : status,
            search: search.trim() || undefined,
          },
        })
        .then((r) => getData<any[]>(r)),
  });

  const classList: any[] = classes ?? [];
  const sessionList: any[] = sessions ?? [];

  return (
    <div>
      <Header
        title="Lịch sử dạy học"
        subtitle="Theo dõi và chỉnh sửa điểm danh các buổi học còn trong thời hạn"
      />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div
          className="card"
          style={{
            display: "grid",
            gridTemplateColumns: "220px 220px minmax(240px,1fr)",
            gap: 12,
            marginBottom: 18,
            alignItems: "end",
          }}
        >
          <div>
            <label className="form-label">Lớp</label>
            <select
              className="input"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <option value="ALL">Tất cả lớp</option>
              {classList.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} · {cls.subject}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Trạng thái</label>
            <select
              className="input"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Tìm học sinh</label>
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nhập tên học sinh"
                style={{ paddingLeft: 36 }}
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="skeleton"
                style={{ height: 150, borderRadius: 12 }}
              />
            ))}
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
            <CalendarClock
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
              Chưa có lịch sử phù hợp
            </p>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              Thử đổi bộ lọc hoặc tìm kiếm theo tên học sinh khác.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {sessionList.map((session) => {
              const records: any[] = session.records ?? [];
              const stats = {
                present: records.filter((record) => record.status === "PRESENT")
                  .length,
                notPresent: records.filter(
                  (record) => record.status === "NOT_PRESENT",
                ).length,
                absent: records.filter((record) =>
                  ["ABSENT_EXCUSED", "ABSENT_UNEXCUSED"].includes(
                    record.status,
                  ),
                ).length,
                total: records.length,
              };

              return (
                <div key={getSessionKey(session)} className="card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "var(--text-primary)",
                        }}
                      >
                        {session.class?.name}
                      </h3>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          marginTop: 3,
                        }}
                      >
                        {session.class?.subject} ·{" "}
                        {DAY_LABELS[session.timeSlot?.dayOfWeek]} ·{" "}
                        {session.timeSlot?.startTime}-
                        {session.timeSlot?.endTime} ·{" "}
                        {session.room?.name ?? "—"}
                      </p>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          marginTop: 3,
                        }}
                      >
                        Ngày học {formatDate(session.sessionDate, "dd/MM/yyyy")}{" "}
                        · Hạn sửa{" "}
                        {session.editDeadlineAt
                          ? formatDate(
                              session.editDeadlineAt,
                              "HH:mm dd/MM/yyyy",
                            )
                          : "chưa xác định"}
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      {[
                        {
                          label: "Có mặt",
                          value: stats.present,
                          color: "#10b981",
                        },
                        {
                          label: "Vắng",
                          value: stats.absent,
                          color: "#f59e0b",
                        },
                        {
                          label: "Chưa có mặt",
                          value: stats.notPresent,
                          color: "#64748b",
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            minWidth: 76,
                            background: `${item.color}12`,
                            border: `1px solid ${item.color}30`,
                            borderRadius: 8,
                            padding: "7px 9px",
                            textAlign: "center",
                          }}
                        >
                          <p
                            style={{
                              fontSize: 16,
                              fontWeight: 800,
                              color: item.color,
                            }}
                          >
                            {item.value}
                          </p>
                          <p
                            style={{ fontSize: 10, color: "var(--text-muted)" }}
                          >
                            {item.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!session.canEdit && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "rgba(100,116,139,0.1)",
                        border: "1px solid rgba(100,116,139,0.24)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        marginBottom: 12,
                      }}
                    >
                      <TimerOff size={14} /> Buổi học đã hết thời hạn điểm danh
                      lại.
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(260px,1fr))",
                      gap: 8,
                    }}
                  >
                    {records.map((record: any) => {
                      const item = getStatus(record.status);
                      const fullName = record.student?.profile?.fullName ?? "—";

                      return (
                        <div
                          key={record.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "9px 11px",
                            background: `${item.color}08`,
                            border: `1px solid ${item.color}26`,
                            borderRadius: 8,
                          }}
                        >
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 7,
                              background: `${item.color}18`,
                              color: item.color,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
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
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {fullName}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: item.color,
                              flexShrink: 0,
                            }}
                          >
                            {item.label}
                          </span>
                          {session.canEdit && (
                            <button
                              type="button"
                              onClick={() => setEditTarget({ record, session })}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--text-muted)",
                                display: "flex",
                                padding: 3,
                              }}
                              title="Sửa điểm danh"
                            >
                              <Edit3 size={13} />
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

      {editTarget && (
        <EditAttendanceModal
          record={editTarget.record}
          session={editTarget.session}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
