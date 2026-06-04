import { Injectable, Logger } from '@nestjs/common';
import { CityGrowthSignalDto, GrowthCampaignRequestDto, ViralScoreRequestDto } from './growth-ai-enterprise.dto';

type GrowthRecommendation = {
  title: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: string;
};

type CampaignAsset = {
  platform: string;
  title: string;
  script: string;
  caption: string;
  hashtags: string[];
  callToAction: string;
  viralScore: number;
};

@Injectable()
export class GrowthAiEnterpriseService {
  private readonly logger = new Logger(GrowthAiEnterpriseService.name);
  private readonly campaignHistory: Array<Record<string, unknown>> = [];
  private readonly citySignals: Array<CityGrowthSignalDto & { score: number; createdAt: string }> = [];

  health(): Record<string, unknown> {
    return {
      status: 'ok',
      module: 'growth-ai-enterprise',
      productionReady: false,
      campaignHistory: this.campaignHistory.length,
      citySignals: this.citySignals.length,
      note: 'Motor pronto para conectar IA real, TikTok/Instagram/YouTube APIs, BI e atribuicao de campanhas.',
    };
  }

  createCampaign(dto: GrowthCampaignRequestDto): Record<string, unknown> {
    const city = this.clean(dto.city, 'sua cidade');
    const neighborhood = this.clean(dto.neighborhood, 'seu bairro');
    const profession = this.clean(dto.profession, 'profissional de confianÃ§a');
    const problem = this.clean(dto.problem, 'resolver um serviÃ§o com seguranÃ§a');
    const channel = dto.channel ?? 'organic';
    const urgency = dto.urgency ?? 'normal';
    const targetAudience = dto.targetAudience ?? 'both';

    const assets = this.buildAssets(city, neighborhood, profession, problem, channel, urgency);
    const estimated = this.estimateCampaign(dto, assets);

    const record = {
      id: `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      city,
      neighborhood,
      profession,
      problem,
      channel,
      urgency,
      targetAudience,
      assets,
      estimated,
      recommendations: this.recommendForCampaign(city, profession, urgency),
      metadata: dto.metadata ?? {},
      createdAt: new Date().toISOString(),
    };

    this.campaignHistory.unshift(record);
    this.logger.log(`Growth campaign generated: ${city}/${profession}/${channel}`);
    return record;
  }

  rankCities(signals: CityGrowthSignalDto[]): Record<string, unknown> {
    const ranked = (signals ?? []).map((signal) => {
      const activeClients = Number(signal.activeClients ?? 0);
      const activeProfessionals = Number(signal.activeProfessionals ?? 0);
      const openRequests = Number(signal.openRequests ?? 0);
      const completedOrders = Number(signal.completedOrders ?? 0);
      const referralInvites = Number(signal.referralInvites ?? 0);
      const referralConversions = Number(signal.referralConversions ?? 0);
      const spend = Number(signal.marketingSpendCents ?? 0);
      const revenue = Number(signal.grossRevenueCents ?? 0);
      const churnRisk = Math.max(0, Math.min(1, Number(signal.churnRisk ?? 0)));
      const supplyBalance = activeProfessionals > 0 ? Math.min(30, openRequests / Math.max(activeProfessionals, 1) * 8) : 0;
      const demandScore = Math.min(30, activeClients * 0.15 + openRequests * 1.4 + completedOrders * 0.8);
      const referralScore = Math.min(20, referralInvites * 0.3 + referralConversions * 2.5);
      const roiScore = spend > 0 ? Math.min(20, (revenue / spend) * 7) : Math.min(15, revenue / 10000);
      const retentionPenalty = churnRisk * 18;
      const score = Math.max(0, Math.min(100, Math.round(demandScore + supplyBalance + referralScore + roiScore - retentionPenalty)));
      return { ...signal, score, createdAt: new Date().toISOString() };
    }).sort((a, b) => b.score - a.score);

    this.citySignals.unshift(...ranked.slice(0, 50));

    return {
      generatedAt: new Date().toISOString(),
      topCities: ranked,
      recommendations: ranked.slice(0, 5).map((city, index) => ({
        rank: index + 1,
        city: city.city ?? 'Cidade sem nome',
        state: city.state,
        score: city.score,
        action: city.score >= 80 ? 'Priorizar campanha local e recrutamento de profissionais' : 'Validar demanda com campanhas de baixo custo',
      })),
    };
  }

  calculateViralScore(dto: ViralScoreRequestDto): Record<string, unknown> {
    const invites = Number(dto.referralInvites ?? 0);
    const conversions = Number(dto.referralConversions ?? 0);
    const orders = Number(dto.completedOrders ?? 0);
    const shares = Number(dto.sharedCampaigns ?? 0);
    const rewards = Number(dto.walletRewardsCents ?? 0) / 100;
    const conversionRate = invites > 0 ? conversions / invites : 0;
    const score = Math.max(0, Math.min(100, Math.round(invites * 1.5 + conversions * 12 + orders * 4 + shares * 3 + conversionRate * 30 + Math.min(15, rewards / 20))));

    return {
      userId: dto.userId ?? 'preview-user',
      city: dto.city,
      viralScore: score,
      tier: score >= 85 ? 'embaixador' : score >= 65 ? 'influenciador-local' : score >= 40 ? 'promotor' : 'iniciante',
      nextBestAction: score >= 85 ? 'Liberar campanha de embaixador local' : 'Enviar convite premium com recompensa progressiva',
      metadata: dto.metadata ?? {},
      calculatedAt: new Date().toISOString(),
    };
  }

  dashboard(): Record<string, unknown> {
    const campaigns = this.campaignHistory.slice(0, 20);
    const topCities = this.citySignals.slice(0, 20).sort((a, b) => b.score - a.score);
    return {
      status: 'ok',
      generatedAt: new Date().toISOString(),
      kpis: {
        campaignsGenerated: this.campaignHistory.length,
        citiesAnalyzed: this.citySignals.length,
        averageCityScore: topCities.length ? Math.round(topCities.reduce((sum, item) => sum + item.score, 0) / topCities.length) : 0,
        productionReady: false,
      },
      recentCampaigns: campaigns,
      topCities,
      recommendations: this.globalRecommendations(topCities),
    };
  }

  private buildAssets(city: string, neighborhood: string, profession: string, problem: string, channel: string, urgency: string): CampaignAsset[] {
    const urgencyLine = urgency === 'urgent' || urgency === 'high'
      ? 'Precisa resolver rÃ¡pido e com seguranÃ§a?'
      : 'Quer contratar com mais seguranÃ§a e praticidade?';

    const baseTitle = `${profession} em ${city}`;
    const baseScript = `${urgencyLine} No BoraServiÃ§o vocÃª descreve o problema, recebe propostas, acompanha a missÃ£o e paga com seguranÃ§a dentro do app.`;
    const caption = `${baseTitle}: encontre profissionais para ${problem} em ${neighborhood}.`;
    const hashtags = ['#BoraServico', `#${this.tag(city)}`, `#${this.tag(profession)}`, '#Servicos', '#Marketplace'];

    const platforms = channel === 'organic' ? ['tiktok', 'instagram', 'youtube_shorts', 'push'] : [channel];
    return platforms.map((platform) => ({
      platform,
      title: platform === 'push' ? `Encontre ${profession} perto de vocÃª` : baseTitle,
      script: platform === 'push' ? `Novo no BoraServiÃ§o: profissionais para ${problem} em ${city}.` : baseScript,
      caption,
      hashtags,
      callToAction: platform === 'push' ? 'Abrir BoraServiÃ§o' : 'Baixe o BoraServiÃ§o e peÃ§a um orÃ§amento agora',
      viralScore: this.assetScore(platform, urgency),
    }));
  }

  private estimateCampaign(dto: GrowthCampaignRequestDto, assets: CampaignAsset[]): Record<string, unknown> {
    const budget = Number(dto.budgetCents ?? 0);
    const expectedJobs = Number(dto.expectedJobs ?? 0);
    const bestAssetScore = assets.reduce((max, asset) => Math.max(max, asset.viralScore), 0);
    const expectedReach = Math.max(250, Math.round((budget / 100) * 18 + bestAssetScore * 35 + expectedJobs * 22));
    const expectedLeads = Math.max(5, Math.round(expectedReach * 0.045));
    const expectedConversions = Math.max(1, Math.round(expectedLeads * 0.22));
    const cacCents = expectedConversions > 0 ? Math.round(budget / expectedConversions) : budget;
    const roiScore = Math.min(100, Math.round(bestAssetScore * 0.45 + expectedConversions * 4));
    return { expectedReach, expectedLeads, expectedConversions, cacCents, roiScore };
  }

  private recommendForCampaign(city: string, profession: string, urgency: string): GrowthRecommendation[] {
    return [
      {
        title: 'Campanha hiperlocal',
        reason: `A combinacao ${profession} + ${city} aumenta relevancia e conversao.`,
        priority: urgency === 'urgent' ? 'critical' : 'high',
        action: 'Gerar criativo curto por bairro e profissao.',
      },
      {
        title: 'Referral junto da campanha',
        reason: 'IndicaÃ§Ã£o reduz CAC e aumenta confianca local.',
        priority: 'high',
        action: 'Enviar push de convite para usuarios com maior viral score.',
      },
    ];
  }

  private globalRecommendations(topCities: Array<CityGrowthSignalDto & { score: number }>): GrowthRecommendation[] {
    const best = topCities[0];
    if (!best) {
      return [{ title: 'Coletar sinais', reason: 'Ainda faltam dados por cidade.', priority: 'medium', action: 'Registrar demanda, profissionais e conversoes por cidade.' }];
    }
    return [{ title: 'Priorizar cidade lider', reason: `${best.city ?? 'Cidade principal'} tem maior score atual.`, priority: best.score >= 80 ? 'critical' : 'high', action: 'Ativar campanha local + recrutamento de profissionais.' }];
  }

  private assetScore(platform: string, urgency: string): number {
    const platformBoost = platform === 'tiktok' ? 18 : platform === 'instagram' ? 14 : platform === 'youtube_shorts' ? 12 : 8;
    const urgencyBoost = urgency === 'urgent' ? 16 : urgency === 'high' ? 12 : urgency === 'normal' ? 7 : 4;
    return Math.min(100, 58 + platformBoost + urgencyBoost);
  }

  private clean(value: string | undefined, fallback: string): string {
    const text = (value ?? '').trim();
    return text.length > 0 ? text : fallback;
  }

  private tag(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '').slice(0, 28) || 'BoraServico';
  }
}
