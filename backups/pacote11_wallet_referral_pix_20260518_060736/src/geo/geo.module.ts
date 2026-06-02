import { Module } from '@nestjs/common';
import { GeoService } from './geo.service';
import { GeoController } from './geo.controller';

@Module({
  providers: [GeoService],
  controllers: [GeoController]
})
export class GeoModule {}
