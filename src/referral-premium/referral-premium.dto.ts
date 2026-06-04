import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateReferralPremiumDto {
  @IsString()
  referrerUserId!: string;

  @IsString()
  referredUserId!: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}

export class ReferralBonusPreviewDto {
  @IsString()
  referrerUserId!: string;

  @IsString()
  referredUserId!: string;

  @IsString()
  orderId!: string;

  @IsNumber()
  @Min(0)
  serviceAmount!: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ReferralReminderDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  createdAt?: string;
}
