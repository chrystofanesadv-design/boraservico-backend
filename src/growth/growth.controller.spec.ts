import { Test, TestingModule } from '@nestjs/testing';
import { GrowthController } from './growth.controller';

describe('GrowthController', () => {
  let controller: GrowthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GrowthController],
    }).compile();

    controller = module.get<GrowthController>(GrowthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
