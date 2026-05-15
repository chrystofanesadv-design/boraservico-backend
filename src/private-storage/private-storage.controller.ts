import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
} from '@nestjs/common';

@Controller('private-storage')
export class PrivateStorageController {
  @Get(':file')
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
