import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsPositive, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

class CreateClassDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiProperty() @IsNotEmpty() @IsString() subject: string;
  @ApiProperty() @IsNotEmpty() @IsString() grade: string;
  @ApiProperty() @IsNotEmpty() @IsString() teacherId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() maxStudents?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) tuitionPerSession?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

class UpdateClassDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() maxStudents?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) tuitionPerSession?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

@ApiTags('Admin - Quản lý lớp học')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách lớp học (UC-04, 12, 19)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'teacherId', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('teacherId') teacherId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(200, parseInt(String(limit), 10) || 20);
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (teacherId) where.teacherId = teacherId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [total, classes] = await Promise.all([
      this.prisma.class.count({ where }),
      this.prisma.class.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          teacher: { include: { profile: true } },
          _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: classes.map((c) => ({
        ...c,
        studentCount: c._count.enrollments,
        teacherName: c.teacher.profile?.fullName,
      })),
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lớp học' })
  async findOne(@Param('id') id: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id },
      include: {
        teacher: { include: { profile: true } },
        enrollments: {
          where: { status: 'APPROVED' },
          include: { student: { include: { profile: true } } },
        },
        schedules: { include: { room: true, timeSlot: true } },
      },
    });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp học');
    return cls;
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo lớp học mới (UC-04)' })
  async create(@Body() dto: CreateClassDto) {
    if (!dto.teacherId) throw new BadRequestException('Lớp học bắt buộc phải có giáo viên phụ trách');

    const existing = await this.prisma.class.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Tên lớp học đã tồn tại');

    const teacher = await this.prisma.user.findFirst({
      where: { id: dto.teacherId, role: 'TEACHER' },
    });
    if (!teacher) throw new BadRequestException('Giáo viên không hợp lệ');

    return this.prisma.class.create({
      data: {
        name: dto.name, subject: dto.subject, grade: dto.grade,
        teacherId: dto.teacherId, maxStudents: dto.maxStudents || 30,
        tuitionPerSession: dto.tuitionPerSession || 0,
        description: dto.description,
      },
      include: { teacher: { include: { profile: true } } },
    });
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật lớp học (UC-04)' })
  async update(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    const cls = await this.prisma.class.findUnique({ where: { id } });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp học');

    if (dto.name && dto.name !== cls.name) {
      const existing = await this.prisma.class.findUnique({ where: { name: dto.name } });
      if (existing) throw new ConflictException('Tên lớp học đã tồn tại');
    }

    return this.prisma.class.update({
      where: { id },
      data: dto,
      include: { teacher: { include: { profile: true } } },
    });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa lớp học (UC-04)' })
  async remove(@Param('id') id: string) {
    await this.prisma.class.delete({ where: { id } });
  }

  // Teacher: Get my classes
  @Get('my/classes')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Xem lớp phụ trách (UC-12)' })
  async myClasses(@CurrentUser('id') teacherId: string) {
    return this.prisma.class.findMany({
      where: { teacherId, isActive: true },
      include: {
        _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
        enrollments: {
          where: { status: 'PENDING' },
          include: { student: { include: { profile: true } } },
        },
      },
    });
  }
}
