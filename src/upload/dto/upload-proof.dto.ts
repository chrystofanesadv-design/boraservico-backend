import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UploadProofDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  orderId?: string;

  @IsOptional()
  @IsString()
  requestId?: string;

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
  @IsString()
  lat?: string;

  @IsOptional()
  @IsString()
  lng?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsString()
  accuracy?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  imageQuality?: string;

  @IsOptional()
  @IsString()
  maxWidth?: string;

  @IsOptional()
  @IsString()
  ocrText?: string;

  @IsOptional()
  @IsIn(['PRIVATE', 'ORDER_PARTICIPANTS', 'SUPPORT', 'PUBLIC'])
  visibility?: 'PRIVATE' | 'ORDER_PARTICIPANTS' | 'SUPPORT' | 'PUBLIC';
}
