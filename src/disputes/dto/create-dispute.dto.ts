import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDisputeDto {
  @IsString()
  @MinLength(1)
  orderId: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsNumber()
  escrowAmount?: number;
}
