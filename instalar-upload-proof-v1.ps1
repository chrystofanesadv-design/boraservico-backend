Write-Host "========================================="
Write-Host "BORASERVICO - UPLOAD PROOF V1"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Instalando dependencias..."
npm install multer
npm install -D @types/multer

Write-Host "[2] Criando pasta de uploads..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\uploads\proofs" | Out-Null

Write-Host "[3] Criando upload.module.ts..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\upload" | Out-Null

@'
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';

@Module({
  controllers: [UploadController],
})
export class UploadModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\upload\upload.module.ts"

Write-Host "[4] Criando upload.controller.ts..."
@'
import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('upload')
export class UploadController {
  @Get()
  status() {
    return {
      success: true,
      module: 'upload',
      message: 'Upload module online',
    };
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
  uploadProof(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return {
      success: true,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/proofs/${file.filename}`,
      uploadedAt: new Date().toISOString(),
    };
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\upload\upload.controller.ts"

Write-Host "[5] Atualizando app.module.ts..."
$appModule = "C:\Users\chrys\boraservico-backend\src\app.module.ts"
$content = Get-Content $appModule -Raw

if ($content -notmatch "UploadModule") {
  $content = $content -replace "import \{ Module \} from '@nestjs/common';", "import { Module } from '@nestjs/common';`nimport { UploadModule } from './upload/upload.module';"

  $content = $content -replace "imports: \[", "imports: [`n    UploadModule,"
}

Set-Content -Encoding UTF8 $appModule $content

Write-Host "[6] Testando build..."
npm run build

Write-Host "========================================="
Write-Host "UPLOAD PROOF V1 INSTALADO COM SUCESSO"
Write-Host "========================================="