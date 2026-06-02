import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateStorageService } from './private-storage.service';

@Controller('private-storage')
export class PrivateStorageController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateStorageService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  status() {
    return {
      success: true,
      module: 'private-storage',
      storage: this.storage.status(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('proofs/:proofId/signed-url')
  @UseGuards(JwtAuthGuard)
  async signedProofUrl(@Param('proofId') proofId: string, @Req() req: any) {
    const proof = await this.prisma.proofUpload.findUnique({
      where: { id: proofId },
      include: { order: true },
    });

    if (!proof) {
      throw new NotFoundException('Prova nao encontrada');
    }

    this.assertCanViewProof(req, proof);

    const signed = await this.storage.signedReadUrl(proof.storageKey);

    return {
      success: true,
      proofId: proof.id,
      ...signed,
    };
  }

  @Get(':file')
  @UseGuards(JwtAuthGuard)
  getPrivateFile(@Param('file') file: string) {
    if (!file) {
      throw new UnauthorizedException();
    }

    return {
      success: true,
      private: true,
      file,
      authorized: true,
    };
  }

  private assertCanViewProof(req: any, proof: any) {
    const role = this.readString(req.user?.role)?.toUpperCase();
    const userId = this.readString(req.user?.userId);

    if (role === 'ADMIN') {
      return;
    }

    if (!userId) {
      throw new UnauthorizedException();
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

    throw new UnauthorizedException();
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
