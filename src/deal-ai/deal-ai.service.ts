import { Injectable, BadRequestException } from '@nestjs/common';

type DealProposal = {
  id: string;
  professionalName: string;
  amount: number;
  deadline: string;
  rating: number;
};

@Injectable()
export class DealAiService {
  bestAgreement(body: any) {
    const maxBudget = Number(body?.maxBudget ?? 0);
    const maxDeadline = this.readString(body?.maxDeadline) || 'a combinar';
    const priority = this.readString(body?.priority) || 'melhor acordo';
    const proposals = this.normalizeProposals(body?.proposals);

    if (!Number.isFinite(maxBudget) || maxBudget <= 0) {
      throw new BadRequestException('Informe o orçamento máximo para a IA negociar.');
    }

    const viable = proposals
      .filter((proposal) => proposal.amount > 0 && proposal.amount <= maxBudget)
      .sort((a, b) => this.score(b, maxBudget) - this.score(a, maxBudget));

    const best = viable[0] ?? null;

    return {
      success: true,
      mode: 'DELEGATE_TO_AI',
      maxBudget,
      maxDeadline,
      priority,
      bestAgreement: best
        ? {
            professionalId: best.id,
            professionalName: best.professionalName,
            acceptedAmount: best.amount,
            deadline: best.deadline,
            message: `${best.professionalName} é a melhor opção dentro do seu limite.`,
          }
        : null,
      aiInstruction:
        'A IA deve negociar com até 3 profissionais respeitando orçamento, prazo e prioridade definidos pelo cliente.',
      clientConfirmationRequired: true,
      message: best
        ? 'A IA encontrou uma opção dentro das suas regras. Confirme antes de fechar.'
        : 'Nenhuma proposta ficou dentro das regras. A IA pode tentar uma contraproposta segura.',
    };
  }

  urgencyStrategy(body: any) {
    const location = this.readString(body?.location) || 'região do cliente';
    const category = this.readString(body?.category) || 'serviço';

    return {
      success: true,
      mode: 'URGENCY_WITHOUT_PRICE_INCREASE',
      category,
      location,
      pricingPolicy:
        'Não aumentar preço por urgência. Priorizar profissionais próximos, online e disponíveis.',
      rankingRules: [
        'Profissionais disponíveis agora',
        'Menor distância estimada',
        'Melhor taxa de conclusão',
        'Menor tempo médio de resposta',
        'Avaliação consistente',
      ],
      message:
        'Modo urgência ativado sem sobretaxa. O sistema busca quem pode atender mais rápido.',
    };
  }

  timeAuction(body: any) {
    const fixedBudget = Number(body?.fixedBudget ?? 0);
    const rejectedCount = Number(body?.rejectedCount ?? 0);
    const proposals = this.normalizeProposals(body?.proposals);

    if (!Number.isFinite(fixedBudget) || fixedBudget <= 0) {
      throw new BadRequestException('Informe o orçamento fixo para o leilão de tempo.');
    }

    const shouldOffer = rejectedCount >= 1 || body?.negotiationStalled === true;

    const ranked = proposals
      .map((proposal) => ({
        ...proposal,
        timeScore: this.timeScore(proposal.deadline),
      }))
      .sort((a, b) => b.timeScore - a.timeScore)
      .slice(0, 3);

    return {
      success: true,
      mode: 'TIME_AUCTION',
      shouldOffer,
      fixedBudget,
      rules:
        'Usar apenas quando a negociação travar ou quando o cliente rejeitar propostas. Não virar leilão de preço.',
      proposals: ranked,
      message: shouldOffer
        ? 'Leilão de tempo disponível: profissionais competem por prazo, não por preço.'
        : 'Ainda não recomendamos leilão de tempo. Primeiro tente comparar propostas e negociar normalmente.',
    };
  }

  private normalizeProposals(value: any): DealProposal[] {
    const proposals = Array.isArray(value) ? value : [];

    return proposals.slice(0, 3).map((proposal: any, index: number) => ({
      id: this.readString(proposal?.id) || `professional-${index + 1}`,
      professionalName:
        this.readString(proposal?.professionalName) || `Profissional ${index + 1}`,
      amount: Number(proposal?.amount ?? 0),
      deadline: this.readString(proposal?.deadline) || 'a combinar',
      rating: Number(proposal?.rating ?? 4.7),
    }));
  }

  private score(proposal: DealProposal, maxBudget: number) {
    const priceFit = Math.max(0, 100 - Math.abs(maxBudget - proposal.amount) / 4);
    const deadline = this.timeScore(proposal.deadline);
    const reputation = Math.min(20, proposal.rating * 4);

    return priceFit + deadline + reputation;
  }

  private timeScore(deadline: string) {
    const text = deadline.toLowerCase();

    if (text.includes('agora')) return 40;
    if (text.includes('hoje')) return 34;
    if (text.includes('amanhã') || text.includes('amanha')) return 24;
    if (text.includes('semana')) return 12;

    return 18;
  }

  private readString(value: any) {
    return typeof value === 'string' ? value.trim() : '';
  }
}
