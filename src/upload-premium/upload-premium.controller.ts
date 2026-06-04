import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UploadPremiumCreateDto, UploadPremiumEvidenceDto, UploadPremiumOcrDto } from './upload-premium.dto';
import type { UploadPremiumEvidenceRecord, UploadPremiumOcrResult, UploadPremiumRecord } from './upload-premium.service';
import { UploadPremiumService } from './upload-premium.service';

@Controller('upload-premium')
export class UploadPremiumController {
  constructor(private readonly uploadPremiumService: UploadPremiumService) {}

  @Get()
  health(): Record<string, unknown> {
    return this.uploadPremiumService.health();
  }

  @Get('uploads')
  uploads(@Query('userId') userId?: string): UploadPremiumRecord[] {
    return this.uploadPremiumService.listUploads(userId);
  }

  @Post('uploads')
  registerUpload(@Body() payload: UploadPremiumCreateDto): UploadPremiumRecord {
    return this.uploadPremiumService.registerUpload(payload);
  }

  @Post('ocr/analyze')
  analyzeOcr(@Body() payload: UploadPremiumOcrDto): UploadPremiumOcrResult {
    return this.uploadPremiumService.analyzeOcr(payload);
  }

  @Get('ocr/results')
  ocrResults(@Query('userId') userId?: string): UploadPremiumOcrResult[] {
    return this.uploadPremiumService.listOcrResults(userId);
  }

  @Post('evidences')
  attachEvidence(@Body() payload: UploadPremiumEvidenceDto): UploadPremiumEvidenceRecord {
    return this.uploadPremiumService.attachEvidence(payload);
  }

  @Get('evidences')
  evidences(@Query('orderId') orderId?: string): UploadPremiumEvidenceRecord[] {
    return this.uploadPremiumService.listEvidences(orderId);
  }
}
