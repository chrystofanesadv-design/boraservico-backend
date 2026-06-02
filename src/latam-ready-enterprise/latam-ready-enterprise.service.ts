import { Injectable } from '@nestjs/common';

export type LatamCountryCode = 'BR' | 'MX' | 'CO' | 'PE' | 'CL' | 'AR';

export interface LatamWalletProvider {
  countryCode: LatamCountryCode;
  name: string;
  methodType: 'instant_transfer' | 'wallet' | 'card' | 'bank_transfer' | 'gateway';
  currency: string;
  productionReady: boolean;
  note: string;
}

export interface LatamCountryProfile {
  countryCode: LatamCountryCode;
  countryName: string;
  defaultLanguage: 'pt-BR' | 'es' | 'en';
  currency: string;
  currencySymbol: string;
  localMethods: string[];
  suggestedLaunchCities: string[];
  taxAndComplianceNote: string;
  walletStrategy: string;
}

export interface LatamReferralReward {
  countryCode: LatamCountryCode;
  countryName: string;
  currency: string;
  currencySymbol: string;
  referenceBrlLimit: number;
  fxRateFromBrl: number;
  totalLocalLimit: number;
  phase1LocalLimit: number;
  phase2LocalLimit: number;
  phase1Percent: number;
  phase2Percent: number;
  rule: string;
  note: string;
}

@Injectable()
export class LatamReadyEnterpriseService {
  private readonly countries: Record<LatamCountryCode, LatamCountryProfile> = {
    BR: {
      countryCode: 'BR',
      countryName: 'Brasil',
      defaultLanguage: 'pt-BR',
      currency: 'BRL',
      currencySymbol: 'R$',
      localMethods: ['PIX', 'cartao', 'boleto', 'wallet'],
      suggestedLaunchCities: ['Joao Pessoa', 'Recife', 'Fortaleza', 'Campina Grande', 'Sao Paulo'],
      taxAndComplianceNote: 'Preparar operacao com PIX, KYC/KYB, LGPD, antifraude e conciliacao financeira local.',
      walletStrategy: 'Wallet BRL com PIX como metodo principal de saque e pagamento local.',
    },
    MX: {
      countryCode: 'MX',
      countryName: 'Mexico',
      defaultLanguage: 'es',
      currency: 'MXN',
      currencySymbol: '$',
      localMethods: ['SPEI', 'cartao', 'wallet'],
      suggestedLaunchCities: ['Ciudad de Mexico', 'Guadalajara', 'Monterrey', 'Puebla'],
      taxAndComplianceNote: 'Preparar SPEI, KYC, antifraude local, suporte espanhol e termos por pais.',
      walletStrategy: 'Wallet MXN com adaptador SPEI para transferencias locais.',
    },
    CO: {
      countryCode: 'CO',
      countryName: 'Colombia',
      defaultLanguage: 'es',
      currency: 'COP',
      currencySymbol: '$',
      localMethods: ['Nequi', 'Daviplata', 'PSE', 'wallet'],
      suggestedLaunchCities: ['Bogota', 'Medellin', 'Cali', 'Barranquilla'],
      taxAndComplianceNote: 'Preparar integracao com carteiras locais, PSE, KYC e suporte espanhol.',
      walletStrategy: 'Wallet COP com adaptadores Nequi/Daviplata/PSE.',
    },
    PE: {
      countryCode: 'PE',
      countryName: 'Peru',
      defaultLanguage: 'es',
      currency: 'PEN',
      currencySymbol: 'S/',
      localMethods: ['Yape', 'PLIN', 'cartao', 'wallet'],
      suggestedLaunchCities: ['Lima', 'Arequipa', 'Trujillo', 'Cusco'],
      taxAndComplianceNote: 'Preparar Yape/PLIN, KYC local e experiencia em espanhol.',
      walletStrategy: 'Wallet PEN com adaptadores Yape e PLIN.',
    },
    CL: {
      countryCode: 'CL',
      countryName: 'Chile',
      defaultLanguage: 'es',
      currency: 'CLP',
      currencySymbol: '$',
      localMethods: ['transferencia bancaria', 'cartao', 'wallet'],
      suggestedLaunchCities: ['Santiago', 'Valparaiso', 'Concepcion'],
      taxAndComplianceNote: 'Preparar transferencias locais, cartoes, KYC e antifraude por pais.',
      walletStrategy: 'Wallet CLP com transferencia bancaria local e gateway de cartoes.',
    },
    AR: {
      countryCode: 'AR',
      countryName: 'Argentina',
      defaultLanguage: 'es',
      currency: 'ARS',
      currencySymbol: '$',
      localMethods: ['MODO', 'Mercado Pago', 'transferencia', 'wallet'],
      suggestedLaunchCities: ['Buenos Aires', 'Cordoba', 'Rosario', 'Mendoza'],
      taxAndComplianceNote: 'Preparar MODO/Mercado Pago, conciliacao local, KYC e regras fiscais por pais.',
      walletStrategy: 'Wallet ARS com adaptadores MODO e Mercado Pago.',
    },
  };

