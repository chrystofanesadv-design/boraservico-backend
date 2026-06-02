import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class SendPushDto {
  @IsString()
  userId: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  body: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}
