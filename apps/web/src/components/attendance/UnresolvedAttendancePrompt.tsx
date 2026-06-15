"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, X } from "lucide-react";
import api, { getData } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const QUICK_ACTIONS = [
  { status: "PRESENT", label: "Có mặt tất cả", color: "#10b981" },
  { status: "ABSENT_EXCUSED", label: "Vắng phép tất cả", color: "#f59e0b" },
  { status: "ABSENT_UNEXCUSED", label: "Vắng KP tất cả", color: "#f43f5e" },
];

function sessionKey(session: any) {
  return `attendance-unresolved:${session.scheduleId ?? "extra"}:${session.weeklyOverrideId ?? "base"}:${session.sessionDate}`;
}

export default function UnresolvedAttendancePrompt() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const { data: sessions } = useQuery({
    queryKey: ["unresolved-not-present"],
    queryFn: () =>
      api
        .get("/attendance/unresolved-not-present")
        .then((r) => getData<any[]>(r)),
    refetchInterval: 60_000,
  });

  const session = useMemo(() => {
    return (sessions ?? []).find((item: any) => {
      const key = sessionKey(item);
      return (
        !dismissed[key] &&
        (typeof window === "undefined" || sessionStorage.getItem(key) !== "1")
      );
    });
  }, [sessions, dismissed]);

  const quickMut = useMutation({
    mutationFn: (status: string) =>
      api.patch("/attendance/not-present/quick-mark", {
        scheduleId: session?.scheduleId ?? undefined,
        weeklyOverrideId: session?.weeklyOverrideId ?? undefined,
        sessionDate: session?.sessionDate,
        status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unresolved-not-present"] });
      qc.invalidateQueries({ queryKey: ["teaching-history"] });
      qc.invalidateQueries({ queryKey: ["current-attendance"] });
    },
  });

  if (!session) return null;

  const key = sessionKey(session);
  const records: any[] = session.records ?? [];

  const dismiss = () => {
    sessionStorage.setItem(key, "1");
    setDismissed((value) => ({ ...value, [key]: true }));
  };

  const openHistory = () => {
    dismiss();
    const params = new URLSearchParams({
      status: "NOT_PRESENT",
      classId: session.classId,
    });
    router.push(`/teacher/teaching-history?${params.toString()}`);
  };

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.32)",
                color: "#f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={19} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                Còn học sinh chưa có mặt
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 3,
                }}
              >
                {session.class?.name} · kết thúc{" "}
                {formatDate(session.sessionEndAt, "HH:mm dd/MM/yyyy")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {records.slice(0, 5).map((record, index) => (
            <div
              key={record.id}
              style={{
                padding: "9px 12px",
                borderBottom:
                  index < Math.min(records.length, 5) - 1
                    ? "1px solid var(--border)"
                    : "none",
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              {record.student?.profile?.fullName ?? "—"}
            </div>
          ))}
          {records.length > 5 && (
            <div
              style={{
                padding: "9px 12px",
                borderTop: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Còn {records.length - 5} học sinh khác
            </div>
          )}
        </div>

        {quickMut.isError && (
          <p style={{ fontSize: 12, color: "#f43f5e", marginBottom: 12 }}>
            {(quickMut.error as any)?.response?.data?.message ??
              "Không thể cập nhật điểm danh nhanh"}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0,1fr))",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.status}
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={quickMut.isPending}
              style={{
                color: action.color,
                borderColor: `${action.color}35`,
                background: `${action.color}12`,
                justifyContent: "center",
              }}
              onClick={() => quickMut.mutate(action.status)}
            >
              {quickMut.isPending ? (
                <Loader2 size={13} className="animate-spin-slow" />
              ) : (
                action.label
              )}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={dismiss}
          >
            Để sau
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={openHistory}
          >
            Điểm danh từng học sinh
          </button>
        </div>
      </div>
    </div>
  );
}