  private readonly walletProviders: LatamWalletProvider[] = [
    { countryCode: 'BR', name: 'PIX', methodType: 'instant_transfer', currency: 'BRL', productionReady: false, note: 'Metodo principal para Brasil.' },
    { countryCode: 'MX', name: 'SPEI', methodType: 'bank_transfer', currency: 'MXN', productionReady: false, note: 'Metodo principal para Mexico.' },
    { countryCode: 'CO', name: 'Nequi', methodType: 'wallet', currency: 'COP', productionReady: false, note: 'Carteira popular na Colombia.' },
    { countryCode: 'CO', name: 'Daviplata', methodType: 'wallet', currency: 'COP', productionReady: false, note: 'Carteira popular na Colombia.' },
    { countryCode: 'PE', name: 'Yape', methodType: 'wallet', currency: 'PEN', productionReady: false, note: 'Carteira popular no Peru.' },
    { countryCode: 'PE', name: 'PLIN', methodType: 'wallet', currency: 'PEN', productionReady: false, note: 'Carteira popular no Peru.' },
    { countryCode: 'AR', name: 'MODO', methodType: 'wallet', currency: 'ARS', productionReady: false, note: 'Metodo local Argentina.' },
    { countryCode: 'AR', name: 'Mercado Pago', methodType: 'gateway', currency: 'ARS', productionReady: false, note: 'Gateway/carteira regional.' },
    { countryCode: 'CL', name: 'Transferencia local', methodType: 'bank_transfer', currency: 'CLP', productionReady: false, note: 'Base inicial Chile.' },
  ];

  /**
   * Taxas operacionais aproximadas para simulação de produto.
   * Em produção, trocar por API de câmbio/treasury oficial e salvar snapshot por data.
   */
  private readonly brlToLocalRate: Record<LatamCountryCode, number> = {
    BR: 1,
    MX: 3.4,
    CO: 770,
    PE: 0.72,
    CL: 180,
    AR: 210,
  };

  health(): Record<string, unknown> {
    return {
      status: 'ok',
      module: 'latam-ready-enterprise',
      countries: Object.keys(this.countries),
      providers: this.walletProviders.map((provider) => provider.name),
      referralRewardReady: true,
      productionReady: false,
      note: 'Base LATAM pronta para provedores reais, KYC, compliance, cambio, impostos, termos por pais e reward local por moeda.',
    };
  }

  listCountries(): LatamCountryProfile[] {
    return Object.values(this.countries);
  }

  listWalletProviders(): LatamWalletProvider[] {
    return this.walletProviders;
  }

  getCountryProfile(countryCode: LatamCountryCode): LatamCountryProfile {
    return this.countries[countryCode] ?? this.countries.BR;
  }

  listReferralRewards(): LatamReferralReward[] {
    return (Object.keys(this.countries) as LatamCountryCode[]).map((countryCode) =>
      this.getReferralReward(countryCode),
    );
  }

