import { Module } from '@nestjs/common';
import { PrivateStorageModule } from '../private-storage/private-storage.module';
import { UploadController } from './upload.controller';

@Module({
  imports: [PrivateStorageModule],
  controllers: [UploadController],
})
export class UploadModule {}
