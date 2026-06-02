import { Body, Controller, Get, Post } from '@nestjs/common';
import { LatamCountryCode, LatamReadyEnterpriseService } from './latam-ready-enterprise.service';

@Controller('latam-ready-enterprise')
export class LatamReadyEnterpriseController {
  constructor(private readonly latamReadyEnterpriseService: LatamReadyEnterpriseService) {}

  @Get()
  health(): Record<string, unknown> {
    return this.latamReadyEnterpriseService.health();
  }

  @Get('countries')
  countries() {
    return this.latamReadyEnterpriseService.listCountries();
  }

  @Get('wallet-providers')
  walletProviders() {
    return this.latamReadyEnterpriseService.listWalletProviders();
  }

  @Get('referral-rewards')
  referralRewards() {
    return this.latamReadyEnterpriseService.listReferralRewards();
  }

  @Post('referral-reward')
  referralReward(@Body() payload: { countryCode?: LatamCountryCode }) {
    return this.latamReadyEnterpriseService.getReferralReward(payload.countryCode ?? 'BR');
  }

  @Post('country-profile')
  countryProfile(@Body() payload: { countryCode?: LatamCountryCode }) {
    return this.latamReadyEnterpriseService.getCountryProfile(payload.countryCode ?? 'BR');
  }

  @Post('simulate-local-payment')
  simulateLocalPayment(
    @Body()
    payload: {
      countryCode?: LatamCountryCode;
      amount?: number;
      currency?: string;
      provider?: string;
    },
  ) {
    return this.latamReadyEnterpriseService.simulateLocalPayment(payload);
  }

  @Post('expansion-score')
  expansionScore(
    @Body()
    payload: {
      countryCode?: LatamCountryCode;
      city?: string;
      activeClients?: number;
      activeProfessionals?: number;
      monthlyDemand?: number;
      estimatedCac?: number;
      estimatedLtv?: number;
    },
  ) {
    return this.latamReadyEnterpriseService.calculateExpansionScore(payload);
  }
}
