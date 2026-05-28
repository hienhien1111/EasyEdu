import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';

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
      },
    });

    if (!schedule) {
      this.logger.warn(`Schedule ${scheduleId} not found`);
      return;
    }

    const enrolledStudentIds = schedule.class.enrollments.map(e => e.studentId);

    // Get existing attendance records for this schedule
    const existing = await this.prisma.attendance.findMany({
      where: { scheduleId },
      select: { studentId: true },
    });
    const existingIds = new Set(existing.map(a => a.studentId));

    // Find students without attendance record
    const missing = enrolledStudentIds.filter(id => !existingIds.has(id));

    if (missing.length === 0) {
      this.logger.log(`All ${enrolledStudentIds.length} students accounted for schedule ${scheduleId}`);
      return;
    }

    // Auto-mark as ABSENT_UNEXCUSED
    await this.prisma.attendance.createMany({
      data: missing.map(studentId => ({
        scheduleId,
        studentId,
        status: 'ABSENT_UNEXCUSED',
        note: 'Auto-chốt sau 24 giờ',
        isAutoMarked: true,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Auto-marked ${missing.length} students as ABSENT_UNEXCUSED for schedule ${scheduleId}`,
    );
  }
}
