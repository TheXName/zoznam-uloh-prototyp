import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthGuard, UserId } from './auth';
import { Task, User } from './entities';
import { GoogleService } from './google';

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(@InjectRepository(Task) private tasks: Repository<Task>, private google: GoogleService) {}

  /** Úlohy prihláseného používateľa */
  @Get()
  list(@UserId() userId: string) {
    return this.tasks.find({ where: { user: { id: userId } }, order: { dueAt: 'ASC', createdAt: 'DESC' } });
  }

  /** Nová úloha; ak má termín a Google je prepojený, zapíše sa aj do kalendára */
  @Post()
  async create(@UserId() userId: string, @Body() body: { title?: string; description?: string; dueAt?: string }) {
    const title = body.title?.trim();
    if (!title) throw new BadRequestException('Zadajte názov úlohy');

    const task = await this.tasks.save({
      user: { id: userId } as User,
      title,
      description: body.description?.trim() ?? '',
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
    } as Task);

    let calendarError: string | null = null;
    try {
      task.googleEventId = await this.google.createEvent(userId, task);
      if (task.googleEventId) await this.tasks.save(task);
    } catch (e) {
      calendarError = (e as Error).message; // úloha ostane uložená, len nie je v kalendári
    }
    const { user, ...result } = task;
    return { ...result, calendarError };
  }

  /** Zmaže úlohu (aj jej udalosť v Google kalendári) */
  @Delete(':id')
  async remove(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const task = await this.tasks.findOneBy({ id, user: { id: userId } });
    if (!task) throw new NotFoundException('Úloha neexistuje');
    if (task.googleEventId) await this.google.deleteEvent(userId, task.googleEventId).catch(() => null);
    await this.tasks.delete(id);
    return { deleted: true };
  }
}
