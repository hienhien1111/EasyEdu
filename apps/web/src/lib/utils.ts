import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date, format = "dd/MM/yyyy"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return format
    .replace("dd", day)
    .replace("MM", month)
    .replace("yyyy", String(year))
    .replace("HH", hour)
    .replace("mm", min);
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const DAY_LABELS: Record<string, string> = {
  MON: "Thứ 2",
  TUE: "Thứ 3",
  WED: "Thứ 4",
  THU: "Thứ 5",
  FRI: "Thứ 6",
  SAT: "Thứ 7",
  SUN: "Chủ nhật",
};

export const ATTENDANCE_LABELS: Record<string, string> = {
  NOT_PRESENT: "Chưa có mặt",
  PRESENT: "Có mặt",
  ABSENT_EXCUSED: "Vắng có phép",
  ABSENT_UNEXCUSED: "Vắng không phép",
  MAKEUP: "Học bù",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Quản trị viên",
  TEACHER: "Giáo viên",
  STUDENT: "Học sinh",
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Hoạt động",
  LOCKED: "Đã khóa",
  PENDING_APPROVAL: "Chờ duyệt",
  PENDING: "Chờ xử lý",
  APPROVED: "Đã duyệt",
  REMOVED: "Đã xóa",
  CANCELLED: "Đã hủy",
  SUCCESS: "Thành công",
  FAILED: "Thất bại",
  PAID: "Đã thanh toán",
  PARTIALLY_PAID: "Thanh toán một phần",
  ISSUED: "Đã xuất",
  DRAFT: "Nháp",
  OVERDUE: "Quá hạn",
  REQUESTED: "Đã yêu cầu",
  CHECKING: "Đang kiểm tra",
  CONFIRMED: "Đã xác nhận",
  NOT_RECEIVED: "Chưa nhận tiền",
  NEEDS_MANUAL_REVIEW: "Cần xác minh",
  RESOLVED_AUTO: "Tự động xác nhận",
  RESOLVED_MANUAL: "Duyệt thủ công",
  CLOSED: "Đã đóng",
  REJECTED: "Từ chối",
  FINALIZED: "Đã chốt",
  NEEDS_PAYMENT: "Cần thanh toán",
  SENT: "Đã gửi",
  SCHEDULED: "Hẹn giờ",
};

export function getStatusBadgeClass(status: string): string {
  const success = [
    "ACTIVE",
    "APPROVED",
    "SUCCESS",
    "PAID",
    "CONFIRMED",
    "FINALIZED",
    "SENT",
    "PRESENT",
    "RESOLVED_AUTO",
    "RESOLVED_MANUAL",
  ];
  const error = ["LOCKED", "REMOVED", "FAILED", "OVERDUE", "ABSENT_UNEXCUSED"];
  const warn = [
    "PENDING",
    "PENDING_APPROVAL",
    "PARTIALLY_PAID",
    "SCHEDULED",
    "ABSENT_EXCUSED",
    "NOT_PRESENT",
    "REQUESTED",
    "CHECKING",
    "NEEDS_MANUAL_REVIEW",
    "NEEDS_PAYMENT",
  ];
  const info = ["MAKEUP", "ISSUED", "DRAFT", "NOT_RECEIVED", "REJECTED", "CLOSED"];

  if (success.includes(status)) return "badge-success";
  if (error.includes(status)) return "badge-error";
  if (warn.includes(status)) return "badge-warn";
  if (info.includes(status)) return "badge-info";
  return "badge-gray";
}
