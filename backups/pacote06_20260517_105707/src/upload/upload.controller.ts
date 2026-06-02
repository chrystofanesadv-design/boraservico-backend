import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('upload')
export class UploadController {
  private proofs: any[] = [];

  @Get()
  status() {
    return {
      success: true,
      module: 'upload',
      message: 'Upload module online',
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
        destination: './uploads/proofs',
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

    const proof = {
      success: true,
      id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      orderId: orderId ?? 'sem-ordem',
      type: type ?? 'PROOF_PHOTO',
      note: note ?? '',
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/proofs/${file.filename}`,
      publicUrl: `/uploads/proofs/${file.filename}`,
      uploadedAt: new Date().toISOString(),
    };

    this.proofs.unshift(proof);

    return proof;
  }

  @Post('proof/mock')
  mockProof(@Body() body: any) {
    const proof = {
      success: true,
      id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      orderId: body.orderId ?? 'ordem-upload-demo',
      type: body.type ?? 'PROOF_PHOTO',
      note: body.note ?? 'Prova mock registrada via PowerShell',
      filename: body.filename ?? 'mock-proof.jpg',
      originalName: body.originalName ?? 'mock-proof.jpg',
      mimetype: body.mimetype ?? 'image/jpeg',
      size: body.size ?? 1024,
      url: body.url ?? '/uploads/proofs/mock-proof.jpg',
      publicUrl: body.publicUrl ?? '/uploads/proofs/mock-proof.jpg',
      uploadedAt: new Date().toISOString(),
    };

    this.proofs.unshift(proof);

    return proof;
  }
}
