import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UploadProofDto {
  @IsString()
  @MinLength(1)
  orderId: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsIn(['PRIVATE', 'ORDER_PARTICIPANTS', 'SUPPORT', 'PUBLIC'])
  visibility?: 'PRIVATE' | 'ORDER_PARTICIPANTS' | 'SUPPORT' | 'PUBLIC';
}
