"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Plus, X, BookOpen, Loader2, AlertCircle } from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, getStatusBadgeClass, STATUS_LABELS } from "@/lib/utils";

const SUBJECT_COLORS: Record<string, string> = {
  "Toán": "#6366f1", "Văn": "#f43f5e", "Anh văn": "#10b981",
  "Vật lý": "#f59e0b", "Hóa học": "#22d3ee", "Sinh học": "#a855f7",
  "Lịch sử": "#84cc16", "Địa lý": "#f97316", "Tin học": "#fb923c",
};

export default function StudentEnrollmentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [registering, setRegistering] = useState(false);
  const [pendingClassId, setPendingClassId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const { data: myEnrollments } = useQuery({
    queryKey: ["my-enrollments"],
    queryFn: () => api.get("/enrollments/my").then(r => getData<any[]>(r)),
  });

  const { data: allClasses, isLoading: loadingClasses } = useQuery({
    queryKey: ["classes-open", search],
    queryFn: () => api.get("/classes", { params: { search, isActive: true, limit: 50 } }).then(r => getData<any>(r)),
    enabled: registering,
  });

  const registerMut = useMutation({
    mutationFn: (classId: string) => {
      setPendingClassId(classId);
      return api.post("/enrollments", { classId });
    },
    onSuccess: (_data, classId) => {
      qc.invalidateQueries({ queryKey: ["my-enrollments"] });
      setErrorMap(prev => { const n = { ...prev }; delete n[classId]; return n; });
      setPendingClassId(null);
    },
    onError: (err: any, classId) => {
      const errData = err.response?.data;
      const msg = (Array.isArray(errData?.message) ? errData.message[0] : errData?.message) || "Đăng ký thất bại. Vui lòng thử lại.";
      setErrorMap(prev => ({ ...prev, [classId]: msg }));
      setPendingClassId(null);
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.patch(`/enrollments/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-enrollments"] }),
  });

  const enrolled: any[] = Array.isArray(myEnrollments) ? myEnrollments : [];
  const enrolledClassIds = new Set(enrolled.filter(e => e.status === "APPROVED").map(e => e.classId));
  const pendingClassIds = new Set(enrolled.filter(e => e.status === "PENDING").map(e => e.classId));
  const classes: any[] = allClasses?.data ?? [];

  return (
    <div>
      <Header title="Đăng ký học" subtitle="UC-19 — Tìm và đăng ký lớp học" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">

        {/* View toggle */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button className={`btn ${!registering ? "btn-primary" : "btn-ghost"}`} onClick={() => setRegistering(false)}>
            📋 Lớp đã đăng ký ({enrolled.length})
          </button>
          <button className={`btn ${registering ? "btn-primary" : "btn-ghost"}`} onClick={() => setRegistering(true)}>
            <Plus size={15} /> Đăng ký lớp mới
          </button>
        </div>

        {!registering ? (
          /* My enrollments */
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {enrolled.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                <BookOpen size={40} style={{ margin: "0 auto 12px", opacity: 0.3, display: "block" }} />
                <p>Chưa đăng ký lớp học nào</p>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setRegistering(true)}>
                  Đăng ký ngay
                </button>
              </div>
            ) : enrolled.map((e: any) => {
              const color = SUBJECT_COLORS[e.class?.subject] ?? "#6366f1";
              return (
                <div key={e.id} style={{
                  background: "var(--bg-card)", border: `1px solid ${color}25`,
                  borderLeft: `3px solid ${color}`, borderRadius: 12, padding: "16px 20px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{e.class?.name}</h3>
                      <span className={`badge ${getStatusBadgeClass(e.status)}`}>{STATUS_LABELS[e.status] ?? e.status}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      📚 {e.class?.subject} · 👩‍🏫 {e.class?.teacher?.profile?.fullName ?? "—"} · 💰 {formatCurrency(e.class?.tuitionPerSession)}/buổi
                    </p>
                  </div>
                  {e.status === "PENDING" && (
                    <button className="btn btn-danger btn-sm" onClick={() => cancelMut.mutate(e.id)}>
                      <X size={13} /> Hủy
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Browse & register */
          <>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input className="input" placeholder="Tìm tên lớp, môn học..." value={search}
                onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
            </div>

            {loadingClasses ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 14 }}>
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 14 }} />)}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 14 }}>
                {classes.map((cls: any) => {
                  const color = SUBJECT_COLORS[cls.subject] ?? "#6366f1";
                  const isEnrolled = enrolledClassIds.has(cls.id);
                  const isPendingThis = pendingClassIds.has(cls.id);
                  const isFull = (cls.studentCount ?? 0) >= cls.maxStudents;
                  const isLoading = pendingClassId === cls.id;
                  const errMsg = errorMap[cls.id];

                  let btnLabel: any = "Đăng ký";
                  let btnClass = "btn-primary";
                  if (isEnrolled) { btnLabel = "✓ Đã học"; btnClass = "btn-success"; }
                  else if (isPendingThis) { btnLabel = "⏳ Chờ duyệt"; btnClass = "btn-ghost"; }
                  else if (isFull) { btnLabel = "Đã đầy"; btnClass = "btn-ghost"; }
                  else if (isLoading) { btnLabel = <><Loader2 size={13} className="animate-spin-slow" /> Đang gửi...</>; }

                  return (
                    <div key={cls.id} className="card" style={{ borderTop: `3px solid ${color}60` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div>
                          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{cls.name}</h3>
                          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{cls.subject} · Khối {cls.grade}</p>
                        </div>
                        {isFull && <span className="badge badge-error">Đầy</span>}
                      </div>

                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                        👩‍🏫 {cls.teacherName ?? cls.teacher?.profile?.fullName ?? "—"}
                      </p>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>
                          {formatCurrency(cls.tuitionPerSession)}
                          <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-muted)" }}>/buổi</span>
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cls.studentCount ?? 0}/{cls.maxStudents} hs</span>
                      </div>

                      {errMsg && (
                        <div style={{
                          display: "flex", gap: 6, alignItems: "flex-start",
                          background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)",
                          borderRadius: 8, padding: "7px 10px", marginBottom: 8, fontSize: 11, color: "#f43f5e",
                        }}>
                          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                          {errMsg}
                        </div>
                      )}

                      <button
                        className={`btn btn-sm ${btnClass}`}
                        style={{ width: "100%" }}
                        disabled={isEnrolled || isPendingThis || isFull || isLoading}
                        onClick={() => {
                          setErrorMap(prev => { const n = { ...prev }; delete n[cls.id]; return n; });
                          registerMut.mutate(cls.id);
                        }}
                      >
                        {btnLabel}
                      </button>
                    </div>
                  );
                })}

                {classes.length === 0 && (
                  <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>
                    {search ? "Không tìm thấy lớp học khớp với từ khóa" : "Không có lớp học nào đang mở"}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
