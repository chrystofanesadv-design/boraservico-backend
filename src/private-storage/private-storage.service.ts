import { BadRequestException, Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'path';

import {
  getCloudflareR2Config,
  getJwtSecret,
  getProofStorageDir,
  getProofStorageProvider,
  getStorageCdnBaseUrl,
  getStorageSignedUrlTtlSeconds,
  isCloudflareR2Ready,
} from '../config/env';

export interface PrivateUploadInput {
  buffer: Buffer;
  orderId: string;
  originalName?: string;
  contentType?: string;
  prefix?: string;
}

@Injectable()
export class PrivateStorageService {
  private s3Client?: S3Client;

  status() {
    const provider = this.provider();
    const r2Ready = isCloudflareR2Ready();

    return {
      provider,
      private: true,
      r2Ready,
      cloudReady: this.cloudReady(),
      signedUrlTtlSeconds: getStorageSignedUrlTtlSeconds(),
      cdnConfigured: Boolean(getStorageCdnBaseUrl()),
      localPath: this.localRoot(),
    };
  }

  async uploadPrivateObject(input: PrivateUploadInput) {
    const key = this.buildKey(input);

    if (this.useR2()) {
      const config = getCloudflareR2Config();
      await this.r2().send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.contentType ?? 'application/octet-stream',
          Metadata: {
            orderId: input.orderId,
            originalName: this.safeMetadataValue(input.originalName),
          },
        }),
      );

      return {
        provider: 'cloudflare-r2',
        storageKey: key,
        privateUrl: `r2://${config.bucket}/${key}`,
        cloudReady: true,
        size: input.buffer.length,
      };
    }

    const filePath = this.localPathForKey(key);
    const directory = dirname(filePath);

    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }

    await writeFile(filePath, input.buffer);

    return {
      provider: 'local-private',
      storageKey: key,
      privateUrl: `private://${key}`,
      cloudReady: false,
      size: input.buffer.length,
    };
  }

  async signedReadUrl(storageKey: string, ttlSeconds = getStorageSignedUrlTtlSeconds()) {
    const key = this.requireStorageKey(storageKey);

    if (this.useR2()) {
      const config = getCloudflareR2Config();
      const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      });

      return {
        provider: 'cloudflare-r2',
        url: await getSignedUrl(this.r2(), command, {
          expiresIn: ttlSeconds,
        }),
        expiresIn: ttlSeconds,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      };
    }

    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = this.signLocalUrl(key, expiresAt);

    return {
      provider: 'local-private',
      url: `/upload/private-file/${this.encodeStorageToken(key)}?expires=${expiresAt}&signature=${signature}`,
      expiresIn: ttlSeconds,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  openLocalStream(storageKey: string) {
    const filePath = this.localPathForKey(storageKey);

    if (!existsSync(filePath)) {
      return null;
    }

    return createReadStream(filePath);
  }

  verifyLocalSignedUrl(storageKey: string, expires: any, signature: any) {
    const key = this.requireStorageKey(storageKey);
    const expiresAt = Number(expires);
    const received = signature?.toString() ?? '';

    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return this.signLocalUrl(key, expiresAt) === received;
  }

  decodeStorageToken(value: any) {
    const token = value?.toString().trim();

    if (!token) {
      throw new BadRequestException('storage token invalido');
    }

    return Buffer.from(token, 'base64url').toString('utf8');
  }

  cloudReady() {
    return this.useR2() || this.provider() !== 'local-private';
  }

  private useR2() {
    const provider = this.provider();
    return (
      isCloudflareR2Ready() &&
      ['cloudflare-r2', 'r2', 'cloudflare'].includes(provider)
    );
  }

  private provider() {
    return getProofStorageProvider().toLowerCase();
  }

  private r2() {
    if (this.s3Client) {
      return this.s3Client;
    }

    const config = getCloudflareR2Config();

    if (
      !config.endpoint ||
      !config.accessKeyId ||
      !config.secretAccessKey ||
      !config.bucket
    ) {
      throw new BadRequestException('Cloudflare R2 nao configurado');
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    return this.s3Client;
  }

  private buildKey(input: PrivateUploadInput) {
    const orderId = this.safeSegment(input.orderId);
    const prefix = this.safeSegment(input.prefix ?? 'proofs');
    const extension = extname(input.originalName ?? '').toLowerCase();
    const safeExtension = /^[a-z0-9.]{1,12}$/.test(extension)
      ? extension
      : '';

    return `${prefix}/${orderId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${safeExtension}`;
  }

  private localRoot() {
    return getProofStorageDir() ?? join(process.cwd(), 'storage', 'private');
  }

  private localPathForKey(storageKey: string) {
    const key = this.requireStorageKey(storageKey);
    const root = normalize(this.localRoot());
    const filePath = normalize(join(root, key));
    const relativePath = relative(root, filePath);

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new BadRequestException('storageKey invalido');
    }

    return filePath;
  }

  private requireStorageKey(value: any) {
    const key = value?.toString().trim();

    if (
      !key ||
      key.includes('..') ||
      key.startsWith('/') ||
      key.startsWith('\\')
    ) {
      throw new BadRequestException('storageKey invalido');
    }

    return key.replace(/\\/g, '/');
  }

  private signLocalUrl(storageKey: string, expiresAt: number) {
    return createHmac('sha256', getJwtSecret())
      .update(`${storageKey}:${expiresAt}`)
      .digest('hex');
  }

  private encodeStorageToken(storageKey: string) {
    return Buffer.from(storageKey, 'utf8').toString('base64url');
  }

  private safeSegment(value: any) {
    const text = value?.toString().trim() || 'unknown';
    return text.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 96) || 'unknown';
  }

  private safeMetadataValue(value: any) {
    return value?.toString().replace(/[^\w .@-]/g, '').slice(0, 512) ?? '';
  }
}
