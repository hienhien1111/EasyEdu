import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import {
  getSessionWindow,
  getWeekStart,
} from '../common/utils/session-time.util';

export const ATTENDANCE_CLOSE_QUEUE = 'attendance-close';

@Injectable()
@Processor(ATTENDANCE_CLOSE_QUEUE)
export class AttendanceCloseProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceCloseProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing job: ${job.name} #${job.id}`);

    const { scheduleId } = job.data;

    // Find all attendance records for this schedule that have no status yet
    // Auto-mark absent students as ABSENT_UNEXCUSED after 24h window
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        class: { include: { enrollments: { where: { status: 'APPROVED' } } } },
        timeSlot: true,
      },
    });

    if (!schedule) {
      this.logger.warn(`Schedule ${scheduleId} not found`);
      return;
    }

    const enrolledStudentIds = schedule.class.enrollments.map(
      (e) => e.studentId,
    );

    // Get existing attendance records for this schedule
    const existing = await this.prisma.attendance.findMany({
      where: { scheduleId },
      select: { studentId: true },
    });
    const existingIds = new Set(existing.map((a) => a.studentId));

    // Find students without attendance record
    const missing = enrolledStudentIds.filter((id) => !existingIds.has(id));

    if (missing.length === 0) {
      this.logger.log(
        `All ${enrolledStudentIds.length} students accounted for schedule ${scheduleId}`,
      );
      return;
    }

    // Keep unfinished students as NOT_PRESENT so the teacher can resolve them.
    const weekStart = getWeekStart();
    const window = getSessionWindow(schedule.timeSlot, weekStart);
    const editDeadlineAt = new Date(
      window.endAt.getTime() + 24 * 60 * 60 * 1000,
    );

    await this.prisma.attendance.createMany({
      data: missing.map((studentId) => ({
        scheduleId,
        classId: schedule.classId,
        teacherId: schedule.teacherId,
        studentId,
        sessionDate: window.sessionDate,
        sessionStartAt: window.startAt,
        sessionEndAt: window.endAt,
        editDeadlineAt,
        savedAt: new Date(),
        status: 'NOT_PRESENT',
        note: 'Tự tạo nhắc nhở sau buổi học',
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Created ${missing.length} NOT_PRESENT reminder record(s) for schedule ${scheduleId}`,
    );
  }
}
