Write-Host "========================================="
Write-Host "INSTALANDO REPUTATION SYSTEM"
Write-Host "========================================="

$backend = "C:\Users\chrys\boraservico-backend"
$reputation = "$backend\src\reputation"

New-Item -ItemType Directory -Force -Path $reputation | Out-Null

@'
import { Injectable } from '@nestjs/common';

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

  private getOrCreateUser(userId: string) {
    let user = this.users.find(
      (item) => item.userId === userId,
    );

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

  review(data: any) {
    const user = this.getOrCreateUser(
      data?.targetUserId,
    );

    const review: ReviewMock = {
      id: crypto.randomUUID(),
      targetUserId: data?.targetUserId,
      authorUserId: data?.authorUserId,
      rating: Number(data?.rating ?? 5),
      comment: data?.comment ?? '',
      createdAt: new Date(),
    };

    this.reviews.push(review);

    const userReviews = this.reviews.filter(
      (item) => item.targetUserId === user.userId,
    );

    const total = userReviews.reduce(
      (sum, item) => sum + item.rating,
      0,
    );

    user.averageRating =
      total / userReviews.length;

    user.totalReviews = userReviews.length;
    user.completedServices += 1;

    user.reputationScore = Math.max(
      0,
      Math.min(
        100,
        (
          (user.averageRating * 20) * 0.6 +
          user.responseTimeScore * 0.2 +
          user.reliabilityScore * 0.2
        ),
      ),
    );

    user.updatedAt = new Date();

    return {
      review,
      reputation: user,
    };
  }

  registerCancellation(data: any) {
    const user = this.getOrCreateUser(
      data?.userId,
    );

    user.cancelledServices += 1;

    user.reliabilityScore = Math.max(
      0,
      user.reliabilityScore - 10,
    );

    user.reputationScore = Math.max(
      0,
      user.reputationScore - 5,
    );

    user.updatedAt = new Date();

    return user;
  }

  registerResponseTime(data: any) {
    const user = this.getOrCreateUser(
      data?.userId,
    );

    const minutes = Number(
      data?.minutes ?? 0,
    );

    if (minutes <= 2) {
      user.responseTimeScore = 100;
    } else if (minutes <= 5) {
      user.responseTimeScore = 90;
    } else if (minutes <= 10) {
      user.responseTimeScore = 75;
    } else {
      user.responseTimeScore = 50;
    }

    user.reputationScore = Math.max(
      0,
      Math.min(
        100,
        (
          (user.averageRating * 20) * 0.6 +
          user.responseTimeScore * 0.2 +
          user.reliabilityScore * 0.2
        ),
      ),
    );

    user.updatedAt = new Date();

    return user;
  }

  findAll() {
    return this.users;
  }

  findOne(userId: string) {
    return this.getOrCreateUser(userId);
  }
}
'@ | Set-Content "$reputation\reputation.service.ts" -Encoding UTF8

@'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { ReputationService } from './reputation.service';

@Controller('reputation')
export class ReputationController {
  constructor(
    private readonly reputationService: ReputationService,
  ) {}

  @Get()
  findAll(): any {
    return this.reputationService.findAll();
  }

  @Get(':userId')
  findOne(
    @Param('userId') userId: string,
  ): any {
    return this.reputationService.findOne(userId);
  }

  @Post('review')
  review(@Body() body: any): any {
    return this.reputationService.review(body);
  }

  @Post('cancel')
  cancel(@Body() body: any): any {
    return this.reputationService.registerCancellation(body);
  }

  @Post('response-time')
  responseTime(
    @Body() body: any,
  ): any {
    return this.reputationService.registerResponseTime(body);
  }
}
'@ | Set-Content "$reputation\reputation.controller.ts" -Encoding UTF8

@'
import { Module } from '@nestjs/common';

import { ReputationController } from './reputation.controller';
import { ReputationService } from './reputation.service';

@Module({
  controllers: [ReputationController],
  providers: [ReputationService],
  exports: [ReputationService],
})
export class ReputationModule {}
'@ | Set-Content "$reputation\reputation.module.ts" -Encoding UTF8

$appModule = "$backend\src\app.module.ts"

$appContent = Get-Content $appModule -Raw

if ($appContent -notmatch "ReputationModule") {

$appContent = $appContent -replace `
"import \{ WalletModule \} from './wallet/wallet.module';",
"import { WalletModule } from './wallet/wallet.module';
import { ReputationModule } from './reputation/reputation.module';"

$appContent = $appContent -replace `
"WalletModule,",
"WalletModule,
    ReputationModule,"

Set-Content $appModule $appContent -Encoding UTF8
}

Write-Host "========================================="
Write-Host "REPUTATION SYSTEM INSTALADO"
Write-Host "========================================="