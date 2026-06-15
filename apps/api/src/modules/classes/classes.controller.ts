import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsPositive, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClassesService } from './classes.service';

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
  constructor(private readonly classesService: ClassesService) {}

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
    return this.classesService.findAll(page, limit, search, teacherId, isActive);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lớp học' })
  async findOne(@Param('id') id: string) {
    return this.classesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo lớp học mới (UC-04)' })
  async create(@Body() dto: CreateClassDto) {
    return this.classesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật lớp học (UC-04)' })
  async update(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa lớp học (UC-04)' })
  async remove(@Param('id') id: string) {
    return this.classesService.remove(id);
  }

  @Get('my/classes')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên: Xem lớp phụ trách (UC-12)' })
  async myClasses(@CurrentUser('id') teacherId: string) {
    return this.classesService.myClasses(teacherId);
  }
}
