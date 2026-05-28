"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Users, BookOpen, X, Loader2, Trash2,
  UserPlus, UserMinus, ChevronLeft, AlertCircle,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api, { getData } from "@/lib/api";
import { formatCurrency, getInitials, getStatusBadgeClass } from "@/lib/utils";

const GRADES = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const SUBJECTS = ["Toán","Văn","Anh văn","Vật lý","Hóa học","Sinh học","Lịch sử","Địa lý","Tin học"];
const SUBJECT_COLORS: Record<string, string> = {
  "Toán": "#6366f1", "Văn": "#f43f5e", "Anh văn": "#10b981",
  "Vật lý": "#f59e0b", "Hóa học": "#22d3ee", "Sinh học": "#a855f7",
  "Lịch sử": "#84cc16", "Địa lý": "#f97316", "Tin học": "#fb923c",
};

/* ─── Class Form Modal ──────────────────────────────────── */
function ClassForm({ cls, teachers, onClose }: { cls?: any; teachers: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: cls?.name ?? "",
    subject: cls?.subject ?? SUBJECTS[0],
    grade: cls?.grade ?? "6",
    teacherId: cls?.teacherId ?? teachers[0]?.id ?? "",
    maxStudents: cls?.maxStudents ?? 20,
    tuitionPerSession: cls?.tuitionPerSession ?? 100000,
    description: cls?.description ?? "",
  });
  const [err, setErr] = useState("");

  const mut = useMutation({
    mutationFn: (data: any) => cls ? api.patch(`/classes/${cls.id}`, data) : api.post("/classes", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["classes"] }); onClose(); },
    onError: (e: any) => setErr(e.response?.data?.message || "Thao tác thất bại"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
            {cls ? "Chỉnh sửa lớp học" : "Tạo lớp học mới"}
          </h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        {err && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#f43f5e" }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Tên lớp</label>
            <input className="input" placeholder="VD: Toán 6.1" value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Môn học</label>
            <select className="input" value={form.subject}
              onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Khối lớp</label>
            <select className="input" value={form.grade}
              onChange={(e) => setForm(f => ({ ...f, grade: e.target.value }))}>
              {GRADES.map(g => <option key={g} value={g}>Khối {g}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Giáo viên phụ trách</label>
            <select className="input" value={form.teacherId}
              onChange={(e) => setForm(f => ({ ...f, teacherId: e.target.value }))}>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.profile?.fullName ?? t.username}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Sĩ số tối đa</label>
            <input className="input" type="number" min={1} max={50} value={form.maxStudents}
              onChange={(e) => setForm(f => ({ ...f, maxStudents: +e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Học phí / buổi (VNĐ)</label>
            <input className="input" type="number" min={0} step={10000} value={form.tuitionPerSession}
              onChange={(e) => setForm(f => ({ ...f, tuitionPerSession: +e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Mô tả</label>
            <textarea className="input" rows={2} placeholder="Mô tả lớp học..." value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Hủy</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={mut.isPending}
            onClick={() => mut.mutate(form)}>
            {mut.isPending ? <><Loader2 size={14} className="animate-spin-slow" /> Đang lưu...</> : cls ? "Cập nhật" : "Tạo lớp"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Add Student Modal ─────────────────────────────────── */
function AddStudentModal({ cls, onClose }: { cls: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");

  // All students — no status filter so all STUDENT accounts appear
  const { data: studentsData } = useQuery({
    queryKey: ["students-picker", search],
    queryFn: () =>
      api.get("/users", { params: { role: "STUDENT", search, limit: 50 } })
        .then(r => getData<any>(r)),
  });

  // Current enrollments for this class
  const { data: enrollments } = useQuery({
    queryKey: ["enrollments-class", cls.id],
    queryFn: () => api.get(`/enrollments/class/${cls.id}`).then(r => getData<any[]>(r)),
  });

  const enrolledIds = useMemo(() => {
    const list: any[] = Array.isArray(enrollments) ? enrollments : [];
    return new Set(list.filter(e => e.status === "APPROVED").map((e: any) => e.studentId));
  }, [enrollments]);

  const allStudents: any[] = Array.isArray(studentsData?.data) ? studentsData.data : (Array.isArray(studentsData) ? studentsData : []);
  const availableStudents = allStudents.filter(s => !enrolledIds.has(s.id));

  const addMut = useMutation({
    mutationFn: (studentId: string) => api.post("/enrollments/admin-add", { studentId, classId: cls.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments-class", cls.id] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      setErr("");
    },
    onError: (e: any) => setErr(e.response?.data?.message || "Thêm thất bại"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
              Thêm học sinh vào lớp
            </h3>
            <p style={{ fontSize: 12, color: "var(--accent-secondary)", marginTop: 2 }}>{cls.name}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><X size={16} /></button>
        </div>

        {err && (
          <div style={{ display: "flex", gap: 8, background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f43f5e" }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {err}
          </div>
        )}

        <div style={{ position: "relative", marginBottom: 14 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="input" placeholder="Tìm tên, email học sinh..." value={search}
            onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32, fontSize: 13 }} />
        </div>

        <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {availableStudents.length === 0 ? (
            <p style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 }}>
              {search ? "Không tìm thấy kết quả" : "Tất cả học sinh đã trong lớp"}
            </p>
          ) : (
            availableStudents.map((s: any) => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 10,
                background: "var(--bg-secondary)", border: "1px solid var(--border)",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "#f59e0b",
                }}>
                  {getInitials(s.fullName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.fullName ?? "—"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.email}</p>
                </div>
                <button
                  className="btn btn-success btn-sm"
                  disabled={addMut.isPending}
                  onClick={() => addMut.mutate(s.id)}
                  style={{ flexShrink: 0, fontSize: 12, gap: 4 }}
                >
                  <UserPlus size={12} /> Thêm
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm">Đóng</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Class Detail Panel ────────────────────────────────── */
function ClassDetail({ cls, onBack, teachers }: { cls: any; onBack: () => void; teachers: any[] }) {
  const qc = useQueryClient();
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [tab, setTab] = useState<"students" | "info">("students");

  const { data: enrollments, isLoading } = useQuery({
    queryKey: ["enrollments-class", cls.id],
    queryFn: () => api.get(`/enrollments/class/${cls.id}`).then(r => getData<any[]>(r)),
  });

  const removeMut = useMutation({
    mutationFn: (enrollmentId: string) => api.patch(`/enrollments/admin-remove/${enrollmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments-class", cls.id] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });

  const enrollmentList: any[] = Array.isArray(enrollments) ? enrollments : [];
  const approvedEnrollments = enrollmentList.filter((e: any) => e.status === "APPROVED");
  const pendingEnrollments = enrollmentList.filter((e: any) => e.status === "PENDING");

  const color = SUBJECT_COLORS[cls.subject] ?? "#9198c5";

  return (
    <div>
      {/* Back + Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <ChevronLeft size={14} /> Danh sách lớp
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ background: `${color}18`, color, border: `1px solid ${color}30`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {cls.subject} • Khối {cls.grade}
            </span>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{cls.name}</h2>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            GV: {cls.teacherName ?? cls.teacher?.profile?.fullName ?? "—"} · {approvedEnrollments.length}/{cls.maxStudents} học sinh · {formatCurrency(cls.tuitionPerSession)}/buổi
          </p>
        </div>
        <button onClick={() => setShowEdit(true)} className="btn btn-ghost btn-sm">Sửa lớp</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-secondary)", borderRadius: 10, padding: 3, maxWidth: 300 }}>
        {[{ key: "students", label: `Học sinh (${approvedEnrollments.length})` }, { key: "info", label: "Thông tin" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            style={{
              flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none", cursor: "pointer",
              background: tab === t.key ? "var(--bg-card)" : "transparent",
              color: tab === t.key ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.2)" : "none", transition: "all 0.15s",
            }}>{t.label}</button>
        ))}
      </div>

      {tab === "students" && (
        <>
          {/* Pending enrollments alert */}
          {pendingEnrollments.length > 0 && (
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", marginBottom: 8 }}>
                ⏳ {pendingEnrollments.length} yêu cầu đăng ký chờ duyệt
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pendingEnrollments.map((e: any) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)" }}>
                      {e.student?.profile?.fullName ?? "—"} · {e.student?.email}
                    </span>
                    <button
                      className="btn btn-success btn-sm"
                      style={{ fontSize: 11 }}
                      onClick={() => api.patch(`/enrollments/${e.id}/approve`).then(() => qc.invalidateQueries({ queryKey: ["enrollments-class", cls.id] }))}
                    >
                      Duyệt
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ fontSize: 11 }}
                      onClick={() => api.patch(`/enrollments/${e.id}/cancel`).then(() => qc.invalidateQueries({ queryKey: ["enrollments-class", cls.id] }))}
                    >
                      Từ chối
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {approvedEnrollments.length} / {cls.maxStudents} học sinh
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddStudent(true)}>
              <UserPlus size={13} /> Thêm học sinh
            </button>
          </div>

          {/* Students list */}
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 10 }} />)}
            </div>
          ) : approvedEnrollments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
              <Users size={40} style={{ margin: "0 auto 12px", opacity: 0.2, display: "block" }} />
              <p style={{ fontSize: 13 }}>Chưa có học sinh nào trong lớp</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Nhấn "Thêm học sinh" để thêm vào</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Học sinh</th>
                    <th>Email</th>
                    <th>SĐT phụ huynh</th>
                    <th>Ngày thêm</th>
                    <th style={{ textAlign: "right" }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedEnrollments.map((e: any, idx: number) => (
                    <tr key={e.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, color: "#f59e0b",
                          }}>
                            {getInitials(e.student?.profile?.fullName)}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                              {e.student?.profile?.fullName ?? "—"}
                            </p>
                            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>#{idx + 1}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{e.student?.email ?? "—"}</td>
                      <td style={{ fontSize: 12 }}>{e.student?.studentProfile?.guardianPhone ?? "—"}</td>
                      <td style={{ fontSize: 12 }}>
                        {e.approvedAt ? new Date(e.approvedAt).toLocaleDateString("vi-VN") : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-danger btn-sm"
                            title="Xóa khỏi lớp"
                            disabled={removeMut.isPending}
                            onClick={() => {
                              if (confirm(`Xóa ${e.student?.profile?.fullName} khỏi lớp?`))
                                removeMut.mutate(e.id);
                            }}
                          >
                            <UserMinus size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "info" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Môn học", value: cls.subject },
            { label: "Khối", value: `Khối ${cls.grade}` },
            { label: "Học phí / buổi", value: formatCurrency(cls.tuitionPerSession) },
            { label: "Sĩ số tối đa", value: `${cls.maxStudents} học sinh` },
            { label: "Trạng thái", value: cls.isActive ? "Đang hoạt động" : "Đã đóng" },
            { label: "Giáo viên", value: cls.teacherName ?? cls.teacher?.profile?.fullName ?? "—" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 16px" }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{value}</p>
            </div>
          ))}
          {cls.description && (
            <div style={{ gridColumn: "1/-1", background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 16px" }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.4px" }}>Mô tả</p>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{cls.description}</p>
            </div>
          )}
        </div>
      )}

      {showAddStudent && <AddStudentModal cls={cls} onClose={() => setShowAddStudent(false)} />}
      {showEdit && <ClassForm cls={cls} teachers={teachers} onClose={() => setShowEdit(false)} />}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function AdminClassesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedClass, setSelectedClass] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["classes", search],
    queryFn: () => api.get("/classes", { params: { search, limit: 50 } }).then(r => getData<any>(r)),
  });
  const { data: teachersData } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: () => api.get("/users", { params: { role: "TEACHER", limit: 100 } }).then(r => getData<any>(r)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/classes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["classes"] }); setSelectedClass(null); },
  });

  const teachers: any[] = teachersData?.data ?? [];
  const classes: any[] = data?.data ?? [];

  // If a class is selected, show its detail
  if (selectedClass) {
    return (
      <div>
        <Header title="Quản lý Lớp học" subtitle="UC-04 — Chi tiết lớp học" />
        <div style={{ padding: "24px 28px" }} className="animate-fadein">
          <ClassDetail
            cls={selectedClass}
            teachers={teachers}
            onBack={() => setSelectedClass(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Quản lý Lớp học" subtitle="UC-04 — Tạo, phân công GV, quản lý danh sách HS" />
      <div style={{ padding: "24px 28px" }} className="animate-fadein">
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input className="input" placeholder="Tìm tên lớp, môn học..." value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Tạo lớp học
          </button>
        </div>

        {/* Class grid */}
        {isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 160 }} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {classes.map((cls: any) => {
              const color = SUBJECT_COLORS[cls.subject] ?? "#9198c5";
              const pct = Math.round(((cls.studentCount ?? 0) / cls.maxStudents) * 100);
              return (
                <div key={cls.id} className="card"
                  style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
                  onClick={() => setSelectedClass(cls)}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: "inline-block", background: `${color}18`, color, border: `1px solid ${color}30`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                        {cls.subject} • Khối {cls.grade}
                      </span>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{cls.name}</h3>
                      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>GV: {cls.teacherName ?? cls.teacher?.profile?.fullName ?? "—"}</p>
                    </div>
                    <button className="btn btn-danger btn-sm"
                      onClick={(e) => { e.stopPropagation(); if (confirm("Xóa lớp?")) deleteMut.mutate(cls.id); }}
                      style={{ padding: 6 }}><Trash2 size={13} /></button>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11, color: "var(--text-muted)" }}>
                      <span><Users size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {cls.studentCount ?? 0}/{cls.maxStudents} học sinh</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}><BookOpen size={11} style={{ display: "inline", verticalAlign: "middle" }} /> {formatCurrency(cls.tuitionPerSession)}/buổi</span>
                    <span className={`badge ${cls.isActive ? "badge-success" : "badge-gray"}`}>{cls.isActive ? "Hoạt động" : "Đã đóng"}</span>
                  </div>
                </div>
              );
            })}
            {classes.length === 0 && (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                <BookOpen size={40} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
                <p>Chưa có lớp học nào</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showForm && <ClassForm teachers={teachers} onClose={() => setShowForm(false)} />}
    </div>
  );
}
