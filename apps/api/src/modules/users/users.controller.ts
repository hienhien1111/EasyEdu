import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import {
  IsString, IsOptional, IsEnum, IsEmail, IsNotEmpty, MinLength,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

class CreateUserDto {
  @ApiProperty() @IsNotEmpty() @IsString() fullName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsNotEmpty() @IsString() phone: string;
  @ApiProperty() @IsNotEmpty() @IsString() @MinLength(8) password: string;
  @ApiProperty({ enum: UserRole }) @IsEnum(UserRole) role: UserRole;
}

class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

class LockUserDto {
  @ApiProperty() @IsNotEmpty() @IsString() reason: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  closeInvoices?: boolean;
}

@ApiTags('Admin - Quản lý người dùng')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách người dùng (UC-03)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.findAll(page, limit, search, role, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết người dùng' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo tài khoản mới' })
  async create(@Body() dto: CreateUserDto, @CurrentUser('id') adminId: string) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật người dùng' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/lock')
  @ApiOperation({ summary: 'Khóa tài khoản (UC-03)' })
  async lock(@Param('id') id: string, @Body() dto: LockUserDto) {
    return this.usersService.lock(id, dto.reason, dto.closeInvoices);
  }

  @Patch(':id/unlock')
  @ApiOperation({ summary: 'Mở khóa tài khoản' })
  async unlock(@Param('id') id: string) {
    return this.usersService.unlock(id);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Duyệt tài khoản chờ' })
  async approve(@Param('id') id: string) {
    return this.usersService.approve(id);
  }

  @Patch(':id/reset-password')
  @ApiOperation({ summary: 'Admin đặt lại mật khẩu người dùng' })
  async resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    return this.usersService.resetPassword(id, body.newPassword);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa người dùng' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
