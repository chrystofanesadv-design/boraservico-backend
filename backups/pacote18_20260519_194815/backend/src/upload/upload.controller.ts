import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import {
  getProofStorageDir,
  getProofStorageProvider,
  getStorageCdnBaseUrl,
} from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { PushRealService } from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UploadProofDto } from './dto/upload-proof.dto';

const maxProofSize = 10 * 1024 * 1024;
const allowedProofMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const proofUploadDirectory =
  getProofStorageDir() ??
  join(process.cwd(), 'storage', 'private', 'proofs');

@Controller('upload')
export class UploadController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushRealService: PushRealService,
  ) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'upload',
      proofUploadReady: true,
      storage: {
        provider: getProofStorageProvider(),
        private: true,
        cloudReady: this.cloudStorageReady(),
        cdnConfigured: Boolean(getStorageCdnBaseUrl()),
        maxBytes: maxProofSize,
        allowedMimeTypes: Array.from(allowedProofMimeTypes),
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('proofs')
  @UseGuards(JwtAuthGuard)
  async listProofs(@Req() req: any, @Query('orderId') orderId?: string) {
    if (orderId) {
      await this.assertCanViewOrder(req, orderId);
    }

    const proofs = await this.prisma.proofUpload.findMany({
      where: orderId ? { orderId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return proofs.map((proof) => this.toPublicProof(proof));
  }

  @Get('proofs/:orderId')
  @UseGuards(JwtAuthGuard)
  async listProofsByOrder(@Req() req: any, @Param('orderId') orderId: string) {
    await this.assertCanViewOrder(req, orderId);

    const proofs = await this.prisma.proofUpload.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return proofs.map((proof) => this.toPublicProof(proof));
  }

  @Get('proof/:proofId/file')
  @UseGuards(JwtAuthGuard)
  async getProofFile(
    @Req() req: any,
    @Param('proofId') proofId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const proof = await this.prisma.proofUpload.findUnique({
      where: { id: proofId },
      include: { order: true },
    });

    if (!proof) {
      throw new NotFoundException('Prova nao encontrada');
    }

    this.assertCanViewProof(req, proof);

    const metadata = this.readMetadata(proof.metadata);
    const filePath = this.resolvePrivatePath(proof.storageKey);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo da prova nao encontrado');
    }

    response.set({
      'Content-Type': this.readString(metadata.mimetype) ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${this.safeDownloadName(
        this.readString(metadata.originalName) ?? proof.storageKey,
      )}"`,
      'Cache-Control': 'private, max-age=60',
    });

    return new StreamableFile(createReadStream(filePath));
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
          const extension = extname(file.originalname).toLowerCase();
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, `proof-${unique}${extension}`);
        },
      }),
      limits: {
        fileSize: maxProofSize,
      },
      fileFilter: (_req, file, callback) => {
        if (!allowedProofMimeTypes.has(file.mimetype)) {
          return callback(
            new BadRequestException('Tipo de arquivo de prova nao permitido'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async uploadProof(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadProofDto,
    @Query('visibility') queryVisibility: UploadProofDto['visibility'],
    @Query('type') queryType: string,
    @Query('note') queryNote: string,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo da prova obrigatorio');
    }

    const orderId = this.requireString(body?.orderId, 'orderId obrigatorio');
    const actorId = this.resolveActorId(req, body?.userId);
    await this.assertCanViewOrder(req, orderId);

    const visibility = this.normalizeVisibility(
      body?.visibility ?? queryVisibility,
    );
    const type = this.readString(body?.type ?? queryType) ?? 'CHECKOUT_PROOF';
    const note =
      this.readString(body?.note ?? queryNote) ??
      'Prova enviada pelo app BoraServico';
    const storageKey = file.filename;

    const proof = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.proofUpload.create({
        data: {
          orderId,
          userId: actorId,
          fileUrl: 'private://pending',
          storageKey,
          visibility,
          metadata: {
            type,
            note,
            filename: file.filename,
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            storageProvider: getProofStorageProvider(),
            private: true,
            cloudReady: this.cloudStorageReady(),
          },
        },
      });

      const fileUrl = `/upload/proof/${created.id}/file`;

      const updated = await tx.proofUpload.update({
        where: { id: created.id },
        data: { fileUrl },
      });

      await tx.operationalTimelineEvent.create({
        data: {
          orderId,
          type: 'PROOF_UPLOADED',
          title: 'Prova enviada',
          description: note,
          state: 'COMPLETE',
          metadata: {
            proofId: updated.id,
            proofUrl: fileUrl,
            visibility,
            phase: 'proof',
            subtitle: 'Foto, evidencia ou validacao anexada.',
          },
        },
      });

      return updated;
    });

    const publicProof = this.toPublicProof(proof);
    this.emitProof(publicProof);
    void this.pushRealService
      .notifyOrderEvent('PROOF_UPLOADED', publicProof)
      .catch(() => undefined);

    return publicProof;
  }

  private emitProof(proof: any) {
    RealtimeGateway.emitOperational('proof-uploaded', {
      orderId: proof.orderId,
      proofId: proof.id,
      type: proof.type,
      note: proof.note,
      url: proof.url,
      fileUrl: proof.fileUrl,
      visibility: proof.visibility,
      message: proof.note,
      timestamp: proof.uploadedAt,
    });
  }

  private toPublicProof(proof: any) {
    const metadata = this.readMetadata(proof.metadata);
    const uploadedAt =
      proof.createdAt?.toISOString?.() ??
      proof.createdAt ??
      new Date().toISOString();

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
      mimetype: this.readString(metadata.mimetype) || 'application/octet-stream',
      size: Number(metadata.size ?? 0),
      url: proof.fileUrl,
      fileUrl: proof.fileUrl,
      storageKey: proof.storageKey,
      visibility: proof.visibility,
      private: true,
      cloudReady: Boolean(metadata.cloudReady ?? false),
      uploadedAt,
      timestamp: uploadedAt,
    };
  }

  private async assertCanViewOrder(req: any, orderId: string) {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clientId: true,
        professionalId: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Ordem nao encontrada');
    }

    if (this.isAdmin(req)) {
      return order;
    }

    const userId = this.readString(req.user?.userId);

    if (userId && (order.clientId === userId || order.professionalId === userId)) {
      return order;
    }

    throw new ForbiddenException('Acesso negado a esta ordem');
  }

  private assertCanViewProof(req: any, proof: any) {
    if (this.isAdmin(req)) {
      return;
    }

    const userId = this.readString(req.user?.userId);

    if (!userId) {
      throw new ForbiddenException('Usuario autenticado obrigatorio');
    }

    if (proof.visibility === 'PUBLIC') {
      return;
    }

    if (proof.visibility === 'PRIVATE' && proof.userId === userId) {
      return;
    }

    if (
      proof.visibility === 'ORDER_PARTICIPANTS' &&
      (proof.order?.clientId === userId || proof.order?.professionalId === userId)
    ) {
      return;
    }

    throw new ForbiddenException('Acesso negado a esta prova');
  }

  private resolveActorId(req: any, requestedUserId?: string) {
    const authenticatedUserId = this.requireString(
      req.user?.userId,
      'usuario autenticado obrigatorio',
    );

    if (this.isAdmin(req)) {
      return this.readString(requestedUserId) ?? authenticatedUserId;
    }

    return authenticatedUserId;
  }

  private resolvePrivatePath(storageKey: string) {
    const normalizedKey = this.requireString(storageKey, 'storageKey obrigatorio');

    if (normalizedKey.includes('..') || normalizedKey.includes('/') || normalizedKey.includes('\\')) {
      throw new ForbiddenException('storageKey invalido');
    }

    return join(proofUploadDirectory, normalizedKey);
  }

  private normalizeVisibility(value: any) {
    const visibility = this.readString(value)?.toUpperCase();
    const allowed = ['PRIVATE', 'ORDER_PARTICIPANTS', 'SUPPORT', 'PUBLIC'];

    return visibility && allowed.includes(visibility)
      ? (visibility as UploadProofDto['visibility'])
      : 'ORDER_PARTICIPANTS';
  }

  private safeDownloadName(value: string) {
    return value.replace(/["\r\n]/g, '').slice(0, 120) || 'proof';
  }

  private cloudStorageReady() {
    return (
      getProofStorageProvider() !== 'local-private' ||
      Boolean(getStorageCdnBaseUrl())
    );
  }

  private isAdmin(req: any) {
    return this.readString(req.user?.role)?.toUpperCase() === 'ADMIN';
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

  private requireString(value: any, message: string) {
    const text = this.readString(value);

    if (!text) {
      throw new BadRequestException(message);
    }

    return text;
  }
}
