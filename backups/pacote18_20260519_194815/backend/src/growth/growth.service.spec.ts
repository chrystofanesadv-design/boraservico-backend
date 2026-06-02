import { Test, TestingModule } from '@nestjs/testing';
import { GrowthService } from './growth.service';

describe('GrowthService', () => {
  let service: GrowthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GrowthService],
    }).compile();

    service = module.get<GrowthService>(GrowthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
