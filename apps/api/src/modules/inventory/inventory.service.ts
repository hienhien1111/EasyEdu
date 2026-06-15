import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InventoryStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface CreateInventoryInput {
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  status?: InventoryStatus;
  description?: string;
}

export interface UpdateInventoryInput {
  name?: string;
  category?: string;
  quantity?: number;
  unitPrice?: number;
  status?: InventoryStatus;
  description?: string;
}

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async findAll(category?: string, status?: string) {
    return this.prisma.inventory.findMany({
      where: { category, status: status as any },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');
    return item;
  }

  async create(dto: CreateInventoryInput) {
    if (dto.quantity < 0) throw new BadRequestException('Số lượng không được âm');
    if (dto.unitPrice < 0) throw new BadRequestException('Đơn giá không được âm');
    return this.prisma.inventory.create({ data: { ...dto, status: dto.status || 'AVAILABLE' } });
  }

  async update(id: string, dto: UpdateInventoryInput) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');
    if (dto.quantity !== undefined && dto.quantity < 0) throw new BadRequestException('Số lượng không được âm');
    if (dto.unitPrice !== undefined && dto.unitPrice < 0) throw new BadRequestException('Đơn giá không được âm');
    return this.prisma.inventory.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');
    if (item.hasActiveRecord) {
      throw new BadRequestException('Không thể xóa vật tư đang có biên bản mượn chưa xử lý');
    }
    await this.prisma.inventory.delete({ where: { id } });
  }
}
