import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole, InventoryStatus } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, Min, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';

class CreateInventoryDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiProperty() @IsNotEmpty() @IsString() category: string;
  @ApiProperty() @IsNumber() @Min(0) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiPropertyOptional({ enum: InventoryStatus }) @IsOptional() @IsEnum(InventoryStatus) status?: InventoryStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

class UpdateInventoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @ApiPropertyOptional({ enum: InventoryStatus }) @IsOptional() @IsEnum(InventoryStatus) status?: InventoryStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

@ApiTags('Inventory - Quản lý vật tư')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('inventory')
export class InventoryController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách vật tư (UC-06)' })
  async findAll(@Query('category') category?: string, @Query('status') status?: string) {
    return this.prisma.inventory.findMany({
      where: { category, status: status as any },
      orderBy: { name: 'asc' },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết vật tư' })
  async findOne(@Param('id') id: string) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');
    return item;
  }

  @Post()
  @ApiOperation({ summary: 'Thêm vật tư mới (UC-06)' })
  async create(@Body() dto: CreateInventoryDto) {
    if (dto.quantity < 0) throw new BadRequestException('Số lượng không được âm');
    if (dto.unitPrice < 0) throw new BadRequestException('Đơn giá không được âm');
    return this.prisma.inventory.create({ data: { ...dto, status: dto.status || 'AVAILABLE' } });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật vật tư (UC-06)' })
  async update(@Param('id') id: string, @Body() dto: UpdateInventoryDto) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');
    if (dto.quantity !== undefined && dto.quantity < 0) throw new BadRequestException('Số lượng không được âm');
    if (dto.unitPrice !== undefined && dto.unitPrice < 0) throw new BadRequestException('Đơn giá không được âm');
    return this.prisma.inventory.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa vật tư (UC-06)' })
  async remove(@Param('id') id: string) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');
    if (item.hasActiveRecord) {
      throw new BadRequestException('Không thể xóa vật tư đang có biên bản mượn chưa xử lý');
    }
    await this.prisma.inventory.delete({ where: { id } });
  }
}