  getReferralReward(countryCode: LatamCountryCode): LatamReferralReward {
    const profile = this.getCountryProfile(countryCode);
    const rate = this.brlToLocalRate[profile.countryCode] ?? 1;

    const totalLocalLimit = this.money(500 * rate);
    const phase1LocalLimit = this.money(300 * rate);
    const phase2LocalLimit = this.money(200 * rate);

    return {
      countryCode: profile.countryCode,
      countryName: profile.countryName,
      currency: profile.currency,
      currencySymbol: profile.currencySymbol,
      referenceBrlLimit: 500,
      fxRateFromBrl: rate,
      totalLocalLimit,
      phase1LocalLimit,
      phase2LocalLimit,
      phase1Percent: 0.05,
      phase2Percent: 0.025,
      rule:
        `Indique e ganhe ate ${profile.currencySymbol}${totalLocalLimit} em recompensas, ` +
        `equivalente operacional a R$500 convertido para ${profile.currency}.`,
      note:
        'Valores simulados para produto. Em producao, congelar cambio no momento do evento financeiro e registrar auditoria.',
    };
  }

  simulateLocalPayment(payload: {
    countryCode?: LatamCountryCode;
    amount?: number;
    currency?: string;
    provider?: string;
  }): Record<string, unknown> {
    const profile = this.getCountryProfile(payload.countryCode ?? 'BR');
    const provider =
      payload.provider ??
      this.walletProviders.find((item) => item.countryCode === profile.countryCode)?.name ??
      profile.localMethods[0];

    const amount = Number(payload.amount ?? 100);
    const platformFee = this.money(amount * 0.1);
    const professionalAmount = this.money(amount * 0.9);

    return {
      status: 'simulated',
      countryCode: profile.countryCode,
      countryName: profile.countryName,
      provider,
      currency: payload.currency ?? profile.currency,
      amount,
      split: {
        boraServico: platformFee,
        professional: professionalAmount,
        rule: '10% BoraServico / 90% profissional',
      },
      escrow: {
        status: 'HELD_UNTIL_CLIENT_CONFIRMATION',
        releaseRule: 'Liberar somente apos confirmacao do cliente ou decisao de disputa.',
      },
      refundRule: {
        clientWinsDispute: '100% cliente / 0% BoraServico / 0% profissional',
      },
      referralReward: this.getReferralReward(profile.countryCode),
    };
  }

  calculateExpansionScore(payload: {
    countryCode?: LatamCountryCode;
    city?: string;
    activeClients?: number;
    activeProfessionals?: number;
    monthlyDemand?: number;
    estimatedCac?: number;
    estimatedLtv?: number;
  }): Record<string, unknown> {
    const profile = this.getCountryProfile(payload.countryCode ?? 'BR');
    const clients = Number(payload.activeClients ?? 100);
    const professionals = Number(payload.activeProfessionals ?? 40);
    const demand = Number(payload.monthlyDemand ?? 300);
    const cac = Math.max(1, Number(payload.estimatedCac ?? 12));
    const ltv = Math.max(1, Number(payload.estimatedLtv ?? 90));

    const supplyBalance = Math.min(100, Math.round((professionals / Math.max(1, clients)) * 180));
    const demandScore = Math.min(100, Math.round(demand / 5));
    const unitEconomicsScore = Math.min(100, Math.round((ltv / cac) * 15));
    const finalScore = Math.round((supplyBalance * 0.3) + (demandScore * 0.35) + (unitEconomicsScore * 0.35));

    return {
      countryCode: profile.countryCode,
      countryName: profile.countryName,
      city: payload.city ?? profile.suggestedLaunchCities[0],
      score: finalScore,
      recommendation:
        finalScore >= 80
          ? 'Prioridade alta para expansao.'
          : finalScore >= 60
            ? 'Prioridade media, validar oferta e CAC antes de escalar.'
            : 'Aguardar melhor equilibrio entre demanda, profissionais e CAC.',
      inputs: { clients, professionals, demand, cac, ltv },
      referralReward: this.getReferralReward(profile.countryCode),
    };
  }

  private money(value: number): number {
    return Number(value.toFixed(2));
  }
}
