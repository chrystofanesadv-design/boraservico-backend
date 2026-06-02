import { Injectable, BadRequestException } from '@nestjs/common';

type ScopeItem = {
  id: string;
  title: string;
  description: string;
  isIncluded: boolean;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
};

@Injectable()
export class ScopeBudgetService {
  buildScope(body: any) {
    const description = this.readString(body?.description);
    const category = this.readString(body?.category) || 'serviço';

    if (description.length < 4) {
      throw new BadRequestException('Descreva melhor o serviço para gerar o escopo.');
    }

    const items = this.defaultScope(category, description);

    return {
      success: true,
      category,
      description,
      items,
      message:
        'Escopo organizado. O profissional pode orçar por partes para evitar confusão e facilitar acordo justo.',
    };
  }

  fairPrice(body: any) {
    const amount = Number(body?.amount ?? 0);
    const category = this.readString(body?.category) || 'serviço';
    const urgency = this.readString(body?.urgency).toLowerCase();
    const scopeSize = Number(body?.scopeSize ?? 1);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Informe um valor válido para análise de preço justo.');
    }

    const baseline = this.estimateBaseline(category, scopeSize);
    const ratio = amount / baseline;

    const band =
      ratio < 0.85
        ? 'BELOW_AVERAGE'
        : ratio <= 1.2
          ? 'FAIR'
          : 'ABOVE_AVERAGE';

    return {
      success: true,
      category,
      amount,
      baseline,
      band,
      label:
        band === 'BELOW_AVERAGE'
          ? 'Preço abaixo da média'
          : band === 'FAIR'
            ? 'Preço dentro da média'
            : 'Preço acima da média',
      color:
        band === 'BELOW_AVERAGE' ? 'green' : band === 'FAIR' ? 'yellow' : 'red',
      urgencyPolicy:
        urgency.includes('urgente') || urgency.includes('agora')
          ? 'Urgência não aumenta o preço. O sistema prioriza proximidade e disponibilidade.'
          : 'Análise baseada em escopo e histórico interno.',
      message:
        'Selo Preço Justo calculado sem revelar valores de outros profissionais.',
    };
  }

  compareProposals(body: any) {
    const proposals = Array.isArray(body?.proposals) ? body.proposals : [];

    const normalized = proposals.slice(0, 3).map((proposal: any, index: number) => {
      const amount = Number(proposal?.amount ?? 0);
      const deadline = this.readString(proposal?.deadline) || 'A combinar';
      const rating = Number(proposal?.rating ?? 4.7);
      const professionalName =
        this.readString(proposal?.professionalName) || `Profissional ${index + 1}`;

      return {
        id: this.readString(proposal?.id) || `proposal-${index + 1}`,
        professionalName,
        amount,
        deadline,
        rating,
        score: this.score(amount, deadline, rating),
        fairPrice: this.fairPrice({
          amount,
          category: body?.category,
          scopeSize: body?.scopeSize,
          urgency: body?.urgency,
        }),
      };
    });

    const ranked = normalized.sort((a, b) => b.score - a.score);

    return {
      success: true,
      maxVisible: 3,
      proposals: ranked,
      recommendation: ranked[0] ?? null,
      message:
        'Comparação criada. O cliente vê até 3 propostas de forma simples para decidir mais rápido.',
    };
  }

  private defaultScope(category: string, description: string): ScopeItem[] {
    const lower = `${category} ${description}`.toLowerCase();

    if (lower.includes('pint')) {
      return [
        this.item('Preparação do local', 'Proteção de móveis, piso e organização inicial.', true, 'LOW'),
        this.item('Correção de parede', 'Pequenos reparos antes da pintura, se necessário.', true, 'MEDIUM'),
        this.item('Pintura principal', 'Aplicação da pintura combinada no ambiente definido.', true, 'MEDIUM'),
        this.item('Material incluso?', 'Profissional deve informar se tinta/material estão inclusos.', false, 'LOW'),
      ];
    }

    if (lower.includes('eletr') || lower.includes('chuveiro') || lower.includes('tomada')) {
      return [
        this.item('Diagnóstico elétrico', 'Verificar ponto, fiação e segurança antes do serviço.', true, 'MEDIUM'),
        this.item('Execução do reparo', 'Troca, instalação ou correção do item solicitado.', true, 'MEDIUM'),
        this.item('Teste de funcionamento', 'Conferir funcionamento e segurança após concluir.', true, 'LOW'),
        this.item('Material incluso?', 'Informar se peça, fio, tomada ou chuveiro estão inclusos.', false, 'LOW'),
      ];
    }

    return [
      this.item('Diagnóstico inicial', 'Entender exatamente o que precisa ser feito.', true, 'LOW'),
      this.item('Execução principal', 'Realizar o serviço combinado com o cliente.', true, 'MEDIUM'),
      this.item('Teste e conferência', 'Validar resultado antes do check-out.', true, 'LOW'),
      this.item('Material incluso?', 'Informar se materiais estão inclusos no orçamento.', false, 'LOW'),
    ];
  }

  private item(
    title: string,
    description: string,
    isIncluded: boolean,
    complexity: 'LOW' | 'MEDIUM' | 'HIGH',
  ): ScopeItem {
    return {
      id: title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'),
      title,
      description,
      isIncluded,
      complexity,
    };
  }

  private estimateBaseline(category: string, scopeSize: number) {
    const lower = category.toLowerCase();
    const base = lower.includes('eletr')
      ? 160
      : lower.includes('pint')
        ? 280
        : lower.includes('diar')
          ? 180
          : lower.includes('pedr')
            ? 320
            : 220;

    return Math.max(80, Math.round(base * Math.max(1, scopeSize)));
  }

  private score(amount: number, deadline: string, rating: number) {
    const priceScore = amount > 0 ? Math.max(0, 100 - amount / 8) : 40;
    const deadlineScore = deadline.toLowerCase().includes('hoje') ? 18 : 10;
    const ratingScore = Math.min(20, rating * 4);

    return Math.round(priceScore + deadlineScore + ratingScore);
  }

  private readString(value: any) {
    return typeof value === 'string' ? value.trim() : '';
  }
}
