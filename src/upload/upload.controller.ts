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
import { memoryStorage } from 'multer';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { getStorageSignedUrlTtlSeconds } from '../config/env';
import { PrivateStorageService } from '../private-storage/private-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushRealService } from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { validatePhotoSafety } from '../security/contact-filter';
import { UploadProofDto } from './dto/upload-proof.dto';

const maxProofSize = 50 * 1024 * 1024;
const allowedProofMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

@Controller('upload')
export class UploadController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushRealService: PushRealService,
    private readonly privateStorage: PrivateStorageService,
  ) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'upload',
      proofUploadReady: true,
      storage: {
        ...this.privateStorage.status(),
        maxBytes: maxProofSize,
        allowedMimeTypes: Array.from(allowedProofMimeTypes),
      },
      supportedTypes: [
        'RFQ_PHOTO',
        'CHECKOUT_PROOF',
        'DISPUTE_EVIDENCE',
        'BEFORE_PHOTO',
        'AFTER_PHOTO',
      ],
      metadataReady: true,
      ocrBaseReady: true,
      previewReady: true,
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

    if (metadata.storageProvider === 'cloudflare-r2') {
      const signed = await this.privateStorage.signedReadUrl(proof.storageKey);
      response.redirect(signed.url);
      return;
    }

    const stream = this.privateStorage.openLocalStream(proof.storageKey);

    if (!stream) {
      throw new NotFoundException('Arquivo da prova nao encontrado');
    }

    response.set({
      'Content-Type': this.readString(metadata.mimetype) ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${this.safeDownloadName(
        this.readString(metadata.originalName) ?? proof.storageKey,
      )}"`,
      'Cache-Control': 'private, max-age=60',
    });

    return new StreamableFile(stream);
  }

  @Get('proof/:proofId/signed-url')
  @UseGuards(JwtAuthGuard)
  async getProofSignedUrl(@Req() req: any, @Param('proofId') proofId: string) {
    const proof = await this.prisma.proofUpload.findUnique({
      where: { id: proofId },
      include: { order: true },
    });

    if (!proof) {
      throw new NotFoundException('Prova nao encontrada');
    }

    this.assertCanViewProof(req, proof);

    const signed = await this.privateStorage.signedReadUrl(proof.storageKey);

    return {
      success: true,
      proofId: proof.id,
      storageKey: proof.storageKey,
      ...signed,
    };
  }

  @Get('private-file/:storageToken')
  async getLocalSignedFile(
    @Param('storageToken') storageToken: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const storageKey = this.privateStorage.decodeStorageToken(storageToken);

    if (!this.privateStorage.verifyLocalSignedUrl(storageKey, expires, signature)) {
      throw new ForbiddenException('URL assinada invalida ou expirada');
    }

    const stream = this.privateStorage.openLocalStream(storageKey);

    if (!stream) {
      throw new NotFoundException('Arquivo privado nao encontrado');
    }

    response.set({
      'Content-Type': 'application/octet-stream',
      'Cache-Control': `private, max-age=${getStorageSignedUrlTtlSeconds()}`,
    });

    return new StreamableFile(stream);
  }

  @Post('proof')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
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

    const actorId = this.resolveActorId(req, body?.userId);
    const visibility = this.normalizeVisibility(
      body?.visibility ?? queryVisibility,
    ) ?? 'ORDER_PARTICIPANTS';
    const type = this.normalizeProofType(body?.type ?? queryType);
    const note =
      this.readString(body?.note ?? queryNote) ??
      'Prova enviada pelo app BoraServico';
    const safety = validatePhotoSafety({
      filename: file.originalname,
      mimetype: file.mimetype,
      metadata: {
        type,
        note,
        source: body?.source,
        ocrText: body?.ocrText,
      },
    });

    if (type === 'RFQ_PHOTO' && !this.readString(body?.orderId)) {
      const requestId = this.requireString(
        body?.requestId,
        'requestId obrigatorio para foto do pedido',
      );

      return this.uploadRfqPhoto({
        req,
        file,
        body,
        requestId,
        actorId,
        type,
        note,
        visibility,
        safety,
      });
    }

    const orderId = this.requireString(body?.orderId, 'orderId obrigatorio');
    await this.assertCanViewOrder(req, orderId);

    const stored = await this.privateStorage.uploadPrivateObject({
      buffer: file.buffer,
      orderId,
      originalName: file.originalname,
      contentType: file.mimetype,
      prefix: 'proofs',
    });
    const storageKey = stored.storageKey;

    const proof = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.proofUpload.create({
        data: {
          orderId,
          userId: actorId,
          fileUrl: stored.privateUrl,
          storageKey,
          visibility,
          metadata: JSON.stringify({
            type,
            note,
            filename: storageKey.split('/').pop(),
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: stored.size,
            storageProvider: stored.provider,
            private: true,
            cloudReady: stored.cloudReady,
            uploadKind: type,
            previewReady: file.mimetype.startsWith('image/'),
            fullscreenPreview: file.mimetype.startsWith('image/'),
            compression: {
              clientImageQuality: this.readString(body?.imageQuality),
              maxWidth: this.readString(body?.maxWidth),
              originalSize: file.size,
              storedSize: stored.size,
            },
            gps: {
              lat: this.readOptionalNumber(body?.lat ?? body?.latitude),
              lng: this.readOptionalNumber(body?.lng ?? body?.longitude),
              accuracy: this.readOptionalNumber(body?.accuracy),
            },
            ocr: this.ocrBase(file, body, safety),
            antifraud: safety,
          }),
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
          metadata: JSON.stringify({
            proofId: updated.id,
            proofUrl: fileUrl,
            visibility,
            phase: 'proof',
            uploadKind: type,
            antifraudStatus: safety.status,
            subtitle: 'Foto, evidencia ou validacao anexada.',
          }),
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

  private async uploadRfqPhoto(input: {
    req: any;
    file: Express.Multer.File;
    body: UploadProofDto;
    requestId: string;
    actorId: string;
    type: string;
    note: string;
    visibility: string;
    safety: any;
  }) {
    await this.assertCanViewRequest(input.req, input.requestId);

    const stored = await this.privateStorage.uploadPrivateObject({
      buffer: input.file.buffer,
      orderId: input.requestId,
      originalName: input.file.originalname,
      contentType: input.file.mimetype,
      prefix: 'rfq',
    });
    const fileUrl = stored.privateUrl;
    const metadata = {
      id: `rfq-${Date.now()}`,
      requestId: input.requestId,
      userId: input.actorId,
      type: input.type,
      note: input.note,
      filename: stored.storageKey.split('/').pop(),
      originalName: input.file.originalname,
      mimetype: input.file.mimetype,
      size: stored.size,
      storageKey: stored.storageKey,
      url: fileUrl,
      fileUrl,
      visibility: input.visibility,
      private: true,
      cloudReady: stored.cloudReady,
      uploadKind: input.type,
      previewReady: input.file.mimetype.startsWith('image/'),
      fullscreenPreview: input.file.mimetype.startsWith('image/'),
      compression: {
        clientImageQuality: this.readString(input.body?.imageQuality),
        maxWidth: this.readString(input.body?.maxWidth),
        originalSize: input.file.size,
        storedSize: stored.size,
      },
      ocr: this.ocrBase(input.file, input.body, input.safety),
      antifraud: input.safety,
      uploadedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };

    const request = await this.prisma.requestForQuote.findUnique({
      where: { id: input.requestId },
      select: { photos: true },
    });
    const photos = this.readJsonArray(request?.photos);
    photos.push(metadata);

    await this.prisma.requestForQuote.update({
      where: { id: input.requestId },
      data: { photos: JSON.stringify(photos) },
    });

    RealtimeGateway.emitOperational('proof-uploaded', {
      requestId: input.requestId,
      type: input.type,
      url: fileUrl,
      fileUrl,
      message: input.note,
      antifraudStatus: input.safety.status,
      previewReady: metadata.previewReady,
      timestamp: metadata.timestamp,
    });

    return {
      success: true,
      ...metadata,
    };
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
      antifraudStatus: proof.antifraud?.status,
      previewReady: proof.previewReady,
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
      uploadKind: this.readString(metadata.uploadKind) || this.readString(metadata.type),
      previewReady: Boolean(metadata.previewReady),
      fullscreenPreview: Boolean(metadata.fullscreenPreview),
      compression: metadata.compression ?? null,
      gps: metadata.gps ?? null,
      ocr: metadata.ocr ?? null,
      antifraud: metadata.antifraud ?? null,
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

  private async assertCanViewRequest(req: any, requestId: string) {
    const request = await this.prisma.requestForQuote.findUnique({
      where: { id: requestId },
      select: { id: true, clientId: true },
    });

    if (!request) {
      throw new BadRequestException('Pedido nao encontrado');
    }

    if (this.isAdmin(req)) {
      return request;
    }

    const userId = this.readString(req.user?.userId);

    if (userId && request.clientId === userId) {
      return request;
    }

    throw new ForbiddenException('Acesso negado a este pedido');
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

  private normalizeVisibility(value: any) {
    const visibility = this.readString(value)?.toUpperCase();
    const allowed = ['PRIVATE', 'ORDER_PARTICIPANTS', 'SUPPORT', 'PUBLIC'];

    return visibility && allowed.includes(visibility)
      ? (visibility as UploadProofDto['visibility'])
      : 'ORDER_PARTICIPANTS';
  }

  private normalizeProofType(value: any) {
    const type = this.readString(value)?.toUpperCase().replace(/[\s-]+/g, '_');
    const allowed = [
      'RFQ_PHOTO',
      'CHECKOUT_PROOF',
      'DISPUTE_EVIDENCE',
      'BEFORE_PHOTO',
      'AFTER_PHOTO',
    ];

    return type && allowed.includes(type) ? type : 'CHECKOUT_PROOF';
  }

  private ocrBase(file: Express.Multer.File, body: UploadProofDto, safety: any) {
    const provided = this.readString(body?.ocrText);

    return {
      configured: false,
      extractedText: provided ?? '',
      pending: !provided,
      scanReady: true,
      signals: safety.reasons ?? [],
      source: file.mimetype.startsWith('image/') ? 'image' : 'document',
    };
  }

  private safeDownloadName(value: string) {
    return value.replace(/["\r\n]/g, '').slice(0, 120) || 'proof';
  }

  private isAdmin(req: any) {
    return this.readString(req.user?.role)?.toUpperCase() === 'ADMIN';
  }

  private readMetadata(value: any): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      try {
        const decoded = JSON.parse(value);
        return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
          ? decoded
          : {};
      } catch {
        return {};
      }
    }

    return {};
  }

  private readJsonArray(value: any): any[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      try {
        const decoded = JSON.parse(value);
        return Array.isArray(decoded) ? decoded : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readOptionalNumber(value: any) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private requireString(value: any, message: string) {
    const text = this.readString(value);

    if (!text) {
      throw new BadRequestException(message);
    }

    return text;
  }
}
