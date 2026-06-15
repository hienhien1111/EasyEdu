import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole, InventoryStatus } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { InventoryService } from './inventory.service';

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
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách vật tư (UC-06)' })
  async findAll(@Query('category') category?: string, @Query('status') status?: string) {
    return this.inventoryService.findAll(category, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết vật tư' })
  async findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Thêm vật tư mới (UC-06)' })
  async create(@Body() dto: CreateInventoryDto) {
    return this.inventoryService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật vật tư (UC-06)' })
  async update(@Param('id') id: string, @Body() dto: UpdateInventoryDto) {
    return this.inventoryService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa vật tư (UC-06)' })
  async remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}
