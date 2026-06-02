import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class TypingDto {
  @IsString()
  @MinLength(1)
  orderId: string;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsOptional()
  @IsBoolean()
  isTyping?: boolean;
}
