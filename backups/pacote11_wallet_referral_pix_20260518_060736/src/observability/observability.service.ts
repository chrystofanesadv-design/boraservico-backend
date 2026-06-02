import { Injectable } from '@nestjs/common';

import { getPublicEnvReadiness } from '../config/env';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogMock {
  id: string;
  level: LogLevel;
  context: string;
  message: string;
  metadata?: any;
  createdAt: Date;
}

interface ErrorMock {
  id: string;
  context: string;
  message: string;
  stack?: string;
  recovered: boolean;
  createdAt: Date;
  recoveredAt?: Date;
}

@Injectable()
export class ObservabilityService {
  private logs: LogMock[] = [];
  private errors: ErrorMock[] = [];

  health() {
    const env = getPublicEnvReadiness();

    return {
      status: 'ok',
      service: 'BoraServico Backend',
      productionReady: env.productionReady,
      env,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date(),
      modules: {
        auth: 'ok',
        services: 'ok',
        orders: 'ok',
        wallet: 'ok',
        matching: 'ok',
        disputes: 'ok',
        tracking: 'ok',
        ai: 'ok',
        notifications: 'ok',
        referral: 'ok',
        reputation: 'ok',
      },
    };
  }

  log(data: any) {
    const log: LogMock = {
      id: crypto.randomUUID(),
      level: data?.level ?? 'INFO',
      context: data?.context ?? 'SYSTEM',
      message: data?.message ?? '',
      metadata: data?.metadata,
      createdAt: new Date(),
    };

    this.logs.push(log);

    return log;
  }

  error(data: any) {
    const error: ErrorMock = {
      id: crypto.randomUUID(),
      context: data?.context ?? 'SYSTEM',
      message: data?.message ?? '',
      stack: data?.stack,
      recovered: false,
      createdAt: new Date(),
    };

    this.errors.push(error);

    return error;
  }

  autoRecovery(data: any) {
    const error = this.errors.find((item) => item.id === data?.errorId);

    if (!error) {
      return {
        error: 'ERROR_NOT_FOUND',
        message: 'Erro nao encontrado',
      };
    }

    error.recovered = true;
    error.recoveredAt = new Date();

    const log = this.log({
      level: 'INFO',
      context: 'AUTO_RECOVERY',
      message: `Auto recovery aplicado no erro ${error.id}`,
      metadata: {
        errorId: error.id,
        strategy: data?.strategy ?? 'fallback',
      },
    });

    return {
      success: true,
      recoveredError: error,
      recoveryLog: log,
    };
  }

  findLogs() {
    return this.logs;
  }

  findErrors() {
    return this.errors;
  }
}
