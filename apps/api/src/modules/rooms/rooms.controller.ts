import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoomsService } from './rooms.service';

class CreateRoomDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() capacity?: number;
}

@ApiTags('Admin - Phòng học')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách phòng học' })
  findAll() {
    return this.roomsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Tạo phòng học' })
  create(@Body() dto: CreateRoomDto) {
    return this.roomsService.create(dto.name, dto.capacity);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật phòng học' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateRoomDto>) {
    return this.roomsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa phòng học' })
  async remove(@Param('id') id: string) {
    return this.roomsService.remove(id);
  }
}
