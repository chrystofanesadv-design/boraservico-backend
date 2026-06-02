import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @IsString()
  @MinLength(1)
  orderId: string;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsOptional()
  @IsIn(['CLIENT', 'PROFESSIONAL', 'SYSTEM', 'ADMIN'])
  senderRole?: 'CLIENT' | 'PROFESSIONAL' | 'SYSTEM' | 'ADMIN';

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;
}
