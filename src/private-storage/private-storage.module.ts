import { Module } from '@nestjs/common';
import { PrivateStorageController } from './private-storage.controller';

@Module({
  controllers: [PrivateStorageController],
})
export class PrivateStorageModule {}
