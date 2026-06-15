import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.room.findMany({ orderBy: { name: 'asc' } });
  }

  create(name: string, capacity?: number) {
    return this.prisma.room.create({ data: { name, capacity: capacity || 40 } });
  }

  update(id: string, dto: { name?: string; capacity?: number }) {
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.room.delete({ where: { id } });
  }
}
