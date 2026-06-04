export type UploadPremiumKind =
  | 'SERVICE_PROOF_PHOTO'
  | 'CHECK_IN_PHOTO'
  | 'CHECK_OUT_PHOTO'
  | 'DISPUTE_EVIDENCE'
  | 'DOCUMENT_VERIFICATION'
  | 'PROFILE_PHOTO'
  | 'OCR_SCAN';

export type UploadPremiumVisibility = 'private' | 'restricted' | 'public_preview';

export class UploadPremiumCreateDto {
  userId?: string;
  orderId?: string;
  rfqId?: string;
  negotiationId?: string;
  disputeId?: string;
  kind!: UploadPremiumKind;
  filename!: string;
  mimeType?: string;
  sizeBytes?: number;
  storageProvider?: 'local_private' | 's3_private' | 'firebase_storage' | 'cdn_private';
  visibility?: UploadPremiumVisibility;
  checksum?: string;
  photoUrl?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export class UploadPremiumOcrDto {
  uploadId?: string;
  userId?: string;
  filename?: string;
  text!: string;
  source?: 'photo' | 'document' | 'chat_image' | 'manual_test';
  metadata?: Record<string, unknown>;
}

export class UploadPremiumEvidenceDto {
  orderId!: string;
  userId?: string;
  uploadId!: string;
  evidenceType?: 'before' | 'during' | 'after' | 'dispute' | 'verification';
  note?: string;
}
