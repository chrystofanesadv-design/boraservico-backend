import { Injectable, Logger } from '@nestjs/common';
import { UploadPremiumCreateDto, UploadPremiumEvidenceDto, UploadPremiumOcrDto, UploadPremiumKind, UploadPremiumVisibility } from './upload-premium.dto';

export interface UploadPremiumRecord {
  id: string;
  userId: string;
  orderId?: string;
  rfqId?: string;
  negotiationId?: string;
  disputeId?: string;
  kind: UploadPremiumKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  visibility: UploadPremiumVisibility;
  privatePath: string;
  publicPreviewUrl?: string;
  checksum?: string;
  photoUrl?: string;
  note?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  status: 'registered' | 'awaiting_storage' | 'stored' | 'ocr_pending' | 'ocr_analyzed' | 'blocked_by_antifraud';
}

export interface UploadPremiumOcrResult {
  id: string;
  uploadId?: string;
  userId: string;
  filename?: string;
  source: string;
  rawText: string;
  maskedText: string;
  blocked: boolean;
  riskScore: number;
  detected: string[];
  action: 'allow' | 'warn' | 'block' | 'admin_review';
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface UploadPremiumEvidenceRecord {
  id: string;
  orderId: string;
  userId: string;
  uploadId: string;
  evidenceType: string;
  note?: string;
  createdAt: string;
}

@Injectable()
export class UploadPremiumService {
  private readonly logger = new Logger(UploadPremiumService.name);
  private readonly uploads = new Map<string, UploadPremiumRecord>();
  private readonly ocrResults: UploadPremiumOcrResult[] = [];
  private readonly evidences: UploadPremiumEvidenceRecord[] = [];

  health(): Record<string, unknown> {
    return {
      status: 'ok',
      module: 'upload-premium',
      uploadsInMemory: this.uploads.size,
      ocrResultsInMemory: this.ocrResults.length,
      evidencesInMemory: this.evidences.length,
      productionReady: false,
      note: 'Base pronta para storage privado real, CDN privada e OCR/visao integrado ao antifraude enterprise.',
    };
  }

  registerUpload(dto: UploadPremiumCreateDto): UploadPremiumRecord {
    const now = new Date().toISOString();
    const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const visibility = dto.visibility ?? 'private';
    const storageProvider = dto.storageProvider ?? 'local_private';
    const safeFilename = this.safeFilename(dto.filename);

    const record: UploadPremiumRecord = {
      id,
      userId: dto.userId ?? 'local-user',
      orderId: dto.orderId,
      rfqId: dto.rfqId,
      negotiationId: dto.negotiationId,
      disputeId: dto.disputeId,
      kind: dto.kind,
      filename: safeFilename,
      mimeType: dto.mimeType ?? 'application/octet-stream',
      sizeBytes: Number(dto.sizeBytes ?? 0),
      storageProvider,
      visibility,
      privatePath: `private/${dto.userId ?? 'local-user'}/${id}/${safeFilename}`,
      publicPreviewUrl: visibility === 'public_preview' ? `/upload-premium/preview/${id}` : undefined,
      checksum: dto.checksum,
      photoUrl: dto.photoUrl,
      note: dto.note,
      metadata: dto.metadata ?? {},
      createdAt: now,
      status: dto.kind === 'OCR_SCAN' ? 'ocr_pending' : 'registered',
    };

    this.uploads.set(id, record);
    this.logger.log(`Upload premium registrado: ${record.id} (${record.kind})`);
    return record;
  }

  analyzeOcr(dto: UploadPremiumOcrDto): UploadPremiumOcrResult {
    const now = new Date().toISOString();
    const rawText = String(dto.text ?? '');
    const detected = this.detectExternalContact(rawText);
    const riskScore = Math.min(100, detected.length * 25);
    const blocked = detected.length > 0;

    const result: UploadPremiumOcrResult = {
      id: `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      uploadId: dto.uploadId,
      userId: dto.userId ?? 'local-user',
      filename: dto.filename,
      source: dto.source ?? 'manual_test',
      rawText,
      maskedText: this.maskSensitive(rawText),
      blocked,
      riskScore,
      detected,
      action: blocked ? 'block' : 'allow',
      createdAt: now,
      metadata: dto.metadata ?? {},
    };

    this.ocrResults.unshift(result);

    if (dto.uploadId) {
      const upload = this.uploads.get(dto.uploadId);
      if (upload) {
        upload.status = blocked ? 'blocked_by_antifraud' : 'ocr_analyzed';
        upload.metadata = { ...upload.metadata, ocrResultId: result.id, ocrDetected: detected };
        this.uploads.set(upload.id, upload);
      }
    }

    return result;
  }

  attachEvidence(dto: UploadPremiumEvidenceDto): UploadPremiumEvidenceRecord {
    if (!this.uploads.has(dto.uploadId)) {
      throw new Error(`Upload nao encontrado: ${dto.uploadId}`);
    }

    const record: UploadPremiumEvidenceRecord = {
      id: `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orderId: dto.orderId,
      userId: dto.userId ?? 'local-user',
      uploadId: dto.uploadId,
      evidenceType: dto.evidenceType ?? 'verification',
      note: dto.note,
      createdAt: new Date().toISOString(),
    };

    this.evidences.unshift(record);
    return record;
  }

  listUploads(userId?: string): UploadPremiumRecord[] {
    const allUploads = Array.from(this.uploads.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!userId) {
      return allUploads.slice(0, 100);
    }
    return allUploads.filter((upload) => upload.userId === userId).slice(0, 100);
  }

  listOcrResults(userId?: string): UploadPremiumOcrResult[] {
    if (!userId) {
      return this.ocrResults.slice(0, 100);
    }
    return this.ocrResults.filter((result) => result.userId === userId).slice(0, 100);
  }

  listEvidences(orderId?: string): UploadPremiumEvidenceRecord[] {
    if (!orderId) {
      return this.evidences.slice(0, 100);
    }
    return this.evidences.filter((evidence) => evidence.orderId === orderId).slice(0, 100);
  }

  private safeFilename(filename: string): string {
    return String(filename ?? 'arquivo')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
  }

  private detectExternalContact(text: string): string[] {
    const patterns: Array<{ label: string; regex: RegExp }> = [
      { label: 'telefone', regex: /(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/i },
      { label: 'email', regex: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
      { label: 'link', regex: /(https?:\/\/|www\.|\.com\b|\.br\b|\.net\b|\.io\b)/i },
      { label: 'whatsapp', regex: /\b(whats|zap|wpp|chama no zap|manda mensagem)\b/i },
      { label: 'instagram', regex: /\b(instagram|insta|@\w{3,})\b/i },
      { label: 'tiktok', regex: /\b(tiktok|tik tok)\b/i },
      { label: 'telegram', regex: /\b(telegram|tel[eÃ©]gram)\b/i },
      { label: 'endereco', regex: /\b(rua|avenida|av\.|bairro|numero|n[Âºo]|casa|apto|apartamento|cep)\b/i },
      { label: 'qr_code', regex: /\b(qr|qrcode|qr code|pix copia e cola)\b/i },
    ];

    return patterns.filter((pattern) => pattern.regex.test(text)).map((pattern) => pattern.label);
  }

  private maskSensitive(text: string): string {
    return String(text ?? '')
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email bloqueado]')
      .replace(/(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/g, '[telefone bloqueado]')
      .replace(/(https?:\/\/\S+|www\.\S+)/gi, '[link bloqueado]')
      .replace(/@\w{3,}/g, '[rede social bloqueada]');
  }
}
