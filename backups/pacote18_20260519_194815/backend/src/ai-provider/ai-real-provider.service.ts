import { Injectable } from '@nestjs/common';

import { AiRealService } from '../ai-real/ai-real.service';

@Injectable()
export class AiRealProviderService {
  constructor(private readonly aiRealService: AiRealService) {}

  async classify(data: any) {
    return this.aiRealService.classify(data);
  }

  async price(data: any) {
    return this.aiRealService.smartPrice(data);
  }
}
