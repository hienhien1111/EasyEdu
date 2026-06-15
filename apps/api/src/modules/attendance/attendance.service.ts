import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  getSessionWindow,
  getWeekStart,
} from '../../common/utils/session-time.util';

const EDIT_GRACE_MS = 24 * 60 * 60 * 1000;
const FINAL_STATUSES = new Set<AttendanceStatus>([
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT_EXCUSED,
  AttendanceStatus.ABSENT_UNEXCUSED,
]);
const MAKEUP_ATTENDANCE_STATUSES = new Set<AttendanceStatus>([
  AttendanceStatus.NOT_PRESENT,
  AttendanceStatus.PRESENT,
]);

export interface AttendanceRecordInput {
  studentId: string;
  status: AttendanceStatus;
  note?: string;
  makeupSourceId?: string;
}

export interface SaveAttendanceInput {
  scheduleId?: string;
  weeklyOverrideId?: string;
  sessionDate?: string;
  records: AttendanceRecordInput[];
}

export interface QuickMarkNotPresentInput {
  scheduleId?: string;
  weeklyOverrideId?: string;
  sessionDate: string;
  status: AttendanceStatus;
}

export interface AddMakeupStudentInput {
  scheduleId?: string;
  weeklyOverrideId?: string;
  sessionDate?: string;
  makeupSourceId: string;
  note?: string;
}

export interface CancelMakeupStudentInput {
  scheduleId?: string;
  weeklyOverrideId?: string;
  sessionDate?: string;
  makeupSourceId: string;
}

type SessionRef = {
  scheduleId: string | null;
  weeklyOverrideId: string | null;
  classId: string;
  teacherId: string;
  class: any;
  room: any;
  timeSlot: any;
  sessionDate: Date;
  sessionStartAt: Date;
  sessionEndAt: Date;
};

