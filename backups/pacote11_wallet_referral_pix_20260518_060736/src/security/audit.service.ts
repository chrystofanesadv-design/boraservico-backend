import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  private readonly logs: any[] = [];

  register(action: string, payload: any = {}) {
    const log = {
      id: `audit_${Date.now()}_${Math.round(Math.random() * 1e9)}`,
      action,
      payload,
      createdAt: new Date().toISOString(),
    };

    this.logs.unshift(log);
    return log;
  }

  list() {
    return this.logs;
  }
}
