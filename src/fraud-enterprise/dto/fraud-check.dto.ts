import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class FraudCheckDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  source!: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  orderId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  professionalId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  clientId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  content?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1200)
  ocrText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1200)
  transcript?: string;

  @IsBoolean()
  @IsOptional()
  hasImage?: boolean;
}
