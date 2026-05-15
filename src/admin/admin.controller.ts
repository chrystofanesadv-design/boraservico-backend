import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { AdminGuard } from '../security/admin.guard';

@Controller('admin')
export class AdminController {
  private actions: any[] = [];

  @Get()
  status() {
    return {
      success: true,
      module: 'admin',
      protectedByRoleReady: true,
      publicStatus: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('protected-status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  protectedStatus() {
    return {
      success: true,
      protected: true,
      role: 'ADMIN',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('action')
  action(@Body() body: any) {
    const action = {
      id: `admin_${Date.now()}`,
      action: body.action ?? 'ADMIN_ACTION',
      payload: body,
      createdAt: new Date().toISOString(),
    };

    this.actions.unshift(action);
    return action;
  }

  @Post('protected-action')
  @UseGuards(JwtAuthGuard, AdminGuard)
  protectedAction(@Body() body: any) {
    const action = {
      id: `admin_protected_${Date.now()}`,
      action: body.action ?? 'ADMIN_PROTECTED_ACTION',
      payload: body,
      protected: true,
      createdAt: new Date().toISOString(),
    };

    this.actions.unshift(action);
    return action;
  }

  @Get('actions')
  list() {
    return this.actions;
  }
}
