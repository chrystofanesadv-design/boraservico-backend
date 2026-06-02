import { Module } from '@nestjs/common';
import { ProfessionalTeamsController } from './professional-teams.controller';
import { ProfessionalTeamsService } from './professional-teams.service';

@Module({
  controllers: [ProfessionalTeamsController],
  providers: [ProfessionalTeamsService],
  exports: [ProfessionalTeamsService],
})
export class ProfessionalTeamsModule {}