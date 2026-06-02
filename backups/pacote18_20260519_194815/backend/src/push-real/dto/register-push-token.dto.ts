import { IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @MinLength(20)
  token: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
