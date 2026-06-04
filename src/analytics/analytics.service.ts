import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerInstall(body: any) {
    const deviceKey = this.safeString(body?.deviceKey) ?? this.safeString(body?.deviceId) ?? `unknown-${Date.now()}`;
    const platform = (this.safeString(body?.platform) ?? 'ANDROID').toUpperCase();
    const appVersion = this.safeString(body?.appVersion);
    const source = this.safeString(body?.source);
    const city = this.safeString(body?.city);
    const country = this.safeString(body?.country) ?? 'BR';
    const userId = this.safeString(body?.userId);

    const install = await this.prisma.appInstall.upsert({
      where: { deviceKey },
      create: {
        deviceKey,
        platform,
        appVersion,
        source,
        city,
        country,
        userId,
      },
      update: {
        platform,
        appVersion,
        source,
        city,
        country,
        userId,
      },
    });

    return {
      success: true,
      install,
      message: 'Instalacao/download registrado com sucesso.',
    };
  }

  async downloadsSummary() {
    const now = new Date();
    const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      last24h,
      last7d,
      last30d,
      byPlatform,
      byVersion,
      recent,
    ] = await Promise.all([
      this.prisma.appInstall.count(),
      this.prisma.appInstall.count({ where: { createdAt: { gte: lastDay } } }),
      this.prisma.appInstall.count({ where: { createdAt: { gte: lastWeek } } }),
      this.prisma.appInstall.count({ where: { createdAt: { gte: lastMonth } } }),
      this.prisma.appInstall.groupBy({
        by: ['platform'],
        _count: { _all: true },
      }),
      this.prisma.appInstall.groupBy({
        by: ['appVersion'],
        _count: { _all: true },
      }),
      this.prisma.appInstall.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
    ]);

    return {
      success: true,
      generatedAt: now.toISOString(),
      downloads: {
        total,
        last24h,
        last7d,
        last30d,
        byPlatform: byPlatform.map((item) => ({
          platform: item.platform,
          total: item._count._all,
        })),
        byVersion: byVersion.map((item) => ({
          appVersion: item.appVersion ?? 'desconhecida',
          total: item._count._all,
        })),
        recent,
      },
    };
  }

  private safeString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}