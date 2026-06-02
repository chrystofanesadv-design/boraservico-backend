Write-Host "========================================="
Write-Host "BORASERVICO - UPLOAD PROOF V2"
Write-Host "Upload + Timeline + Tracking"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Garantindo pasta..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\uploads\proofs" | Out-Null

Write-Host "[2] Atualizando upload.controller.ts..."
@'
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
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\upload\upload.controller.ts"

Write-Host "[3] Criando teste upload proof PowerShell..."
@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE UPLOAD PROOF V2"
Write-Host "========================================="

Write-Host "[1] Upload module"
Invoke-RestMethod "$API/upload"

Write-Host "[2] Criar proof mock"
Invoke-RestMethod -Method Post -Uri "$API/upload/proof/mock" -ContentType "application/json" -Body '{"orderId":"ordem-upload-demo","type":"CHECKOUT_PROOF","note":"Foto de conclusao do servico"}'

Write-Host "[3] Listar proofs"
Invoke-RestMethod "$API/upload/proofs"

Write-Host "========================================="
Write-Host "TESTE UPLOAD PROOF V2 FINALIZADO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-upload-proof-v2.ps1"

Write-Host "[4] Testando build backend..."
npm run build

Write-Host "========================================="
Write-Host "UPLOAD PROOF V2 INSTALADO"
Write-Host "========================================="