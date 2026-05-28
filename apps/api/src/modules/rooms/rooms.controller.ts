import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsPositive, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';

class CreateRoomDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() capacity?: number;
}

@ApiTags('Admin - Phòng học')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('rooms')
export class RoomsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách phòng học' })
  findAll() {
    return this.prisma.room.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  @ApiOperation({ summary: 'Tạo phòng học' })
  create(@Body() dto: CreateRoomDto) {
    return this.prisma.room.create({ data: { name: dto.name, capacity: dto.capacity || 40 } });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật phòng học' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateRoomDto>) {
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa phòng học' })
  async remove(@Param('id') id: string) {
    await this.prisma.room.delete({ where: { id } });
  }
}
