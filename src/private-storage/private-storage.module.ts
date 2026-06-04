import { Module } from '@nestjs/common';
import { PrivateStorageController } from './private-storage.controller';
import { PrivateStorageService } from './private-storage.service';

@Module({
  controllers: [PrivateStorageController],
  providers: [PrivateStorageService],
  exports: [PrivateStorageService],
})
export class PrivateStorageModule {}
