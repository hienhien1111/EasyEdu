import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  getSessionWindow,
  getWeekEnd,
  getWeekStart,
  hasSessionStarted,
} from '../../common/utils/session-time.util';

export interface CreateTimeSlotInput {
  dayOfWeek: any;
  startTime: string;
  endTime: string;
  label: string;
}

export interface AssignScheduleInput {
  classId: string;
  roomId: string;
  timeSlotId: string;
  teacherId: string;
  effectiveDate?: string;
  endDate?: string;
}

export interface ReportAbsenceInput {
  scheduleId: string;
  reason: string;
}

export interface RegisterMakeupInput {
  cancelledScheduleId: string;
  roomId: string;
  timeSlotId: string;
  weekDate?: string;
}

export interface WeeklyOverrideInput {
  scheduleId: string; // ID lịch REGULAR gốc muốn đổi
  roomId: string;
  timeSlotId: string;
  reason?: string;
}

export interface AddWeeklySessionInput {
  classId: string; // Lớp teacher tự thêm
  roomId: string;
  timeSlotId: string;
  reason?: string;
}

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  // ─── Helper: Tính Thứ 2 đầu tuần hiện tại (00:00:00 UTC) ───────────────
  static getCurrentWeekStart(): Date {
    return getWeekStart();
  }

  static getCurrentWeekEnd(): Date {
    return getWeekEnd();
  }

  // ─── TimeSlots ─────────────────────────────────────────────────────────

  getTimeSlots() {
    return this.prisma.timeSlot.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createTimeSlot(dto: CreateTimeSlotInput) {
    const existing = await this.prisma.timeSlot.findMany({
      where: { dayOfWeek: dto.dayOfWeek },
    });
    const conflict = existing.find(
      (s) => dto.startTime < s.endTime && dto.endTime > s.startTime,
    );
    if (conflict) {
      throw new ConflictException(
        `Khung giờ ${dto.startTime}–${dto.endTime} bị trùng với ${conflict.startTime}–${conflict.endTime} ngày ${conflict.dayOfWeek}`,
      );
    }
    return this.prisma.timeSlot.create({ data: dto });
  }

  async updateTimeSlot(
    id: string,
    body: { startTime?: string; endTime?: string; label?: string },
  ) {
    const slot = await this.prisma.timeSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Không tìm thấy khung giờ');

    const start = body.startTime ?? slot.startTime;
    const end = body.endTime ?? slot.endTime;

    if (start >= end)
      throw new BadRequestException('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');

    const siblings = await this.prisma.timeSlot.findMany({
      where: { dayOfWeek: slot.dayOfWeek, id: { not: id } },
    });
    const conflict = siblings.find(
      (s) => start < s.endTime && end > s.startTime,
    );
    if (conflict) {
      throw new ConflictException(
        `Trùng giờ với khung ${conflict.startTime}–${conflict.endTime}`,
      );
    }

    return this.prisma.timeSlot.update({
      where: { id },
      data: {
        startTime: start,
        endTime: end,
        ...(body.label && { label: body.label }),
      },
    });
  }

  async deleteTimeSlot(id: string) {
    await this.prisma.timeSlot.delete({ where: { id } });
  }

  // ─── Admin: Grid lịch gốc (và tùy chọn lịch tuần) ─────────────────────

  async getGrid(mode?: 'base' | 'weekly') {
    const [timeSlots, rooms, schedules] = await Promise.all([
      this.prisma.timeSlot.findMany({
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.room.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.schedule.findMany({
        where: { type: { in: ['REGULAR', 'MAKEUP'] } },
        include: {
          class: true,
          room: true,
          timeSlot: true,
          creator: { include: { profile: true } },
        },
      }),
    ]);

    if (mode !== 'weekly') {
      // Chế độ mặc định: chỉ lịch gốc
      return { mode: 'base', timeSlots, rooms, schedules };
    }

    // Chế độ weekly: merge base + overrides tuần này
    const weekStart = SchedulesService.getCurrentWeekStart();
    const weekEnd = SchedulesService.getCurrentWeekEnd();

    const overrides = await this.prisma.scheduleWeeklyOverride.findMany({
      where: { weekStart },
      include: {
        schedule: { include: { class: true } },
        class: true,
        teacher: { include: { profile: true } },
        room: true,
        timeSlot: true,
      },
    });

    // Map overrideId → override để dễ lookup
    const overrideByScheduleId = new Map<string, any>();
    const newSessions: any[] = [];
    for (const o of overrides) {
      if (o.scheduleId) {
        overrideByScheduleId.set(o.scheduleId, o);
      } else {
        newSessions.push(o);
      }
    }

    const enrichedSchedules = schedules.map((s) => {
      const override = overrideByScheduleId.get(s.id) ?? null;
      return {
        ...s,
        effectiveRoomId: override ? override.roomId : s.roomId,
        effectiveTimeSlotId: override ? override.timeSlotId : s.timeSlotId,
        effectiveRoom: override ? override.room : s.room,
        effectiveTimeSlot: override ? override.timeSlot : s.timeSlot,
        isOverridden: !!override,
        isNewSession: false,
        override,
        originalRoom: s.room,
        originalTimeSlot: s.timeSlot,
      };
    });

    // Thêm các buổi teacher tự thêm tuần này
    const sessionSchedules = newSessions.map((o) => ({
      id: o.id,
      scheduleId: null,
      classId: o.classId,
      class: o.class,
      teacherId: o.teacherId,
      teacher: o.teacher,
      effectiveRoomId: o.roomId,
      effectiveTimeSlotId: o.timeSlotId,
      effectiveRoom: o.room,
      effectiveTimeSlot: o.timeSlot,
      isOverridden: false,
      isNewSession: true,
      override: o,
      originalRoom: null,
      originalTimeSlot: null,
      type: 'WEEKLY_SESSION',
    }));

    return {
      mode: 'weekly',
      weekStart,
      weekEnd,
      timeSlots,
      rooms,
      schedules: [...enrichedSchedules, ...sessionSchedules],
    };
  }

  // ─── Admin: Phân công lịch gốc ─────────────────────────────────────────

  async assign(dto: AssignScheduleInput, adminId: string) {
    const scheduleRange = this.getScheduleDateRange(
      dto.effectiveDate,
      dto.endDate,
    );
    await this.assertTeacherScheduleTimeSlotAvailable(
      dto.teacherId,
      dto.timeSlotId,
      scheduleRange,
    );

    const roomConflict = await this.prisma.schedule.findFirst({
      where: {
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        type: { not: 'CANCELLED' },
        ...this.scheduleRangeOverlapWhere(scheduleRange),
      },
    });
    if (roomConflict) {
      throw new ConflictException(
        'Phòng học đã được sử dụng trong khung giờ này',
      );
    }

    return this.prisma.schedule.create({
      data: {
        classId: dto.classId,
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        teacherId: dto.teacherId,
        type: 'REGULAR',
        effectiveDate: scheduleRange.effectiveDate,
        endDate: scheduleRange.endDate,
        createdBy: adminId,
      },
      include: { class: true, room: true, timeSlot: true },
    });
  }

  async remove(id: string) {
    await this.prisma.schedule.delete({ where: { id } });
  }

  // ─── Teacher: Grid tuần hiện tại ───────────────────────────────────────

  async teacherGrid(teacherId: string) {
    const weekStart = SchedulesService.getCurrentWeekStart();
    const weekEnd = SchedulesService.getCurrentWeekEnd();
    const now = new Date();

    const [timeSlots, rooms, allSchedules, overrides] = await Promise.all([
      this.prisma.timeSlot.findMany({
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.room.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      // Tất cả lịch REGULAR (để hiện full grid, bao gồm GV khác)
      this.prisma.schedule.findMany({
        where: { type: 'REGULAR' },
        include: {
          class: true,
          room: true,
          timeSlot: true,
          creator: { include: { profile: true } },
        },
      }),
      // Override tuần này của tất cả giáo viên
      this.prisma.scheduleWeeklyOverride.findMany({
        where: { weekStart },
        include: {
          schedule: { include: { class: true } },
          class: true,
          teacher: { include: { profile: true } },
          room: true,
          timeSlot: true,
        },
      }),
    ]);

    const overrideByScheduleId = new Map<string, any>();
    const newSessions: any[] = [];
    for (const o of overrides) {
      if (o.scheduleId) {
        overrideByScheduleId.set(o.scheduleId, o);
      } else {
        newSessions.push(o);
      }
    }

    const enrichTimeSlot = (slot: any) => {
      const window = getSessionWindow(slot, weekStart);
      return {
        ...slot,
        sessionStartAt: window.startAt,
        sessionEndAt: window.endAt,
        hasStarted: now >= window.startAt,
      };
    };

    const enrichedTimeSlots = timeSlots.map(enrichTimeSlot);

    const enrichedSchedules = allSchedules.map((s) => {
      const override = overrideByScheduleId.get(s.id) ?? null;
      const effectiveTimeSlot = enrichTimeSlot(
        override ? override.timeSlot : s.timeSlot,
      );
      const originalTimeSlot = enrichTimeSlot(s.timeSlot);
      const overrideStarted = override
        ? hasSessionStarted(override.timeSlot, weekStart, now)
        : false;
      const originalStarted = hasSessionStarted(s.timeSlot, weekStart, now);
      const hasStarted = overrideStarted || originalStarted;
      return {
        ...s,
        effectiveRoomId: override ? override.roomId : s.roomId,
        effectiveTimeSlotId: override ? override.timeSlotId : s.timeSlotId,
        effectiveRoom: override ? override.room : s.room,
        effectiveTimeSlot,
        isOverridden: !!override,
        isNewSession: false,
        isMine: s.teacherId === teacherId,
        canEdit: s.teacherId === teacherId && !hasStarted,
        hasStarted,
        override,
        originalRoom: s.room,
        originalTimeSlot,
      };
    });

    const sessionSchedules = newSessions.map((o) => {
      const effectiveTimeSlot = enrichTimeSlot(o.timeSlot);
      const hasStarted = hasSessionStarted(o.timeSlot, weekStart, now);
      return {
        id: o.id,
        scheduleId: null as null,
        classId: o.classId,
        class: o.class,
        teacherId: o.teacherId,
        teacher: o.teacher,
        effectiveRoomId: o.roomId,
        effectiveTimeSlotId: o.timeSlotId,
        effectiveRoom: o.room,
        effectiveTimeSlot,
        isOverridden: false,
        isNewSession: true,
        isMine: o.teacherId === teacherId,
        canEdit: o.teacherId === teacherId && !hasStarted,
        hasStarted,
        override: o,
        originalRoom: null as null,
        originalTimeSlot: null as null,
        type: 'WEEKLY_SESSION',
        reason: o.reason,
      };
    });

    return {
      weekStart,
      weekEnd,
      timeSlots: enrichedTimeSlots,
      rooms,
      schedules: [...enrichedSchedules, ...sessionSchedules],
    };
  }

  // ─── Teacher: Đổi lịch gốc trong tuần ─────────────────────────────────

  async applyWeeklyOverride(dto: WeeklyOverrideInput, teacherId: string) {
    const weekStart = SchedulesService.getCurrentWeekStart();
    const targetTimeSlot = await this.prisma.timeSlot.findUnique({
      where: { id: dto.timeSlotId },
    });
    if (!targetTimeSlot)
      throw new NotFoundException('Không tìm thấy khung giờ mới');

    // Validate: lịch gốc phải tồn tại và thuộc teacher
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: dto.scheduleId },
      include: { room: true, timeSlot: true },
    });
    if (!schedule || schedule.teacherId !== teacherId) {
      throw new NotFoundException('Không tìm thấy lịch dạy');
    }
    if (schedule.type !== 'REGULAR') {
      throw new BadRequestException('Chỉ có thể đổi lịch thường (REGULAR)');
    }

    const currentOverride = await this.prisma.scheduleWeeklyOverride.findUnique(
      {
        where: { scheduleId_weekStart: { scheduleId: schedule.id, weekStart } },
        include: { timeSlot: true },
      },
    );
    this.assertSessionNotStarted(
      schedule.timeSlot,
      weekStart,
      'Buổi học gốc đã đến giờ bắt đầu, không thể đổi lịch',
    );
    if (currentOverride) {
      this.assertSessionNotStarted(
        currentOverride.timeSlot,
        weekStart,
        'Buổi học đã đổi trong tuần này đã đến giờ bắt đầu, không thể đổi tiếp',
      );
    }
    this.assertSessionNotStarted(
      targetTimeSlot,
      weekStart,
      'Khung giờ mới đã đến giờ bắt đầu, không thể đổi lịch vào ô này',
    );
    await this.assertTeacherWeekTimeSlotAvailable(
      teacherId,
      dto.timeSlotId,
      weekStart,
      {
        excludeScheduleId: dto.scheduleId,
        excludeOverrideId: currentOverride?.id,
      },
    );

    // Validate: ô mới (roomId + timeSlotId) phải còn trống trong tuần này
    // 1. Không có override nào khác đang chiếm ô đó
    const overrideConflict = await this.prisma.scheduleWeeklyOverride.findFirst(
      {
        where: {
          roomId: dto.roomId,
          timeSlotId: dto.timeSlotId,
          weekStart,
          id: { not: undefined }, // sẽ exclude bản ghi của chính mình bên dưới
        },
      },
    );
    // Nếu conflict là chính override đang update (cùng scheduleId) thì cho phép
    if (overrideConflict && overrideConflict.scheduleId !== dto.scheduleId) {
      throw new ConflictException('Ô này đã có lịch trong tuần hiện tại');
    }

    // 2. Không có lịch REGULAR (chưa override) nào chiếm ô đó
    const regularConflict = await this.prisma.schedule.findFirst({
      where: {
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        type: 'REGULAR',
        id: { not: dto.scheduleId },
      },
    });
    if (regularConflict) {
      // Kiểm tra xem lịch REGULAR đó có bị override đi không
      const existingOverride =
        await this.prisma.scheduleWeeklyOverride.findUnique({
          where: {
            scheduleId_weekStart: { scheduleId: regularConflict.id, weekStart },
          },
        });
      if (!existingOverride) {
        throw new ConflictException('Ô này đã có lịch dạy của giáo viên khác');
      }
    }

    // Upsert override
    const result = await this.prisma.scheduleWeeklyOverride.upsert({
      where: {
        scheduleId_weekStart: { scheduleId: dto.scheduleId, weekStart },
      },
      create: {
        scheduleId: dto.scheduleId,
        teacherId,
        weekStart,
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        reason: dto.reason,
      },
      update: {
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        reason: dto.reason,
      },
      include: {
        room: true,
        timeSlot: true,
        schedule: { include: { class: true } },
      },
    });

    return result;
  }

  // ─── Teacher: Thêm buổi học tuần này ───────────────────────────────────

  async addWeeklySession(dto: AddWeeklySessionInput, teacherId: string) {
    const weekStart = SchedulesService.getCurrentWeekStart();
    const targetTimeSlot = await this.prisma.timeSlot.findUnique({
      where: { id: dto.timeSlotId },
    });
    if (!targetTimeSlot)
      throw new NotFoundException('Không tìm thấy khung giờ');
    this.assertSessionNotStarted(
      targetTimeSlot,
      weekStart,
      'Khung giờ này đã đến giờ bắt đầu, không thể thêm buổi học',
    );

    // Validate: class phải thuộc teacher
    const cls = await this.prisma.class.findUnique({
      where: { id: dto.classId },
    });
    if (!cls || cls.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không dạy lớp này');
    }
    await this.assertTeacherWeekTimeSlotAvailable(
      teacherId,
      dto.timeSlotId,
      weekStart,
    );

    // Validate: ô (room + timeslot) phải trống tuần này
    // 1. Không có override
    const overrideConflict =
      await this.prisma.scheduleWeeklyOverride.findUnique({
        where: {
          roomId_timeSlotId_weekStart: {
            roomId: dto.roomId,
            timeSlotId: dto.timeSlotId,
            weekStart,
          },
        },
      });
    if (overrideConflict) {
      throw new ConflictException('Ô này đã có lịch trong tuần hiện tại');
    }

    // 2. Không có REGULAR schedule (chưa override)
    const regularConflict = await this.prisma.schedule.findFirst({
      where: {
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        type: 'REGULAR',
      },
    });
    if (regularConflict) {
      const existingOverride =
        await this.prisma.scheduleWeeklyOverride.findUnique({
          where: {
            scheduleId_weekStart: { scheduleId: regularConflict.id, weekStart },
          },
        });
      if (!existingOverride) {
        throw new ConflictException('Ô này đã có lịch dạy (lịch thường)');
      }
    }

    return this.prisma.scheduleWeeklyOverride.create({
      data: {
        classId: dto.classId,
        teacherId,
        weekStart,
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        reason: dto.reason,
      },
      include: { class: true, room: true, timeSlot: true },
    });
  }

  // ─── Teacher: Hoàn tác override / xóa buổi tự thêm ────────────────────

  async removeWeeklyOverride(overrideId: string, teacherId: string) {
    const override = await this.prisma.scheduleWeeklyOverride.findUnique({
      where: { id: overrideId },
      include: { timeSlot: true, schedule: { include: { timeSlot: true } } },
    });
    if (!override) {
      throw new NotFoundException('Không tìm thấy override');
    }
    if (override.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa override này');
    }
    const weekStart = SchedulesService.getCurrentWeekStart();
    this.assertSessionNotStarted(
      override.timeSlot,
      weekStart,
      'Buổi học đã đến giờ bắt đầu, không thể thay đổi lịch',
    );
    if (override.schedule?.timeSlot) {
      this.assertSessionNotStarted(
        override.schedule.timeSlot,
        weekStart,
        'Buổi học gốc đã đến giờ bắt đầu, không thể hoàn tác lịch',
      );
      await this.assertTeacherWeekTimeSlotAvailable(
        teacherId,
        override.schedule.timeSlotId,
        weekStart,
        {
          excludeScheduleId: override.scheduleId ?? undefined,
          excludeOverrideId: override.id,
        },
      );
    }

    await this.prisma.scheduleWeeklyOverride.delete({
      where: { id: overrideId },
    });
    return { message: 'Đã hoàn tác, lịch trở về mặc định' };
  }

  private assertSessionNotStarted(
    timeSlot: any,
    weekStart: Date,
    message: string,
  ) {
    if (hasSessionStarted(timeSlot, weekStart)) {
      throw new BadRequestException(message);
    }
  }

  private getScheduleDateRange(effectiveDate?: string, endDate?: string) {
    const range = {
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
    };

    if (Number.isNaN(range.effectiveDate.getTime())) {
      throw new BadRequestException('Ngày bắt đầu lịch học không hợp lệ');
    }
    if (range.endDate && Number.isNaN(range.endDate.getTime())) {
      throw new BadRequestException('Ngày kết thúc lịch học không hợp lệ');
    }
    if (range.endDate && range.endDate < range.effectiveDate) {
      throw new BadRequestException(
        'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu',
      );
    }

    return range;
  }

  private scheduleRangeOverlapWhere(range: {
    effectiveDate: Date;
    endDate: Date | null;
  }) {
    return {
      ...(range.endDate && { effectiveDate: { lte: range.endDate } }),
      OR: [{ endDate: null }, { endDate: { gte: range.effectiveDate } }],
    };
  }

  private async assertTeacherScheduleTimeSlotAvailable(
    teacherId: string,
    timeSlotId: string,
    range: { effectiveDate: Date; endDate: Date | null },
    excludeScheduleId?: string,
  ) {
    const conflict = await this.prisma.schedule.findFirst({
      where: {
        teacherId,
        timeSlotId,
        type: { not: 'CANCELLED' },
        ...(excludeScheduleId && { id: { not: excludeScheduleId } }),
        ...this.scheduleRangeOverlapWhere(range),
      },
      include: { class: true, timeSlot: true },
    });

    if (conflict) {
      throw new ConflictException(
        `Giáo viên đã có lịch dạy ${conflict.class?.name ?? ''} vào khung giờ ${conflict.timeSlot?.startTime ?? ''}-${conflict.timeSlot?.endTime ?? ''} ngày ${conflict.timeSlot?.dayOfWeek ?? ''}`,
      );
    }
  }

  private async assertTeacherWeekTimeSlotAvailable(
    teacherId: string,
    timeSlotId: string,
    weekStart: Date,
    options: { excludeScheduleId?: string; excludeOverrideId?: string } = {},
  ) {
    const overrideConflict = await this.prisma.scheduleWeeklyOverride.findFirst(
      {
        where: {
          teacherId,
          timeSlotId,
          weekStart,
          ...(options.excludeOverrideId && {
            id: { not: options.excludeOverrideId },
          }),
        },
        include: { class: true, schedule: { include: { class: true } } },
      },
    );

    if (overrideConflict) {
      throw new ConflictException(
        `Giáo viên đã có lịch dạy ${overrideConflict.class?.name ?? overrideConflict.schedule?.class?.name ?? ''} vào khung giờ này trong tuần hiện tại`,
      );
    }

    const weekEnd = getWeekEnd(weekStart);
    const regularConflicts = await this.prisma.schedule.findMany({
      where: {
        teacherId,
        timeSlotId,
        type: { not: 'CANCELLED' },
        ...(options.excludeScheduleId && {
          id: { not: options.excludeScheduleId },
        }),
        ...this.scheduleRangeOverlapWhere({
          effectiveDate: weekStart,
          endDate: weekEnd,
        }),
      },
      include: { class: true, timeSlot: true },
    });

    for (const conflict of regularConflicts) {
      const movedInWeek = await this.prisma.scheduleWeeklyOverride.findUnique({
        where: {
          scheduleId_weekStart: {
            scheduleId: conflict.id,
            weekStart,
          },
        },
      });
      if (!movedInWeek) {
        throw new ConflictException(
          `Giáo viên đã có lịch dạy ${conflict.class?.name ?? ''} vào khung giờ này trong tuần hiện tại`,
        );
      }
    }
  }

  // ─── Teacher: Danh sách lịch (list view) ───────────────────────────────

  async mySchedule(teacherId: string) {
    return this.prisma.schedule.findMany({
      where: {
        teacherId,
        type: { not: 'CANCELLED' },
      },
      include: {
        class: true,
        room: true,
        timeSlot: true,
      },
      orderBy: [
        { timeSlot: { dayOfWeek: 'asc' } },
        { timeSlot: { startTime: 'asc' } },
      ],
    });
  }

  async reportAbsence(dto: ReportAbsenceInput, teacherId: string) {
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('Lý do nghỉ là bắt buộc');
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { id: dto.scheduleId },
    });
    if (!schedule || schedule.teacherId !== teacherId) {
      throw new NotFoundException('Không tìm thấy lịch dạy');
    }

    return this.prisma.schedule.update({
      where: { id: dto.scheduleId },
      data: { type: 'CANCELLED', cancelReason: dto.reason },
    });
  }

  async registerMakeup(dto: RegisterMakeupInput, teacherId: string) {
    const cancelledSchedule = await this.prisma.schedule.findUnique({
      where: { id: dto.cancelledScheduleId },
    });
    if (!cancelledSchedule || cancelledSchedule.teacherId !== teacherId) {
      throw new NotFoundException('Không tìm thấy ca đã báo nghỉ');
    }
    if (cancelledSchedule.type !== 'CANCELLED') {
      throw new BadRequestException('Ca học này chưa được đánh dấu báo nghỉ');
    }

    const weekDate = dto.weekDate ? new Date(dto.weekDate) : new Date();
    const startOfWeek = new Date(weekDate);
    startOfWeek.setDate(weekDate.getDate() - weekDate.getDay() + 1);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    await this.assertTeacherScheduleTimeSlotAvailable(
      teacherId,
      dto.timeSlotId,
      {
        effectiveDate: startOfWeek,
        endDate: endOfWeek,
      },
      cancelledSchedule.id,
    );
    await this.assertTeacherWeekTimeSlotAvailable(
      teacherId,
      dto.timeSlotId,
      getWeekStart(weekDate),
    );

    const roomConflict = await this.prisma.schedule.findFirst({
      where: {
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        type: { not: 'CANCELLED' },
        ...this.scheduleRangeOverlapWhere({
          effectiveDate: startOfWeek,
          endDate: endOfWeek,
        }),
      },
    });
    if (roomConflict)
      throw new ConflictException(
        'Phòng học đã được sử dụng trong khung giờ này',
      );

    return this.prisma.schedule.create({
      data: {
        classId: cancelledSchedule.classId,
        roomId: dto.roomId,
        timeSlotId: dto.timeSlotId,
        teacherId,
        type: 'MAKEUP',
        effectiveDate: startOfWeek,
        endDate: endOfWeek,
        makeupForId: cancelledSchedule.id,
        weekOfMakeup: startOfWeek,
        createdBy: teacherId,
      },
      include: { class: true, room: true, timeSlot: true },
    });
  }

  async studentUpcoming(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: 'APPROVED' },
      select: { classId: true },
    });
    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) return [];

    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const weekStarts = Array.from(
      new Map(
        [getWeekStart(now), getWeekStart(windowEnd)].map((date) => [
          date.getTime(),
          date,
        ]),
      ).values(),
    );

    const [schedules, overrides] = await Promise.all([
      this.prisma.schedule.findMany({
        where: {
          classId: { in: classIds },
          type: { not: 'CANCELLED' },
          effectiveDate: { lte: windowEnd },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        include: { class: true, room: true, timeSlot: true },
      }),
      this.prisma.scheduleWeeklyOverride.findMany({
        where: {
          weekStart: { in: weekStarts },
          OR: [
            { classId: { in: classIds } },
            { schedule: { classId: { in: classIds } } },
          ],
        },
        include: {
          class: true,
          schedule: { include: { class: true } },
          room: true,
          timeSlot: true,
        },
      }),
    ]);

    const sessions: any[] = [];
    const isVisible = (startAt: Date, endAt: Date) =>
      (startAt >= now && startAt <= windowEnd) ||
      (startAt <= now && endAt >= now);
    const isScheduleActive = (schedule: any, startAt: Date) =>
      schedule.effectiveDate <= startAt &&
      (!schedule.endDate || schedule.endDate >= startAt);

    for (const weekStart of weekStarts) {
      const weekOverrides = overrides.filter(
        (override) => override.weekStart.getTime() === weekStart.getTime(),
      );
      const overrideByScheduleId = new Map<string, any>();
      const addedSessions: any[] = [];

      for (const override of weekOverrides) {
        if (override.scheduleId) {
          overrideByScheduleId.set(override.scheduleId, override);
        } else {
          addedSessions.push(override);
        }
      }

      for (const schedule of schedules) {
        const override = overrideByScheduleId.get(schedule.id) ?? null;
        const room = override?.room ?? schedule.room;
        const timeSlot = override?.timeSlot ?? schedule.timeSlot;
        const window = getSessionWindow(timeSlot, weekStart);
        if (
          !isScheduleActive(schedule, window.startAt) ||
          !isVisible(window.startAt, window.endAt)
        ) {
          continue;
        }

        sessions.push({
          ...schedule,
          id: `${schedule.id}:${window.sessionDate.toISOString()}`,
          scheduleId: schedule.id,
          weeklyOverrideId: override?.id ?? null,
          room,
          timeSlot,
          sessionDate: window.sessionDate,
          sessionStartAt: window.startAt,
          sessionEndAt: window.endAt,
          isCurrent: window.startAt <= now && window.endAt >= now,
          isOverridden: !!override,
          isNewSession: false,
        });
      }

      for (const override of addedSessions) {
        const cls = override.class ?? override.schedule?.class;
        if (!cls || !classIds.includes(cls.id)) continue;
        const window = getSessionWindow(override.timeSlot, weekStart);
        if (!isVisible(window.startAt, window.endAt)) continue;

        sessions.push({
          id: `${override.id}:${window.sessionDate.toISOString()}`,
          scheduleId: null,
          weeklyOverrideId: override.id,
          classId: cls.id,
          class: cls,
          room: override.room,
          timeSlot: override.timeSlot,
          sessionDate: window.sessionDate,
          sessionStartAt: window.startAt,
          sessionEndAt: window.endAt,
          isCurrent: window.startAt <= now && window.endAt >= now,
          isOverridden: false,
          isNewSession: true,
        });
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(a.sessionStartAt).getTime() -
        new Date(b.sessionStartAt).getTime(),
    );
  }
}
