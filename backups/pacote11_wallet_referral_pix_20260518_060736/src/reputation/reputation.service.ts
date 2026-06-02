import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

interface ReputationUser {
  userId: string;
  averageRating: number;
  totalReviews: number;
  completedServices: number;
  cancelledServices: number;
  responseTimeScore: number;
  reliabilityScore: number;
  reputationScore: number;
  updatedAt: Date;
}

interface ReviewMock {
  id: string;
  targetUserId: string;
  authorUserId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

@Injectable()
export class ReputationService {
  private users: ReputationUser[] = [];
  private reviews: ReviewMock[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async review(data: any) {
    const persisted = await this.tryPersistReview(data);

    if (persisted) {
      return persisted;
    }

    const user = this.getOrCreateUser(data?.targetUserId);

    const review: ReviewMock = {
      id: crypto.randomUUID(),
      targetUserId: data?.targetUserId,
      authorUserId: data?.authorUserId,
      rating: Number(data?.rating ?? 5),
      comment: data?.comment ?? '',
      createdAt: new Date(),
    };

    this.reviews.push(review);
    this.recalculateFallbackReputation(user);
    user.completedServices += 1;
    user.reputationScore = this.calculateScore(user);
    user.updatedAt = new Date();

    return {
      review,
      reputation: user,
    };
  }

  async registerCancellation(data: any) {
    const persisted = await this.tryUpdatePersistedProfile(data?.userId, {
      cancelledServices: { increment: 1 },
      reliabilityScore: { decrement: 10 },
      reputationScore: { decrement: 5 },
    });

    if (persisted) {
      return persisted;
    }

    const user = this.getOrCreateUser(data?.userId);

    user.cancelledServices += 1;
    user.reliabilityScore = Math.max(0, user.reliabilityScore - 10);
    user.reputationScore = Math.max(0, user.reputationScore - 5);
    user.updatedAt = new Date();

    return user;
  }

  async registerResponseTime(data: any) {
    const userId = data?.userId;
    const minutes = Number(data?.minutes ?? 0);
    const responseTimeScore = this.responseScore(minutes);
    const persisted = await this.trySetPersistedResponseTime(
      userId,
      responseTimeScore,
    );

    if (persisted) {
      return persisted;
    }

    const user = this.getOrCreateUser(userId);

    user.responseTimeScore = responseTimeScore;
    user.reputationScore = this.calculateScore(user);
    user.updatedAt = new Date();

    return user;
  }

  async findAll() {
    try {
      const profiles = await this.prisma.reputationProfile.findMany({
        orderBy: { updatedAt: 'desc' },
      });

      return profiles.map((profile) => this.toPublicProfile(profile));
    } catch {
      return this.users;
    }
  }

  async findOne(userId: string) {
    try {
      const profile = await this.prisma.reputationProfile.findUnique({
        where: { userId },
      });

      return profile
        ? this.toPublicProfile(profile)
        : this.publicEmptyProfile(userId);
    } catch {
      return this.getOrCreateUser(userId);
    }
  }

  private async tryPersistReview(data: any) {
    const orderId = this.readString(data?.orderId);
    const reviewedId = this.readString(data?.reviewedId ?? data?.targetUserId);
    const reviewerId = this.readString(data?.reviewerId ?? data?.authorUserId);

    if (!orderId || !reviewedId || !reviewerId) {
      return null;
    }

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const review = await tx.review.create({
          data: {
            orderId,
            reviewerId,
            reviewedId,
            rating: this.readRating(data?.rating),
            comment: this.readString(data?.comment),
          },
        });

        const aggregate = await tx.review.aggregate({
          where: { reviewedId },
          _avg: { rating: true },
          _count: { rating: true },
        });

        const current = await tx.reputationProfile.upsert({
          where: { userId: reviewedId },
          update: {},
          create: { userId: reviewedId },
        });
        const averageRating = aggregate._avg.rating ?? 5;
        const totalReviews = aggregate._count.rating ?? 0;
        const completedServices = current.completedServices + 1;
        const reputationScore = this.calculateScore({
          ...current,
          averageRating,
          totalReviews,
          completedServices,
        });
        const reputation = await tx.reputationProfile.update({
          where: { userId: reviewedId },
          data: {
            averageRating,
            totalReviews,
            completedServices,
            reputationScore,
          },
        });

        return {
          review,
          reputation: this.toPublicProfile(reputation),
        };
      });
    } catch {
      return null;
    }
  }

  private async tryUpdatePersistedProfile(userId: any, data: any) {
    const normalizedUserId = this.readString(userId);

    if (!normalizedUserId) {
      return null;
    }

    try {
      const existing = await this.prisma.reputationProfile.upsert({
        where: { userId: normalizedUserId },
        update: {},
        create: { userId: normalizedUserId },
      });
      const updated = await this.prisma.reputationProfile.update({
        where: { userId: normalizedUserId },
        data,
      });

      return this.toPublicProfile({
        ...updated,
        reliabilityScore: Math.max(0, Number(updated.reliabilityScore)),
        reputationScore: Math.max(
          0,
          this.calculateScore({
            ...existing,
            ...updated,
          }),
        ),
      });
    } catch {
      return null;
    }
  }

  private async trySetPersistedResponseTime(
    userId: any,
    responseTimeScore: number,
  ) {
    const normalizedUserId = this.readString(userId);

    if (!normalizedUserId) {
      return null;
    }

    try {
      const profile = await this.prisma.reputationProfile.upsert({
        where: { userId: normalizedUserId },
        update: {
          responseTimeScore,
        },
        create: {
          userId: normalizedUserId,
          responseTimeScore,
        },
      });
      const reputationScore = this.calculateScore({
        ...profile,
        responseTimeScore,
      });
      const updated = await this.prisma.reputationProfile.update({
        where: { userId: normalizedUserId },
        data: { reputationScore },
      });

      return this.toPublicProfile(updated);
    } catch {
      return null;
    }
  }

  private getOrCreateUser(userId: string) {
    let user = this.users.find((item) => item.userId === userId);

    if (!user) {
      user = {
        userId,
        averageRating: 5,
        totalReviews: 0,
        completedServices: 0,
        cancelledServices: 0,
        responseTimeScore: 100,
        reliabilityScore: 100,
        reputationScore: 100,
        updatedAt: new Date(),
      };

      this.users.push(user);
    }

    return user;
  }

  private recalculateFallbackReputation(user: ReputationUser) {
    const userReviews = this.reviews.filter(
      (item) => item.targetUserId === user.userId,
    );
    const total = userReviews.reduce((sum, item) => sum + item.rating, 0);

    user.averageRating = total / userReviews.length;
    user.totalReviews = userReviews.length;
  }

  private calculateScore(profile: Partial<ReputationUser>) {
    return Math.max(
      0,
      Math.min(
        100,
        Number(profile.averageRating ?? 5) * 20 * 0.6 +
          Number(profile.responseTimeScore ?? 100) * 0.2 +
          Number(profile.reliabilityScore ?? 100) * 0.2,
      ),
    );
  }

  private responseScore(minutes: number) {
    if (minutes <= 2) {
      return 100;
    }

    if (minutes <= 5) {
      return 90;
    }

    if (minutes <= 10) {
      return 75;
    }

    return 50;
  }

  private toPublicProfile(profile: any) {
    return {
      userId: profile.userId,
      averageRating: Number(profile.averageRating ?? 5),
      totalReviews: Number(profile.totalReviews ?? 0),
      completedServices: Number(profile.completedServices ?? 0),
      cancelledServices: Number(profile.cancelledServices ?? 0),
      responseTimeScore: Number(profile.responseTimeScore ?? 100),
      reliabilityScore: Number(profile.reliabilityScore ?? 100),
      reputationScore: Number(profile.reputationScore ?? 100),
      updatedAt: profile.updatedAt,
    };
  }

  private publicEmptyProfile(userId: string) {
    return {
      userId,
      averageRating: 5,
      totalReviews: 0,
      completedServices: 0,
      cancelledServices: 0,
      responseTimeScore: 100,
      reliabilityScore: 100,
      reputationScore: 100,
      updatedAt: new Date(),
    };
  }

  private readRating(value: any) {
    const rating = Number(value ?? 5);

    if (!Number.isFinite(rating)) {
      return 5;
    }

    return Math.max(1, Math.min(5, Math.round(rating)));
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
