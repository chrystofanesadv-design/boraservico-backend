import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';

@Controller('private-storage')
export class PrivateStorageController {
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
}
