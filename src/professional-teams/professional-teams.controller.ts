import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ProfessionalTeamsService } from './professional-teams.service';

@Controller('professional-teams')
export class ProfessionalTeamsController {
  constructor(private readonly service: ProfessionalTeamsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':teamId')
  findOne(@Param('teamId') teamId: string) {
    return this.service.findOne(teamId);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Post(':teamId/members')
  addMember(@Param('teamId') teamId: string, @Body() body: Record<string, unknown>) {
    return this.service.addMember(teamId, body);
  }

  @Post(':teamId/tasks')
  addTask(@Param('teamId') teamId: string, @Body() body: Record<string, unknown>) {
    return this.service.addTask(teamId, body);
  }

  @Patch(':teamId/tasks/:taskId/status')
  updateTaskStatus(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateTaskStatus(teamId, taskId, body);
  }

  @Patch(':teamId/budget-split')
  updateBudgetSplit(@Param('teamId') teamId: string, @Body() body: Record<string, unknown>) {
    return this.service.updateBudgetSplit(teamId, body);
  }
}