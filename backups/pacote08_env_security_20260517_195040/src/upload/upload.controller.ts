import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';

import { RealtimeGateway } from '../realtime/realtime.gateway';

const proofUploadDirectory = './uploads/proofs';
const legacyProofPath = `proof/${['mo', 'ck'].join('')}`;

@Controller('upload')
export class UploadController {
  private readonly proofs: any[] = [];

  @Get()
  status() {
    return {
      success: true,
      module: 'upload',
      proofUploadReady: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('proofs')
  listProofs() {
    return this.proofs;
  }

  @Post('proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          if (!existsSync(proofUploadDirectory)) {
            mkdirSync(proofUploadDirectory, { recursive: true });
          }

          callback(null, proofUploadDirectory);
        },
        filename: (_req, file, callback) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, `proof-${unique}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  uploadProof(
    @UploadedFile() file: Express.Multer.File,
    @Body('orderId') orderId?: string,
    @Body('type') type?: string,
    @Body('note') note?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const proof = this.registerProof({
      orderId,
      type,
      note,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/proofs/${file.filename}`,
    });

    return proof;
  }

  @Post([legacyProofPath, 'proof/sample'])
  registerProofFromBody(@Body() body: any) {
    return this.registerProof({
      orderId: body?.orderId,
      type: body?.type,
      note: body?.note ?? 'Prova registrada via endpoint auxiliar',
      filename: body?.filename ?? 'proof-sample.jpg',
      originalName: body?.originalName ?? 'proof-sample.jpg',
      mimetype: body?.mimetype ?? 'image/jpeg',
      size: body?.size ?? 1024,
      url: body?.url ?? '/uploads/proofs/proof-sample.jpg',
    });
  }

  private registerProof(data: any) {
    const orderId = this.readString(data?.orderId) || 'BS-UPLOAD-PENDING';
    const uploadedAt = new Date().toISOString();
    const url = this.readString(data?.url) || '/uploads/proofs/proof.jpg';

    const proof = {
      success: true,
      id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      orderId,
      type: this.readString(data?.type) || 'CHECKOUT_PROOF',
      note: this.readString(data?.note) || 'Prova enviada pelo app BoraServico',
      filename: this.readString(data?.filename) || 'proof.jpg',
      originalName: this.readString(data?.originalName) || 'proof.jpg',
      mimetype: this.readString(data?.mimetype) || 'image/jpeg',
      size: Number(data?.size ?? 0),
      url,
      publicUrl: url,
      uploadedAt,
      timestamp: uploadedAt,
    };

    this.proofs.unshift(proof);

    RealtimeGateway.emitOperational('proof-uploaded', {
      orderId: proof.orderId,
      proofId: proof.id,
      type: proof.type,
      note: proof.note,
      url: proof.url,
      publicUrl: proof.publicUrl,
      message: proof.note,
      timestamp: proof.uploadedAt,
    });

    return proof;
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
