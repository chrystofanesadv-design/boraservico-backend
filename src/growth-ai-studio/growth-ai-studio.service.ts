import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GrowthAiStudioService {
  constructor(private readonly prisma: PrismaService) {}

  async status() {
    return {
      success: true,
      module: 'growth-ai-studio',
      capabilities: [
        'generate_script',
        'generate_caption',
        'generate_hashtags',
        'generate_image_prompt',
        'generate_video_prompt',
        'approval_queue',
        'download_bundle',
        'manual_publish_links',
        'auto_publish_ready',
      ],
      productionReady: false,
      note: 'Publicacao automatica depende das APIs oficiais TikTok, Meta e YouTube conectadas e aprovadas.',
      timestamp: new Date().toISOString(),
    };
  }

  async generateCampaign(body: any, actor?: any) {
    const city = this.required(body?.city, 'cidade obrigatoria');
    const profession = this.required(body?.profession, 'profissao obrigatoria');
    const problem = this.required(body?.problem, 'problema obrigatorio');
    const urgency = this.safeString(body?.urgency) ?? 'hoje';
    const state = this.safeString(body?.state);
    const country = this.safeString(body?.country) ?? 'BR';
    const language = this.safeString(body?.language) ?? 'pt_BR';
    const platform = this.safeString(body?.platform) ?? 'ALL';

    const generated = this.buildCreative({
      city,
      state,
      country,
      profession,
      problem,
      urgency,
      language,
      platform,
    });

    const campaign = await this.prisma.growthCampaign.create({
      data: {
        status: 'DRAFT',
        city,
        state,
        country,
        profession,
        problem,
        urgency,
        language,
        platform,
        title: generated.title,
        script: generated.script,
        caption: generated.caption,
        hashtags: generated.hashtags,
        imagePrompt: generated.imagePrompt,
        videoPrompt: generated.videoPrompt,
        createdById: this.safeString(actor?.userId ?? actor?.id),
        metadata: {
          manualPublish: true,
          automaticPublishReady: false,
          platforms: this.platforms(platform),
          moderation: {
            requiresHumanApproval: true,
            reason: 'Evita publicacao automatica sem revisao humana.',
          },
        },
      },
    });

    return {
      success: true,
      campaign,
      nextActions: [
        'Aprovar campanha',
        'Baixar roteiro/legenda/hashtags',
        'Gerar midia com provider externo',
        'Publicar manualmente ou conectar APIs oficiais',
      ],
    };
  }

  async listCampaigns(query: any = {}) {
    const status = this.safeString(query?.status);
    const take = Math.min(Math.max(Number(query?.take ?? 50), 1), 100);

    const campaigns = await this.prisma.growthCampaign.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
    });

    return {
      success: true,
      total: campaigns.length,
      items: campaigns,
    };
  }

  async approveCampaign(id: string) {
    const campaign = await this.prisma.growthCampaign.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });

    return {
      success: true,
      campaign,
      message: 'Campanha aprovada. Pronta para download/publicacao.',
    };
  }

  async markPublished(id: string, body: any = {}) {
    const platform = this.safeString(body?.platform);
    const campaign = await this.prisma.growthCampaign.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        metadata: {
          platform,
          manual: body?.manual !== false,
          externalPostUrl: this.safeString(body?.externalPostUrl),
        },
      },
    });

    return {
      success: true,
      campaign,
      message: 'Campanha marcada como publicada.',
    };
  }

  async downloadBundle(id: string) {
    const campaign = await this.prisma.growthCampaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      throw new BadRequestException('Campanha nao encontrada');
    }

    return {
      success: true,
      type: 'GROWTH_AI_DOWNLOAD_BUNDLE',
      filename: `boraservico-growth-${campaign.city}-${campaign.profession}-${campaign.id}.json`,
      bundle: {
        id: campaign.id,
        title: campaign.title,
        script: campaign.script,
        caption: campaign.caption,
        hashtags: campaign.hashtags,
        imagePrompt: campaign.imagePrompt,
        videoPrompt: campaign.videoPrompt,
        thumbnailUrl: campaign.thumbnailUrl,
        videoUrl: campaign.videoUrl,
        manualInstructions: [
          'Baixe o video/imagem quando o provider de midia estiver conectado.',
          'Copie legenda e hashtags.',
          'Abra TikTok, Instagram Reels ou YouTube Shorts.',
          'Publique manualmente ou conecte API oficial para auto-publicacao.',
        ],
      },
    };
  }

  async publishLinks(id: string) {
    const campaign = await this.prisma.growthCampaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      throw new BadRequestException('Campanha nao encontrada');
    }

    return {
      success: true,
      campaignId: campaign.id,
      manualPublish: {
        tiktok: 'https://www.tiktok.com/upload',
        instagram: 'https://www.instagram.com/',
        youtubeShorts: 'https://studio.youtube.com/',
      },
      automaticPublish: {
        ready: false,
        tiktok: 'aguardando API oficial e aprovacao',
        instagram: 'aguardando Meta Graph API',
        youtubeShorts: 'aguardando YouTube Data API',
      },
      caption: campaign.caption,
      hashtags: campaign.hashtags,
    };
  }

  private buildCreative(input: {
    city: string;
    state?: string;
    country: string;
    profession: string;
    problem: string;
    urgency: string;
    language: string;
    platform: string;
  }) {
    const cityTag = this.tag(input.city);
    const professionTag = this.tag(input.profession);
    const problemLine = input.problem.toLowerCase();

    return {
      title: `${input.profession} em ${input.city}: resolva ${problemLine}`,
      script:
        `Cena 1: mostre o problema "${input.problem}" em ${input.city}. ` +
        `Cena 2: mostre a urgencia: "${input.urgency}". ` +
        `Cena 3: explique que o BoraServico encontra ${input.profession} com proposta clara, chat seguro e acompanhamento. ` +
        'Cena 4: chamada final: abra o BoraServico e resolva pelo app.',
      caption:
        `Precisa de ${input.profession} em ${input.city}? No BoraServico voce descreve o problema, compara propostas e acompanha tudo pelo app.`,
      hashtags: [
        '#BoraServico',
        `#${cityTag}`,
        `#${professionTag}`,
        '#Servicos',
        '#Profissionais',
        '#Brasil',
      ],
      imagePrompt:
        `Imagem vertical premium para app de servicos: ${input.profession} solucionando "${input.problem}" em ${input.city}, visual moderno, confiavel, estilo startup brasileira.`,
      videoPrompt:
        `Video curto vertical 9:16 para TikTok/Reels/Shorts sobre ${input.profession} em ${input.city}. Mostrar problema, solucao pelo BoraServico, proposta segura, tracking e chamada para baixar o app.`,
    };
  }

  private platforms(platform: string) {
    if (platform.toUpperCase() === 'ALL') {
      return ['TikTok', 'Instagram Reels', 'YouTube Shorts'];
    }

    return [platform];
  }

  private tag(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '');
  }

  private required(value: any, message: string) {
    const text = this.safeString(value);
    if (!text) {
      throw new BadRequestException(message);
    }
    return text;
  }

  private safeString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}