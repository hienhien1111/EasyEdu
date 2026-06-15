"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  Eye,
  Loader2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { getInitials } from "@/lib/utils";

const getApprovedEnrollments = (cls: any): any[] =>
  cls.approvedEnrollments ??
  (cls.enrollments ?? []).filter((e: any) => e.status === "APPROVED");

const getPendingEnrollments = (cls: any): any[] =>
  cls.pendingEnrollments ??
  (cls.enrollments ?? []).filter((e: any) => e.status === "PENDING");

const getStudentCount = (cls: any) =>
  cls.studentCount ??
  cls._count?.enrollments ??
  getApprovedEnrollments(cls).length;

function StudentRow({ enrollment }: { enrollment: any }) {
  const fullName = enrollment.student?.profile?.fullName ?? "Chưa có tên";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-secondary)",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "rgba(16,185,129,0.14)",
          color: "#10b981",
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
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {fullName}
      </span>
    </div>
  );
}

function PendingRow({ enrollment }: { enrollment: any }) {
  const qc = useQueryClient();
  const fullName = enrollment.student?.profile?.fullName ?? "Chưa có tên";
  const approveMut = useMutation({
    mutationFn: () => api.patch(`/enrollments/${enrollment.id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-classes"] }),
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 10px",
        border: "1px solid rgba(245,158,11,0.26)",
        borderRadius: 8,
        background: "rgba(245,158,11,0.08)",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: "rgba(245,158,11,0.16)",
          color: "#f59e0b",
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
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {fullName}
      </span>
      <button
        className="btn btn-success btn-sm"
        style={{ padding: "4px 9px", fontSize: 11 }}
        disabled={approveMut.isPending}
        onClick={() => approveMut.mutate()}
      >
        {approveMut.isPending ? (
          <Loader2 size={12} className="animate-spin-slow" />
        ) : (
          <>
            <CheckCircle size={12} /> Duyệt
          </>
        )}
      </button>
    </div>
  );
}

function ClassDetailModal({ cls, onClose }: { cls: any; onClose: () => void }) {
  const approvedEnrollments = getApprovedEnrollments(cls);
  const pendingEnrollments = getPendingEnrollments(cls);
  const studentCount = getStudentCount(cls);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 14,
            marginBottom: 18,
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
              {cls.name}
            </h3>
            <p
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}
            >
              {cls.subject} · Khối {cls.grade} · {studentCount}/
              {cls.maxStudents} học sinh
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
            gap: 16,
          }}
        >
          <section>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <UserCheck size={15} color="#10b981" />
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  textTransform: "uppercase",
                }}
              >
                Học sinh trong lớp
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {approvedEnrollments.map((enrollment: any) => (
                <StudentRow key={enrollment.id} enrollment={enrollment} />
              ))}
              {approvedEnrollments.length === 0 && (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    padding: "28px 0",
                  }}
                >
                  Lớp chưa có học sinh được duyệt
                </p>
              )}
            </div>
          </section>

          <section>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <UserPlus size={15} color="#f59e0b" />
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  textTransform: "uppercase",
                }}
              >
                Chờ duyệt
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingEnrollments.map((enrollment: any) => (
                <PendingRow key={enrollment.id} enrollment={enrollment} />
              ))}
              {pendingEnrollments.length === 0 && (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    padding: "28px 0",
                  }}
                >
                  Không có yêu cầu chờ duyệt
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function TeacherClassesPage() {
  const [detailClass, setDetailClass] = useState<any>(null);

  const { data: classes, isLoading } = useQuery({
    queryKey: ["my-classes"],
    queryFn: () =>
      api.get("/classes/my/classes").then((r) => getData<any[]>(r)),
  });

  const list: any[] = classes ?? [];

  return (
    <div>
      <Header
        title="Lớp của tôi"
        subtitle="Xem lớp đang dạy, danh sách học sinh và duyệt yêu cầu vào lớp"
      />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0,1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div className="card">
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Tổng lớp
            </p>
            <p
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "var(--text-primary)",
                marginTop: 4,
              }}
            >
              {list.length}
            </p>
          </div>
          <div className="card">
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Học sinh đã duyệt
            </p>
            <p
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#10b981",
                marginTop: 4,
              }}
            >
              {list.reduce((sum, cls) => sum + getStudentCount(cls), 0)}
            </p>
          </div>
          <div className="card">
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Chờ duyệt
            </p>
            <p
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#f59e0b",
                marginTop: 4,
              }}
            >
              {list.reduce(
                (sum, cls) => sum + getPendingEnrollments(cls).length,
                0,
              )}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))",
              gap: 16,
            }}
          >
            {[...Array(4)].map((_, index) => (
              <div key={index} className="skeleton" style={{ height: 210 }} />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))",
              gap: 16,
            }}
          >
            {list.map((cls: any) => {
              const studentCount = getStudentCount(cls);
              const pendingEnrollments = getPendingEnrollments(cls);

              return (
                <div key={cls.id} className="card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <h3
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cls.name}
                      </h3>
                      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {cls.subject} · Khối {cls.grade}
                      </p>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setDetailClass(cls)}
                    >
                      <Eye size={13} /> Chi tiết
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                    <div
                      style={{
                        flex: 1,
                        background: "var(--bg-secondary)",
                        borderRadius: 8,
                        padding: "9px 10px",
                        textAlign: "center",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#10b981",
                        }}
                      >
                        {studentCount}/{cls.maxStudents}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        Học sinh
                      </p>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        background: "var(--bg-secondary)",
                        borderRadius: 8,
                        padding: "9px 10px",
                        textAlign: "center",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#f59e0b",
                        }}
                      >
                        {pendingEnrollments.length}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        Chờ duyệt
                      </p>
                    </div>
                  </div>

                  {pendingEnrollments.length > 0 && (
                    <div
                      style={{
                        borderTop: "1px solid var(--border)",
                        paddingTop: 12,
                        marginTop: 12,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          marginBottom: 8,
                        }}
                      >
                        Chờ duyệt vào lớp
                      </p>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {pendingEnrollments
                          .slice(0, 3)
                          .map((enrollment: any) => (
                            <PendingRow
                              key={enrollment.id}
                              enrollment={enrollment}
                            />
                          ))}
                        {pendingEnrollments.length > 3 && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDetailClass(cls)}
                          >
                            Xem thêm {pendingEnrollments.length - 3} yêu cầu
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {list.length === 0 && (
              <div
                style={{
                  gridColumn: "1/-1",
                  textAlign: "center",
                  padding: "60px 0",
                  color: "var(--text-muted)",
                }}
              >
                <Users
                  size={40}
                  style={{
                    margin: "0 auto 12px",
                    opacity: 0.3,
                    display: "block",
                  }}
                />
                <p>Chưa được phân công lớp nào</p>
              </div>
            )}
          </div>
        )}
      </div>
      {detailClass && (
        <ClassDetailModal
          cls={detailClass}
          onClose={() => setDetailClass(null)}
        />
      )}
    </div>
  );
}
