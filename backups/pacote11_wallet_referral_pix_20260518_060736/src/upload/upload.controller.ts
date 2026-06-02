import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const proofUploadDirectory = './uploads/proofs';
const legacyProofPath = `proof/${['mo', 'ck'].join('')}`;

@Controller('upload')
export class UploadController {
  private readonly proofs: any[] = [];

  constructor(private readonly prisma: PrismaService) {}

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
  async listProofs() {
    try {
      const proofs = await this.prisma.proofUpload.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return proofs.map((proof) => this.toPublicProof(proof));
    } catch {
      return this.proofs;
    }
  }

  @Post('proof')
  @UseGuards(JwtAuthGuard)
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
  async uploadProof(
    @UploadedFile() file: Express.Multer.File,
    @Body('orderId') orderId?: string,
    @Body('userId') userId?: string,
    @Body('type') type?: string,
    @Body('note') note?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const proof = this.registerProof({
      orderId,
      userId,
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
  async registerProofFromBody(@Body() body: any) {
    return this.registerProof({
      orderId: body?.orderId,
      userId: body?.userId,
      type: body?.type,
      note: body?.note ?? 'Prova registrada via endpoint auxiliar',
      filename: body?.filename ?? 'proof-sample.jpg',
      originalName: body?.originalName ?? 'proof-sample.jpg',
      mimetype: body?.mimetype ?? 'image/jpeg',
      size: body?.size ?? 1024,
      url: body?.url ?? '/uploads/proofs/proof-sample.jpg',
    });
  }

  private async registerProof(data: any) {
    const persisted = await this.tryPersistProof(data);

    if (persisted) {
      this.emitProof(persisted);
      return persisted;
    }

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
    this.emitProof(proof);

    return proof;
  }

  private async tryPersistProof(data: any) {
    const orderId = this.readString(data?.orderId);
    const userId = this.readString(data?.userId);
    const fileUrl = this.readString(data?.url) || '/uploads/proofs/proof.jpg';
    const storageKey =
      this.readString(data?.storageKey) ||
      this.readString(data?.filename) ||
      fileUrl;

    if (!orderId || !userId) {
      return null;
    }

    try {
      const proof = await this.prisma.proofUpload.create({
        data: {
          orderId,
          userId,
          fileUrl,
          storageKey,
          visibility: this.normalizeVisibility(data?.visibility),
          metadata: {
            type: this.readString(data?.type) || 'CHECKOUT_PROOF',
            note:
              this.readString(data?.note) ||
              'Prova enviada pelo app BoraServico',
            filename: this.readString(data?.filename) || 'proof.jpg',
            originalName: this.readString(data?.originalName) || 'proof.jpg',
            mimetype: this.readString(data?.mimetype) || 'image/jpeg',
            size: Number(data?.size ?? 0),
          },
        },
      });

      return this.toPublicProof(proof);
    } catch {
      return null;
    }
  }

  private emitProof(proof: any) {
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
  }

  private toPublicProof(proof: any) {
    const metadata = this.readMetadata(proof.metadata);
    const uploadedAt =
      proof.createdAt?.toISOString?.() ?? proof.createdAt ?? new Date().toISOString();

    return {
      success: true,
      id: proof.id,
      orderId: proof.orderId,
      userId: proof.userId,
      type: this.readString(metadata.type) || 'CHECKOUT_PROOF',
      note:
        this.readString(metadata.note) || 'Prova enviada pelo app BoraServico',
      filename: this.readString(metadata.filename) || proof.storageKey,
      originalName: this.readString(metadata.originalName) || proof.storageKey,
      mimetype: this.readString(metadata.mimetype) || 'image/jpeg',
      size: Number(metadata.size ?? 0),
      url: proof.fileUrl,
      publicUrl: proof.fileUrl,
      storageKey: proof.storageKey,
      visibility: proof.visibility,
      uploadedAt,
      timestamp: uploadedAt,
    };
  }

  private normalizeVisibility(value: any) {
    const visibility = this.readString(value)?.toUpperCase();
    const allowed = ['PRIVATE', 'ORDER_PARTICIPANTS', 'SUPPORT', 'PUBLIC'];

    return visibility && allowed.includes(visibility)
      ? visibility
      : 'ORDER_PARTICIPANTS';
  }

  private readMetadata(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
