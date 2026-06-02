import { Injectable } from '@nestjs/common';
import { accessSync, constants, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

import {
  getProofStorageDir,
  getProofStorageProvider,
  getPublicEnvReadiness,
  getStorageCdnBaseUrl,
  isCloudflareR2Ready,
  readEnv,
} from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../security/audit.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async health() {
    const [database, realtime, payments, firebase, storage, productionReady] =
      await Promise.all([
        this.databaseStatus(),
        this.realtimeStatus(),
        this.paymentsStatus(),
        this.firebaseStatus(),
        this.storageStatus(),
        this.productionReady(),
      ]);

    return {
      status: database.ok ? 'ok' : 'degraded',
      service: 'BoraServico Backend',
      productionReady: productionReady.productionReady,
      env: getPublicEnvReadiness(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks: {
        database,
        realtime,
        payments,
        firebase,
        storage,
      },
      recentErrors: await this.findErrors(20),
      timestamp: new Date().toISOString(),
    };
  }

  async productionReady() {
    const env = getPublicEnvReadiness();
    const [database, payments, firebase, storage] = await Promise.all([
      this.databaseStatus(),
      this.paymentsStatus(),
      this.firebaseStatus(),
      this.storageStatus(),
    ]);
    const blockers = [
      ...env.missing.map((name) => `ENV_MISSING:${name}`),
      ...(database.ok ? [] : ['DATABASE_UNAVAILABLE']),
      ...(payments.anyProviderReady ? [] : ['PAYMENTS_PROVIDER_MISSING']),
      ...(firebase.ready ? [] : ['FIREBASE_CONFIG_MISSING']),
      ...(storage.writable ? [] : ['STORAGE_NOT_WRITABLE']),
      ...(storage.cloudReady ? [] : ['STORAGE_CLOUD_PROVIDER_MISSING']),
    ];

    return {
      success: true,
      productionReady: blockers.length === 0,
      blockers,
      warnings: [
        ...(env.legacyAliasesActive.length
          ? [`LEGACY_ENV_ALIASES:${env.legacyAliasesActive.join(',')}`]
          : []),
      ],
      checks: {
        env,
        database,
        payments,
        firebase,
        storage,
      },
      timestamp: new Date().toISOString(),
    };
  }

  envStatus() {
    const env = getPublicEnvReadiness();

    return {
      success: true,
      productionReady: env.productionReady,
      missing: env.missing,
      configuredCount: env.configuredCount,
      requiredCount: env.requiredCount,
      legacyAliasesActive: env.legacyAliasesActive,
      corsOrigins: env.corsOrigins,
      payments: env.payments,
      timestamp: new Date().toISOString(),
    };
  }

  async databaseStatus() {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        ok: true,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'DATABASE_ERROR',
      };
    }
  }

  async realtimeStatus() {
    const since = new Date(Date.now() - 60 * 60 * 1000);

    try {
      const [tracking, timeline, chat] = await Promise.all([
        this.prisma.trackingEvent.count({
          where: { timestamp: { gte: since } },
        }),
        this.prisma.operationalTimelineEvent.count({
          where: { timestamp: { gte: since } },
        }),
        this.prisma.chatMessage.count({
          where: { createdAt: { gte: since } },
        }),
      ]);

      return {
        ok: true,
        websocket: true,
        since: since.toISOString(),
        eventsLastHour: tracking + timeline + chat,
        channels: {
          tracking,
          timeline,
          chat,
        },
      };
    } catch (error) {
      return {
        ok: false,
        websocket: true,
        error: error instanceof Error ? error.message : 'REALTIME_STATUS_ERROR',
      };
    }
  }

  async paymentsStatus() {
    const env = getPublicEnvReadiness();

    try {
      const [pending, failed24h, webhookFailures24h] = await Promise.all([
        this.prisma.payment.count({
          where: { status: { in: ['PENDING', 'AUTHORIZED'] as any } },
        }),
        this.prisma.payment.count({
          where: {
            status: 'FAILED',
            updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
        this.prisma.paymentWebhookEvent.count({
          where: {
            status: 'FAILED',
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

      return {
        ok: env.payments.anyProviderReady,
        ...env.payments,
        pendingPayments: pending,
        failedPayments24h: failed24h,
        failedWebhooks24h: webhookFailures24h,
      };
    } catch (error) {
      return {
        ok: false,
        ...env.payments,
        error: error instanceof Error ? error.message : 'PAYMENTS_STATUS_ERROR',
      };
    }
  }

  firebaseStatus() {
    const projectId = readEnv('FIREBASE_PROJECT_ID');
    const clientEmail = readEnv('FIREBASE_CLIENT_EMAIL');
    const privateKey = readEnv('FIREBASE_PRIVATE_KEY');

    return {
      ok: Boolean(projectId && clientEmail && privateKey),
      ready: Boolean(projectId && clientEmail && privateKey),
      configured: {
        projectId: Boolean(projectId),
        clientEmail: Boolean(clientEmail),
        privateKey: Boolean(privateKey),
      },
    };
  }

  storageStatus() {
    const storagePath =
      getProofStorageDir() ?? join(process.cwd(), 'storage', 'private', 'proofs');
    const provider = getProofStorageProvider();
    const cdnConfigured = Boolean(getStorageCdnBaseUrl());
    const r2Ready = isCloudflareR2Ready();
    const cloudReady = provider !== 'local-private' || cdnConfigured || r2Ready;

    try {
      if (!existsSync(storagePath)) {
        mkdirSync(storagePath, { recursive: true });
      }

      accessSync(storagePath, constants.R_OK | constants.W_OK);

      const stat = statSync(storagePath);
      const files = readdirSync(storagePath);

      return {
        ok: true,
        ready: true,
        writable: true,
        provider,
        private: true,
        cdnConfigured,
        r2Ready,
        cloudReady,
        path: storagePath,
        isDirectory: stat.isDirectory(),
        files: files.length,
      };
    } catch (error) {
      return {
        ok: false,
        ready: false,
        writable: false,
        provider,
        cdnConfigured,
        r2Ready,
        cloudReady,
        path: storagePath,
        error: error instanceof Error ? error.message : 'STORAGE_STATUS_ERROR',
      };
    }
  }

  async log(data: any) {
    const log: LogMock = {
      id: randomUUID(),
      level: this.normalizeLevel(data?.level),
      context: this.readString(data?.context) ?? 'SYSTEM',
      message: this.readString(data?.message) ?? '',
      metadata: data?.metadata,
      createdAt: new Date(),
    };

    this.logs.unshift(log);
    this.logs.splice(300);

    await this.auditService.register('OBS_LOG', {
      action: 'OBS_LOG',
      details: {
        level: log.level,
        context: log.context,
        message: log.message,
        metadata: log.metadata,
      },
    });

    return log;
  }

  async error(data: any) {
    const error: ErrorMock = {
      id: randomUUID(),
      context: this.readString(data?.context) ?? 'SYSTEM',
      message: this.readString(data?.message) ?? '',
      stack: this.readString(data?.stack),
      recovered: false,
      createdAt: new Date(),
    };

    this.errors.unshift(error);
    this.errors.splice(300);

    await this.auditService.register('OBS_ERROR', {
      action: 'OBS_ERROR',
      details: {
        context: error.context,
        message: error.message,
        stack: error.stack,
      },
    });

    return error;
  }

  async autoRecovery(data: any) {
    const error = this.errors.find((item) => item.id === data?.errorId);

    if (!error) {
      return {
        error: 'ERROR_NOT_FOUND',
        message: 'Erro nao encontrado',
      };
    }

    error.recovered = true;
    error.recoveredAt = new Date();

    const log = await this.log({
      level: 'INFO',
      context: 'AUTO_RECOVERY',
      message: `Auto recovery aplicado no erro ${error.id}`,
      metadata: {
        errorId: error.id,
        strategy: data?.strategy ?? 'fallback',
      },
    });

    await this.auditService.register('OBS_ERROR_RECOVERED', {
      action: 'OBS_ERROR_RECOVERED',
      details: {
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

  async findLogs(take = 100) {
    const persisted = await this.auditService.list({
      limit: take,
      action: 'OBS_LOG',
    });

    return {
      memory: this.logs.slice(0, take),
      persisted: persisted?.data ?? [],
    };
  }

  async findErrors(take = 100) {
    const persisted = await this.auditService.recentErrors(take);

    return {
      memory: this.errors.slice(0, take),
      persisted,
    };
  }

  private normalizeLevel(value: any): LogLevel {
    const level = this.readString(value)?.toUpperCase();
    const allowed: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

    return allowed.includes(level as LogLevel) ? (level as LogLevel) : 'INFO';
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}