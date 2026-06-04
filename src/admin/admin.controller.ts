import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AdminGuard } from '../security/admin.guard';
import { Roles } from '../security/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  status() {
    return this.adminService.status();
  }

  @Get('protected-status')
  protectedStatus() {
    return this.adminService.status();
  }

  @Get('system/status')
  systemStatus() {
    return this.adminService.systemStatus();
  }

  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get('dashboard/summary')
  dashboardSummary() {
    return this.adminService.dashboard();
  }

  @Get('dashboard/realtime-events')
  realtimeEvents() {
    return this.adminService.realtimeDashboard();
  }

  @Get('users')
  users(@Query() query: any) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.adminService.updateUser(id, body, req.user);
  }

  @Get('professionals')
  professionals(@Query() query: any) {
    return this.adminService.listProfessionals(query);
  }

  @Get('professionals/:id')
  professional(@Param('id') id: string) {
    return this.adminService.getProfessional(id);
  }

  @Get('orders')
  orders(@Query() query: any) {
    return this.adminService.listOrders(query);
  }

  @Get('orders/:id')
  order(@Param('id') id: string) {
    return this.adminService.getOrder(id);
  }

  @Patch('orders/:id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.adminService.updateOrderStatus(id, body, req.user);
  }

  @Get('payments')
  payments(@Query() query: any) {
    return this.adminService.listPayments(query);
  }

  @Get('payments/:id')
  payment(@Param('id') id: string) {
    return this.adminService.getPayment(id);
  }

  @Get('payments/:id/audit')
  paymentAudit(@Param('id') id: string) {
    return this.adminService.paymentAudit(id);
  }

  @Patch('payments/:id/status')
  updatePaymentStatus(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.adminService.updatePaymentStatus(id, body, req.user);
  }

  @Get('disputes')
  disputes(@Query() query: any) {
    return this.adminService.listDisputes(query);
  }

  @Get('disputes/:id')
  dispute(@Param('id') id: string) {
    return this.adminService.getDispute(id);
  }

  @Patch('disputes/:id/resolve')
  resolveDispute(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.adminService.resolveDispute(id, body, req.user);
  }

  @Post('action')
  action(@Body() body: any, @Req() req: any) {
    return this.adminService.recordAction(req.user, body);
  }

  @Post('protected-action')
  protectedAction(@Body() body: any, @Req() req: any) {
    return this.adminService.recordAction(req.user, {
      ...body,
      protected: true,
    });
  }

  @Get('actions')
  actions(@Query('take') take?: string) {
    return this.adminService.adminActions(take);
  }

  @Get('audit')
  audit(@Query('take') take?: string) {
    return this.adminService.audit(take);
  }
}