// Backward-compatible helper for older callers/tests.
export function isWithinEditWindow(
  savedAt: Date | null,
  editDeadlineAt?: Date | null,
): boolean {
  if (editDeadlineAt) return Date.now() <= editDeadlineAt.getTime();
  if (!savedAt) return true;
  return Date.now() - savedAt.getTime() < EDIT_GRACE_MS;
}

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async getBySchedule(
    scheduleId: string,
    sessionDate?: string,
    teacherId?: string,
  ) {
    const ref = await this.resolveSessionRef(
      { scheduleId, sessionDate },
      teacherId,
    );
    return this.buildSessionPayload(ref);
  }

  async getCurrentSessions(teacherId: string) {
    const refs = await this.getTeacherWeekSessionRefs(teacherId);
    const now = new Date();
    const currentRefs = refs.filter(
      (ref) => now >= ref.sessionStartAt && now <= ref.sessionEndAt,
    );

    return Promise.all(currentRefs.map((ref) => this.buildSessionPayload(ref)));
  }

  async saveAttendance(dto: SaveAttendanceInput, teacherId: string) {
    if (!dto.records?.length) {
      throw new BadRequestException('Danh sách điểm danh không được để trống');
    }

    const ref = await this.resolveSessionRef(dto, teacherId);
    const now = new Date();
    if (now < ref.sessionStartAt) {
      throw new BadRequestException(
        'Chỉ được điểm danh khi buổi học đã đến giờ bắt đầu',
      );
    }

    const initialDeadline = new Date(
      ref.sessionEndAt.getTime() + EDIT_GRACE_MS,
    );
    if (now > initialDeadline) {
      throw new BadRequestException('Buổi học đã quá thời hạn điểm danh');
    }

    const existingFirst = await this.prisma.attendance.findFirst({
      where: this.sessionWhere(ref),
      orderBy: { savedAt: 'asc' },
    });

    if (existingFirst?.isLocked) {
      throw new BadRequestException('Điểm danh của buổi học này đã bị khóa');
    }

    const savedAt = existingFirst?.savedAt ?? now;
    const editDeadlineAt =
      existingFirst?.editDeadlineAt ?? this.calculateEditDeadline(savedAt, ref);

    if (now > editDeadlineAt) {
      await this.lockSession(ref);
      throw new BadRequestException('Đã quá thời hạn chỉnh sửa điểm danh');
    }

    const approvedStudentIds = new Set(
      (ref.class?.enrollments ?? []).map(
        (enrollment: any) => enrollment.studentId,
      ),
    );
    const existingRecords = await this.prisma.attendance.findMany({
      where: this.sessionWhere(ref),
    });
    const existingRecordByStudentId = new Map(
      existingRecords.map((record) => [record.studentId, record]),
    );

    const records = await Promise.all(
      dto.records.map(async (record) => {
        const existingRecord = existingRecordByStudentId.get(record.studentId);
        const makeupSourceId =
          record.makeupSourceId ?? existingRecord?.makeupSourceId ?? undefined;

        if (makeupSourceId) {
          await this.assertValidMakeupSource(
            makeupSourceId,
            ref,
            record.studentId,
          );
          if (!MAKEUP_ATTENDANCE_STATUSES.has(record.status)) {
            throw new BadRequestException(
              'Học sinh học bù chỉ có thể Hủy hoặc chấm Có mặt',
            );
          }
          return {
            ...record,
            makeupSourceId,
          };
        }

        if (!approvedStudentIds.has(record.studentId)) {
          throw new BadRequestException(
            'Học sinh không thuộc lớp hoặc chưa được duyệt',
          );
        }

        return record;
      }),
    );

    await this.prisma.$transaction(
      records.map((record) =>
        this.prisma.attendance.upsert({
          where: this.uniqueAttendanceWhere(ref, record.studentId) as any,
          update: {
            status: record.status,
            note: record.note,
            ...(record.makeupSourceId !== undefined && {
              makeupSourceId: record.makeupSourceId,
            }),
            classId: ref.classId,
            teacherId: ref.teacherId,
            weeklyOverrideId: ref.weeklyOverrideId,
            sessionStartAt: ref.sessionStartAt,
            sessionEndAt: ref.sessionEndAt,
            savedAt,
            editDeadlineAt,
            isLocked: false,
          },
          create: {
            scheduleId: ref.scheduleId,
            weeklyOverrideId: ref.weeklyOverrideId,
            classId: ref.classId,
            teacherId: ref.teacherId,
            studentId: record.studentId,
            sessionDate: ref.sessionDate,
            sessionStartAt: ref.sessionStartAt,
            sessionEndAt: ref.sessionEndAt,
            status: record.status,
            note: record.note,
            makeupSourceId: record.makeupSourceId,
            savedAt,
            editDeadlineAt,
          },
        }),
      ),
    );

    const notPresentStudents = await this.prisma.attendance.findMany({
      where: {
        ...this.sessionWhere(ref),
        status: AttendanceStatus.NOT_PRESENT,
      },
      include: { student: { include: { profile: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      message: 'Đã lưu điểm danh thành công',
      session: await this.buildSessionPayload(ref),
      notPresentStudents: notPresentStudents.map((record) =>
        this.sanitizeAttendanceRecord(record),
      ),
    };
  }

  async myHistory(studentId: string) {
    return this.prisma.attendance.findMany({
      where: { studentId },
      include: {
        class: true,
        schedule: { include: { class: true, room: true, timeSlot: true } },
        weeklyOverride: {
          include: { class: true, room: true, timeSlot: true },
        },
      },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getPendingAutoClose() {
    const now = new Date();
    return this.prisma.attendance.findMany({
      where: {
        isLocked: false,
        editDeadlineAt: { lt: now },
      },
    });
  }

  async getEligibleMakeup(classId: string) {
    if (!classId) throw new BadRequestException('classId là bắt buộc');

    const targetClass = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        enrollments: {
          where: { status: 'APPROVED' },
          select: { studentId: true },
        },
      },
    });
    if (!targetClass) throw new NotFoundException('Không tìm thấy lớp học');

    const [usedMakeupSources, records] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { makeupSourceId: { not: null } },
        select: { makeupSourceId: true },
      }),
      this.prisma.attendance.findMany({
        where: {
          classId: { not: classId },
          class: { subject: targetClass.subject },
          status: AttendanceStatus.ABSENT_EXCUSED,
        },
        include: {
          student: { include: { profile: true } },
          class: true,
          schedule: { include: { class: true, timeSlot: true } },
          weeklyOverride: { include: { class: true, timeSlot: true } },
        },
        orderBy: [{ sessionDate: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const usedMakeupSourceIds = new Set(
      usedMakeupSources.map((record) => record.makeupSourceId).filter(Boolean),
    );

    return records
      .filter((record) => !usedMakeupSourceIds.has(record.id))
      .map((record) => this.sanitizeAttendanceRecord(record));
  }

  async addMakeupStudent(dto: AddMakeupStudentInput, teacherId: string) {
    if (!dto.makeupSourceId) {
      throw new BadRequestException('Thiếu buổi vắng phép cần học bù');
    }

    const ref = await this.resolveSessionRef(dto, teacherId);
    const now = new Date();
    if (now < ref.sessionStartAt) {
      throw new BadRequestException(
        'Chỉ được thêm học sinh học bù khi buổi học đã bắt đầu',
      );
    }

    const editDeadlineAt = new Date(ref.sessionEndAt.getTime() + EDIT_GRACE_MS);
    if (now > editDeadlineAt) {
      throw new BadRequestException('Buổi học đã quá thời hạn điểm danh');
    }
    await this.assertSessionEditable(ref);

    const source = await this.assertValidMakeupSource(dto.makeupSourceId, ref);
    const existing = await this.prisma.attendance.findUnique({
      where: this.uniqueAttendanceWhere(ref, source.studentId) as any,
    });
    if (existing && existing.makeupSourceId !== source.id) {
      throw new ConflictException(
        'Học sinh đã có điểm danh trong buổi học này',
      );
    }

    const attendance = await this.prisma.attendance.upsert({
      where: this.uniqueAttendanceWhere(ref, source.studentId) as any,
      update: {
        status:
          existing && MAKEUP_ATTENDANCE_STATUSES.has(existing.status)
            ? existing.status
            : AttendanceStatus.NOT_PRESENT,
        makeupSourceId: source.id,
        note: dto.note,
        classId: ref.classId,
        teacherId: ref.teacherId,
        weeklyOverrideId: ref.weeklyOverrideId,
        sessionStartAt: ref.sessionStartAt,
        sessionEndAt: ref.sessionEndAt,
        savedAt: existing?.savedAt ?? now,
        editDeadlineAt:
          existing?.editDeadlineAt ?? this.calculateEditDeadline(now, ref),
        isLocked: false,
      },
      create: {
        scheduleId: ref.scheduleId,
        weeklyOverrideId: ref.weeklyOverrideId,
        classId: ref.classId,
        teacherId: ref.teacherId,
        studentId: source.studentId,
        sessionDate: ref.sessionDate,
        sessionStartAt: ref.sessionStartAt,
        sessionEndAt: ref.sessionEndAt,
        status: AttendanceStatus.NOT_PRESENT,
        makeupSourceId: source.id,
        note: dto.note,
        savedAt: now,
        editDeadlineAt: this.calculateEditDeadline(now, ref),
      },
      include: { student: { include: { profile: true } } },
    });

    return {
      message: 'Đã thêm học sinh học bù',
      attendance: this.sanitizeAttendanceRecord(attendance),
      session: await this.buildSessionPayload(ref),
    };
  }

  async cancelMakeupStudent(dto: CancelMakeupStudentInput, teacherId: string) {
    if (!dto.makeupSourceId) {
      throw new BadRequestException('Thiếu buổi vắng phép cần hủy học bù');
    }

    const ref = await this.resolveSessionRef(dto, teacherId);
    await this.assertSessionEditable(ref);

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        ...this.sessionWhere(ref),
        makeupSourceId: dto.makeupSourceId,
      },
    });
    if (!attendance) {
      throw new NotFoundException(
        'Không tìm thấy học sinh học bù trong buổi này',
      );
    }

    const approvedStudentIds = new Set(
      (ref.class?.enrollments ?? []).map(
        (enrollment: any) => enrollment.studentId,
      ),
    );

    if (approvedStudentIds.has(attendance.studentId)) {
      await this.prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          makeupSourceId: null,
        },
      });
    } else {
      await this.prisma.attendance.delete({ where: { id: attendance.id } });
    }

    return {
      message: 'Đã hủy học bù cho học sinh',
      session: await this.buildSessionPayload(ref),
    };
  }

  async getLegacyEligibleMakeup(classId: string) {
    const records = await this.prisma.attendance.findMany({
      where: {
        classId,
        status: AttendanceStatus.ABSENT_EXCUSED,
      },
      include: {
        student: { include: { profile: true } },
        class: true,
        schedule: { include: { class: true, timeSlot: true } },
        weeklyOverride: { include: { class: true, timeSlot: true } },
      },
    });

    return records.map((record) => this.sanitizeAttendanceRecord(record));
  }

  async getSessions(classId: string, teacherId?: string) {
    if (!classId) throw new BadRequestException('classId là bắt buộc');
    return this.getTeachingHistory(teacherId, { classId });
  }

  async getTeachingHistory(
    teacherId?: string,
    filters: { classId?: string; status?: string; search?: string } = {},
  ) {
    const records = await this.prisma.attendance.findMany({
      where: {
        ...(teacherId && { teacherId }),
        ...(filters.classId && { classId: filters.classId }),
        ...(filters.status &&
          filters.status !== 'ALL' && {
            status: filters.status as AttendanceStatus,
          }),
        ...(filters.search && {
          student: {
            profile: {
              is: {
                fullName: { contains: filters.search, mode: 'insensitive' },
              },
            },
          },
        }),
      },
      include: this.attendanceInclude(),
      orderBy: [{ sessionStartAt: 'desc' }, { createdAt: 'asc' }],
    });

    return this.groupRecordsBySession(records);
  }

  async getUnresolvedNotPresent(teacherId: string) {
    const now = new Date();
    const records = await this.prisma.attendance.findMany({
      where: {
        teacherId,
        status: AttendanceStatus.NOT_PRESENT,
        isLocked: false,
        sessionEndAt: { lt: now },
        OR: [{ editDeadlineAt: null }, { editDeadlineAt: { gt: now } }],
      },
      include: this.attendanceInclude(),
      orderBy: [{ sessionEndAt: 'asc' }, { createdAt: 'asc' }],
    });

    return this.groupRecordsBySession(records);
  }

  async quickMarkNotPresent(dto: QuickMarkNotPresentInput, teacherId: string) {
    if (!FINAL_STATUSES.has(dto.status)) {
      throw new BadRequestException('Trạng thái điểm danh nhanh không hợp lệ');
    }

    const ref = await this.resolveSessionRef(dto, teacherId);
    await this.assertSessionEditable(ref);

    const result = await this.prisma.attendance.updateMany({
      where: {
        ...this.sessionWhere(ref),
        status: AttendanceStatus.NOT_PRESENT,
      },
      data: { status: dto.status },
    });

    return {
      message: `Đã cập nhật ${result.count} học sinh`,
      count: result.count,
    };
  }

  async updateRecord(
    id: string,
    body: { status?: string; note?: string },
    teacherId?: string,
  ) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy bản ghi');
    if (teacherId && record.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bản ghi này');
    }
    await this.assertRecordEditable(record);

    if (
      body.status &&
      !Object.values(AttendanceStatus).includes(body.status as AttendanceStatus)
    ) {
      throw new BadRequestException('Trạng thái điểm danh không hợp lệ');
    }
    if (
      record.makeupSourceId &&
      body.status &&
      !MAKEUP_ATTENDANCE_STATUSES.has(body.status as AttendanceStatus)
    ) {
      throw new BadRequestException(
        'Học sinh học bù chỉ có thể Hủy hoặc chấm Có mặt',
      );
    }

    return this.prisma.attendance.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status as AttendanceStatus }),
        ...(body.note !== undefined && { note: body.note }),
      },
    });
  }

  private attendanceInclude() {
    return {
      class: true,
      student: { include: { profile: true } },
      schedule: { include: { class: true, room: true, timeSlot: true } },
      weeklyOverride: { include: { class: true, room: true, timeSlot: true } },
    } as const;
  }

  private async resolveSessionRef(
    input: {
      scheduleId?: string;
      weeklyOverrideId?: string;
      sessionDate?: string;
    },
    teacherId?: string,
  ): Promise<SessionRef> {
    if (!input.scheduleId && !input.weeklyOverrideId) {
      throw new BadRequestException('Thiếu buổi học cần điểm danh');
    }

    if (input.weeklyOverrideId && !input.scheduleId) {
      return this.resolveWeeklyOverrideSession(
        input.weeklyOverrideId,
        teacherId,
      );
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { id: input.scheduleId },
      include: {
        class: {
          include: {
            enrollments: {
              where: { status: 'APPROVED' },
              include: { student: { include: { profile: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        room: true,
        timeSlot: true,
      },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy buổi học');
    if (teacherId && schedule.teacherId !== teacherId) {
      throw new BadRequestException('Bạn không có quyền điểm danh lớp này');
    }

    const referenceDate = input.sessionDate
      ? new Date(input.sessionDate)
      : new Date();
    const weekStart = getWeekStart(referenceDate);
    const override = await this.prisma.scheduleWeeklyOverride.findUnique({
      where: {
        scheduleId_weekStart: {
          scheduleId: schedule.id,
          weekStart,
        },
      },
      include: { room: true, timeSlot: true },
    });

    const room = override?.room ?? schedule.room;
    const timeSlot = override?.timeSlot ?? schedule.timeSlot;
    const window = getSessionWindow(timeSlot, weekStart);

    return {
      scheduleId: schedule.id,
      weeklyOverrideId: override?.id ?? null,
      classId: schedule.classId,
      teacherId: schedule.teacherId,
      class: schedule.class,
      room,
      timeSlot,
      sessionDate: window.sessionDate,
      sessionStartAt: window.startAt,
      sessionEndAt: window.endAt,
    };
  }

  private async resolveWeeklyOverrideSession(
    weeklyOverrideId: string,
    teacherId?: string,
  ): Promise<SessionRef> {
    const override = await this.prisma.scheduleWeeklyOverride.findUnique({
      where: { id: weeklyOverrideId },
      include: {
        class: {
          include: {
            enrollments: {
              where: { status: 'APPROVED' },
              include: { student: { include: { profile: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        schedule: {
          include: {
            class: {
              include: {
                enrollments: {
                  where: { status: 'APPROVED' },
                  include: { student: { include: { profile: true } } },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
        room: true,
        timeSlot: true,
      },
    });
    if (!override) throw new NotFoundException('Không tìm thấy buổi học');
    if (teacherId && override.teacherId !== teacherId) {
      throw new BadRequestException('Bạn không có quyền điểm danh lớp này');
    }

    const cls = override.class ?? override.schedule?.class;
    if (!cls)
      throw new NotFoundException('Không tìm thấy lớp học của buổi này');
    const window = getSessionWindow(override.timeSlot, override.weekStart);

    return {
      scheduleId: override.scheduleId ?? null,
      weeklyOverrideId: override.id,
      classId: cls.id,
      teacherId: override.teacherId,
      class: cls,
      room: override.room,
      timeSlot: override.timeSlot,
      sessionDate: window.sessionDate,
      sessionStartAt: window.startAt,
      sessionEndAt: window.endAt,
    };
  }

  private async getTeacherWeekSessionRefs(teacherId: string) {
    const weekStart = getWeekStart();
    const [schedules, overrides] = await Promise.all([
      this.prisma.schedule.findMany({
        where: { teacherId, type: 'REGULAR' },
        include: {
          class: {
            include: {
              enrollments: {
                where: { status: 'APPROVED' },
                include: { student: { include: { profile: true } } },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
          room: true,
          timeSlot: true,
        },
      }),
      this.prisma.scheduleWeeklyOverride.findMany({
        where: { teacherId, weekStart },
        include: {
          class: {
            include: {
              enrollments: {
                where: { status: 'APPROVED' },
                include: { student: { include: { profile: true } } },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
          schedule: {
            include: {
              class: {
                include: {
                  enrollments: {
                    where: { status: 'APPROVED' },
                    include: { student: { include: { profile: true } } },
                    orderBy: { createdAt: 'asc' },
                  },
                },
              },
            },
          },
          room: true,
          timeSlot: true,
        },
      }),
    ]);

    const overrideByScheduleId = new Map<string, (typeof overrides)[number]>();
    const newSessions: typeof overrides = [];
    for (const override of overrides) {
      if (override.scheduleId)
        overrideByScheduleId.set(override.scheduleId, override);
      else newSessions.push(override);
    }

    const refs: SessionRef[] = schedules.map((schedule) => {
      const override = overrideByScheduleId.get(schedule.id);
      const room = override?.room ?? schedule.room;
      const timeSlot = override?.timeSlot ?? schedule.timeSlot;
      const window = getSessionWindow(timeSlot, weekStart);
      return {
        scheduleId: schedule.id,
        weeklyOverrideId: override?.id ?? null,
        classId: schedule.classId,
        teacherId: schedule.teacherId,
        class: schedule.class,
        room,
        timeSlot,
        sessionDate: window.sessionDate,
        sessionStartAt: window.startAt,
        sessionEndAt: window.endAt,
      };
    });

    for (const override of newSessions) {
      const cls = override.class ?? override.schedule?.class;
      if (!cls) continue;
      const window = getSessionWindow(override.timeSlot, weekStart);
      refs.push({
        scheduleId: null,
        weeklyOverrideId: override.id,
        classId: cls.id,
        teacherId: override.teacherId,
        class: cls,
        room: override.room,
        timeSlot: override.timeSlot,
        sessionDate: window.sessionDate,
        sessionStartAt: window.startAt,
        sessionEndAt: window.endAt,
      });
    }

    return refs;
  }

  private async buildSessionPayload(ref: SessionRef) {
    const attendances = await this.prisma.attendance.findMany({
      where: this.sessionWhere(ref),
      include: { student: { include: { profile: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const attendanceMap = new Map(
      attendances.map((attendance) => [attendance.studentId, attendance]),
    );
    const makeupSourceIds = attendances
      .map((attendance) => attendance.makeupSourceId)
      .filter(Boolean) as string[];
    const makeupSources = makeupSourceIds.length
      ? await this.prisma.attendance.findMany({
          where: { id: { in: makeupSourceIds } },
          include: {
            student: { include: { profile: true } },
            class: true,
            schedule: { include: { class: true, room: true, timeSlot: true } },
            weeklyOverride: {
              include: { class: true, room: true, timeSlot: true },
            },
          },
        })
      : [];
    const makeupSourceById = new Map(
      makeupSources.map((source) => [source.id, source]),
    );
    const enrolledStudentIds = new Set(
      (ref.class?.enrollments ?? []).map(
        (enrollment: any) => enrollment.studentId,
      ),
    );
    const savedAt = attendances[0]?.savedAt ?? null;
    const editDeadlineAt = attendances[0]?.editDeadlineAt ?? null;
    const now = new Date();
    const enrolledStudents = (ref.class?.enrollments ?? []).map(
      (enrollment: any) => {
        const attendance = attendanceMap.get(enrollment.studentId) ?? null;
        const makeupSource = attendance?.makeupSourceId
          ? makeupSourceById.get(attendance.makeupSourceId)
          : null;
        return {
          studentId: enrollment.studentId,
          fullName: enrollment.student?.profile?.fullName,
          student: this.sanitizeUser(enrollment.student),
          attendance: attendance
            ? this.sanitizeAttendanceRecord(attendance)
            : null,
          status: attendance?.makeupSourceId
            ? this.normalizeMakeupAttendanceStatus(attendance.status)
            : (attendance?.status ?? AttendanceStatus.NOT_PRESENT),
          note: attendance?.note ?? '',
          isMakeup: !!attendance?.makeupSourceId,
          makeupSourceId: attendance?.makeupSourceId ?? null,
          makeupSource: makeupSource
            ? this.sanitizeAttendanceRecord(makeupSource)
            : null,
        };
      },
    );
    const makeupStudents = attendances
      .filter(
        (attendance) =>
          attendance.makeupSourceId &&
          !enrolledStudentIds.has(attendance.studentId),
      )
      .map((attendance) => {
        const makeupSource = makeupSourceById.get(attendance.makeupSourceId!);
        const fullName = attendance.student?.profile?.fullName;
        return {
          studentId: attendance.studentId,
          fullName,
          student: this.sanitizeUser(attendance.student),
          attendance: this.sanitizeAttendanceRecord(attendance),
          status: this.normalizeMakeupAttendanceStatus(attendance.status),
          note: attendance.note ?? '',
          isMakeup: true,
          makeupSourceId: attendance.makeupSourceId,
          makeupSource: makeupSource
            ? this.sanitizeAttendanceRecord(makeupSource)
            : null,
        };
      });

    return {
      id: ref.scheduleId ?? ref.weeklyOverrideId,
      scheduleId: ref.scheduleId,
      weeklyOverrideId: ref.weeklyOverrideId,
      classId: ref.classId,
      class: this.sanitizeClass(ref.class),
      room: ref.room,
      timeSlot: ref.timeSlot,
      sessionDate: ref.sessionDate,
      sessionStartAt: ref.sessionStartAt,
      sessionEndAt: ref.sessionEndAt,
      isStarted: now >= ref.sessionStartAt,
      isEnded: now > ref.sessionEndAt,
      savedAt,
      editDeadlineAt,
      canEdit: editDeadlineAt
        ? now <= editDeadlineAt
        : now <= new Date(ref.sessionEndAt.getTime() + EDIT_GRACE_MS),
      students: [...enrolledStudents, ...makeupStudents],
    };
  }

  private groupRecordsBySession(records: any[]) {
    const sessions = new Map<string, any>();
    const now = new Date();

    for (const record of records) {
      const key = `${record.scheduleId ?? 'extra'}:${record.weeklyOverrideId ?? 'base'}:${record.sessionDate.toISOString()}`;
      if (!sessions.has(key)) {
        const room =
          record.weeklyOverride?.room ?? record.schedule?.room ?? null;
        const timeSlot =
          record.weeklyOverride?.timeSlot ?? record.schedule?.timeSlot ?? null;
        const editDeadlineAt = record.editDeadlineAt ?? null;
        sessions.set(key, {
          key,
          scheduleId: record.scheduleId,
          weeklyOverrideId: record.weeklyOverrideId,
          classId: record.classId,
          class: this.sanitizeClass(
            record.class ??
              record.schedule?.class ??
              record.weeklyOverride?.class,
          ),
          room,
          timeSlot,
          sessionDate: record.sessionDate,
          sessionStartAt: record.sessionStartAt,
          sessionEndAt: record.sessionEndAt,
          savedAt: record.savedAt,
          editDeadlineAt,
          canEdit:
            !record.isLocked &&
            (!editDeadlineAt || now <= new Date(editDeadlineAt)),
          records: [],
        });
      }

      const session = sessions.get(key);
      if (record.editDeadlineAt && !session.editDeadlineAt) {
        session.editDeadlineAt = record.editDeadlineAt;
      }
      session.records.push(this.sanitizeAttendanceRecord(record));
      if (
        record.isLocked ||
        (record.editDeadlineAt && now > record.editDeadlineAt)
      ) {
        session.canEdit = false;
      }
    }

    return Array.from(sessions.values()).sort(
      (a, b) =>
        new Date(b.sessionStartAt ?? b.sessionDate).getTime() -
        new Date(a.sessionStartAt ?? a.sessionDate).getTime(),
    );
  }

  private sessionWhere(ref: SessionRef) {
    const identity = ref.scheduleId
      ? { scheduleId: ref.scheduleId }
      : { weeklyOverrideId: ref.weeklyOverrideId };
    return {
      ...identity,
      sessionDate: ref.sessionDate,
    };
  }

  private async assertValidMakeupSource(
    makeupSourceId: string,
    ref: SessionRef,
    studentId?: string,
  ) {
    const source = await this.prisma.attendance.findUnique({
      where: { id: makeupSourceId },
      include: {
        student: { include: { profile: true } },
        class: true,
        schedule: { include: { class: true, room: true, timeSlot: true } },
        weeklyOverride: {
          include: { class: true, room: true, timeSlot: true },
        },
      },
    });
    if (!source) {
      throw new NotFoundException('Không tìm thấy buổi vắng phép để học bù');
    }
    if (source.status !== AttendanceStatus.ABSENT_EXCUSED) {
      throw new BadRequestException(
        'Chỉ buổi vắng phép mới được dùng để học bù',
      );
    }
    if (studentId && source.studentId !== studentId) {
      throw new BadRequestException('Buổi vắng phép không thuộc học sinh này');
    }
    if (source.classId === ref.classId) {
      throw new BadRequestException(
        'Học bù phải được thực hiện ở lớp khác lớp vắng phép',
      );
    }
    if (source.class?.subject !== ref.class?.subject) {
      throw new BadRequestException('Chỉ được học bù ở lớp có cùng môn học');
    }

    const usedRecords = await this.prisma.attendance.findMany({
      where: { makeupSourceId },
      select: {
        id: true,
        studentId: true,
        scheduleId: true,
        weeklyOverrideId: true,
        sessionDate: true,
      },
    });
    const alreadyUsedElsewhere = usedRecords.some(
      (record) =>
        record.studentId !== source.studentId ||
        record.scheduleId !== ref.scheduleId ||
        record.weeklyOverrideId !== ref.weeklyOverrideId ||
        record.sessionDate.getTime() !== ref.sessionDate.getTime(),
    );
    if (alreadyUsedElsewhere) {
      throw new ConflictException('Buổi vắng phép này đã được học bù');
    }

    return source;
  }

  private normalizeMakeupAttendanceStatus(status?: AttendanceStatus | null) {
    return status && MAKEUP_ATTENDANCE_STATUSES.has(status)
      ? status
      : AttendanceStatus.NOT_PRESENT;
  }

  private sanitizeAttendanceRecord(record: any): any {
    if (!record) return record;
    return {
      ...record,
      student: this.sanitizeUser(record.student),
      class: this.sanitizeClass(record.class),
      schedule: record.schedule
        ? {
            ...record.schedule,
            class: this.sanitizeClass(record.schedule.class),
          }
        : record.schedule,
      weeklyOverride: record.weeklyOverride
        ? {
            ...record.weeklyOverride,
            class: this.sanitizeClass(record.weeklyOverride.class),
          }
        : record.weeklyOverride,
      makeupSource: record.makeupSource
        ? this.sanitizeAttendanceRecord(record.makeupSource)
        : record.makeupSource,
    };
  }

  private sanitizeClass(cls: any) {
    if (!cls) return cls;
    return {
      ...cls,
      enrollments: Array.isArray(cls.enrollments)
        ? cls.enrollments.map((enrollment: any) => ({
            ...enrollment,
            student: this.sanitizeUser(enrollment.student),
          }))
        : cls.enrollments,
    };
  }

  private sanitizeUser(user: any) {
    if (!user) return user;
    const {
      passwordHash: _passwordHash,
      rememberToken: _rememberToken,
      failedLoginCount: _failedLoginCount,
      lockedUntil: _lockedUntil,
      lockReason: _lockReason,
      ...safeUser
    } = user;
    return safeUser;
  }

  private uniqueAttendanceWhere(ref: SessionRef, studentId: string) {
    if (ref.scheduleId) {
      return {
        scheduleId_studentId_sessionDate: {
          scheduleId: ref.scheduleId,
          studentId,
          sessionDate: ref.sessionDate,
        },
      };
    }

    return {
      weeklyOverrideId_studentId_sessionDate: {
        weeklyOverrideId: ref.weeklyOverrideId,
        studentId,
        sessionDate: ref.sessionDate,
      },
    };
  }

  private calculateEditDeadline(savedAt: Date, ref: SessionRef) {
    return new Date(
      Math.max(savedAt.getTime(), ref.sessionEndAt.getTime()) + EDIT_GRACE_MS,
    );
  }

  private async assertSessionEditable(ref: SessionRef) {
    const record = await this.prisma.attendance.findFirst({
      where: this.sessionWhere(ref),
      orderBy: { savedAt: 'asc' },
    });
    if (!record) return;
    await this.assertRecordEditable(record);
  }

  private async assertRecordEditable(record: {
    id: string;
    isLocked: boolean;
    savedAt: Date | null;
    editDeadlineAt: Date | null;
  }) {
    const deadline =
      record.editDeadlineAt ??
      (record.savedAt
        ? new Date(record.savedAt.getTime() + EDIT_GRACE_MS)
        : null);
    if (record.isLocked || (deadline && Date.now() > deadline.getTime())) {
      await this.prisma.attendance.update({
        where: { id: record.id },
        data: { isLocked: true },
      });
      throw new BadRequestException('Đã quá thời hạn chỉnh sửa điểm danh');
    }
  }

  private async lockSession(ref: SessionRef) {
    await this.prisma.attendance.updateMany({
      where: this.sessionWhere(ref),
      data: { isLocked: true },
    });
  }
}
