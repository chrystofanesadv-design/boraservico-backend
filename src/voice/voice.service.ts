import { Injectable } from '@nestjs/common';

import { AiService } from '../ai/ai.service';
import { AuditService } from '../security/audit.service';
import {
  filterDirectContact,
  repairLegacyEncoding,
} from '../security/contact-filter';

type VoiceRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface VoiceCategory {
  id: string;
  label: string;
  keywords: string[];
  title: string;
  summary: string;
}

@Injectable()
export class VoiceService {
  private readonly categories: VoiceCategory[] = [
    {
      id: 'hidraulica',
      label: 'Hidraulica',
      keywords: [
        'pia',
        'vazando',
        'vazamento',
        'cano',
        'encanador',
        'chuveiro',
        'sifao',
        'torneira',
        'descarga',
      ],
      title: 'Servico hidraulico residencial',
      summary:
        'Possivel problema em conexoes, tubulacao, sifao, torneira ou ponto de agua.',
    },
    {
      id: 'eletrica',
      label: 'Eletrica',
      keywords: [
        'eletricista',
        'tomada',
        'disjuntor',
        'energia',
        'chuveiro queimou',
        'curto',
        'lampada',
        'fiacao',
      ],
      title: 'Servico eletrico residencial',
      summary:
        'Possivel falha eletrica em tomada, disjuntor, chuveiro, iluminacao ou fiacao.',
    },
    {
      id: 'ar-condicionado',
      label: 'Ar-condicionado',
      keywords: [
        'ar condicionado',
        'ar-condicionado',
        'split',
        'climatizador',
        'gas do ar',
        'limpeza do ar',
      ],
      title: 'Atendimento em ar-condicionado',
      summary:
        'Solicitacao para manutencao, limpeza, instalacao ou diagnostico de climatizacao.',
    },
    {
      id: 'construcao',
      label: 'Construcao',
      keywords: [
        'pedreiro',
        'obra',
        'parede',
        'reboco',
        'piso',
        'azulejo',
        'alvenaria',
        'cimento',
      ],
      title: 'Servico de construcao e reparo',
      summary:
        'Demanda de obra, reparo, acabamento, parede, piso ou alvenaria.',
    },
    {
      id: 'limpeza',
      label: 'Limpeza',
      keywords: [
        'limpeza',
        'faxina',
        'diarista',
        'higienizacao',
        'pos obra',
        'lavagem',
      ],
      title: 'Servico de limpeza',
      summary:
        'Atendimento de limpeza residencial, comercial, higienizacao ou pos-obra.',
    },
    {
      id: 'pintura',
      label: 'Pintura',
      keywords: [
        'pintor',
        'pintura',
        'pintar',
        'tinta',
        'parede manchada',
        'textura',
      ],
      title: 'Servico de pintura',
      summary:
        'Solicitacao para pintura, retoque, textura ou preparacao de parede.',
    },
    {
      id: 'tecnologia',
      label: 'Tecnologia',
      keywords: [
        'internet',
        'computador',
        'notebook',
        'wifi',
        'roteador',
        'camera',
        'smart home',
        'casa inteligente',
      ],
      title: 'Suporte tecnico e tecnologia',
      summary:
        'Atendimento tecnico para conectividade, computador, cameras, roteadores ou automacao.',
    },
  ];

  constructor(
    private readonly aiService: AiService,
    private readonly auditService: AuditService,
  ) {}

  status() {
    return {
      success: true,
      module: 'voice',
      speechToTextReady: true,
      aiStructuringReady: true,
      quoteVoiceReady: true,
      commandParserReady: true,
      audioAuditReady: true,
      translationReady: {
        base: true,
        locales: ['pt_BR', 'es_ES', 'en_US'],
        speechPipeline: [
          'speech-to-text',
          'intent-parser',
          'translation-ready',
          'text-to-speech-ready',
        ],
        providerEnabled: false,
      },
      premiumVoiceUi: this.premiumVoiceUi(),
      noPricePolicy: true,
    };
  }

  async parseService(body: any, ipAddress?: string) {
    const rawTranscript = this.cleanText(
      body?.transcript ?? body?.text ?? body?.description,
    );
    const contactFilter = filterDirectContact(rawTranscript);
    const transcript = contactFilter.blocked
      ? contactFilter.cleanMessage
      : rawTranscript;
    const source = this.cleanText(body?.source) || 'voice';
    const locale = this.normalizeLocale(body?.locale ?? body?.spokenLocale);
    const photosCount = this.toInt(body?.photosCount ?? body?.photoCount);
    const context =
      body?.context && typeof body.context === 'object' ? body.context : {};
    const category = this.detectCategory(transcript);
    const urgency = this.detectUrgency(transcript);
    const schedule = this.detectSchedule(transcript);
    const address = this.detectAddress(transcript);
    const ai = this.aiService.classify({
      title: category.title,
      description: transcript,
    });

    const technicalSummary = this.buildTechnicalSummary(
      transcript,
      category,
      photosCount,
    );
    const description = this.buildStructuredDescription(
      transcript,
      category,
      photosCount,
    );

    const result = {
      success: true,
      transcript,
      source,
      locale,
      title: category.title,
      category: category.label,
      categoryId: category.id,
      urgency,
      urgent: urgency !== 'Normal',
      preferredDate: schedule.preferredDate,
      preferredTime: schedule.preferredTime,
      address,
      description,
      aiBriefing: technicalSummary,
      aiQuestions: this.suggestQuestions(category.id, transcript, photosCount),
      aiWarnings: [
        ...(contactFilter.blocked ? [contactFilter.message] : []),
        'A IA organiza o pedido, mas nao define preco.',
        'O valor deve ser enviado e confirmado pelo profissional.',
      ],
      contactSafety: {
        blocked: contactFilter.blocked,
        reasons: contactFilter.reasons,
        alert: contactFilter.blocked ? contactFilter.message : null,
        cleanTranscript: contactFilter.cleanMessage,
      },
      confidence: ai?.confidence ?? 0.88,
      photosCount,
      photoVoiceMerged: photosCount > 0,
      noPricePolicy: true,
      context,
      translationReady: this.translationSnapshot(locale),
      premiumVoiceUi: this.premiumVoiceUi(),
      createdAt: new Date().toISOString(),
    };

    await this.audit('VOICE_SERVICE_PARSED', {
      ipAddress,
      status: 'STRUCTURED',
      metadata: {
        transcript,
        rawTranscriptBlocked: contactFilter.blocked,
        source,
        locale,
        category: result.category,
        urgency,
        photosCount,
        noPricePolicy: true,
      },
    });

    return result;
  }

  async parseQuote(body: any, ipAddress?: string) {
    const rawTranscript = this.cleanText(body?.transcript ?? body?.text);
    const contactFilter = filterDirectContact(rawTranscript);
    const transcript = contactFilter.blocked
      ? contactFilter.cleanMessage
      : rawTranscript;
    const amount = this.detectAmount(transcript);
    const deadline = this.detectDeadline(transcript);
    const guarantee = this.detectGuarantee(transcript);
    const materialIncluded = this.detectMaterialIncluded(transcript);
    const risk = this.audioRisk(transcript, amount, guarantee, deadline);
    const notes = this.quoteNotes(
      transcript,
      amount,
      deadline,
      guarantee,
      materialIncluded,
    );

    const result = {
      success: true,
      transcript,
      amount,
      amountText: amount == null ? null : amount.toFixed(2),
      deadline,
      guarantee,
      materialIncluded,
      includes: materialIncluded
        ? 'Mao de obra e material informado por voz'
        : 'Mao de obra',
      excludes: materialIncluded
        ? 'Itens nao citados no audio'
        : 'Materiais nao inclusos, salvo confirmacao manual',
      notes,
      requiresProfessionalConfirmation: true,
      noAutoSend: true,
      fraudAudit: {
        level: contactFilter.blocked ? 'HIGH' : risk.level,
        flags: [
          ...risk.flags,
          ...(contactFilter.blocked
            ? ['Tentativa de contato direto removida da proposta por voz']
            : []),
        ],
        use: 'historico, auditoria e disputa',
      },
      contactSafety: {
        blocked: contactFilter.blocked,
        reasons: contactFilter.reasons,
        alert: contactFilter.blocked ? contactFilter.message : null,
        cleanTranscript: contactFilter.cleanMessage,
      },
      translationReady: this.translationSnapshot(
        this.normalizeLocale(body?.locale),
      ),
      premiumVoiceUi: this.premiumVoiceUi(),
      createdAt: new Date().toISOString(),
    };

    await this.audit('VOICE_QUOTE_PARSED', {
      ipAddress,
      status: contactFilter.blocked ? 'HIGH' : risk.level,
      amount: amount ?? undefined,
      metadata: {
        transcript,
        rawTranscriptBlocked: contactFilter.blocked,
        amount,
        deadline,
        guarantee,
        materialIncluded,
        flags: risk.flags,
        requiresProfessionalConfirmation: true,
      },
    });

    return result;
  }

  async parseCommand(body: any, ipAddress?: string) {
    const transcript = this.cleanText(body?.transcript ?? body?.text);
    const role = this.cleanText(body?.role) || 'client';
    const command = this.detectCommand(transcript, role);

    await this.audit('VOICE_COMMAND_PARSED', {
      ipAddress,
      status: command.requiresConfirmation ? 'CONFIRMATION_REQUIRED' : 'READY',
      metadata: {
        transcript,
        role,
        intent: command.intent,
        action: command.action,
        requiresConfirmation: command.requiresConfirmation,
      },
    });

    return {
      success: true,
      transcript,
      role,
      ...command,
      criticalActionsPolicy:
        'Acoes criticas de tracking continuam exigindo slide, GPS e geofence.',
      premiumVoiceUi: this.premiumVoiceUi(),
      createdAt: new Date().toISOString(),
    };
  }

  async logTranscription(body: any, ipAddress?: string) {
    const rawTranscript = this.cleanText(body?.transcript ?? body?.text);
    const contactFilter = filterDirectContact(rawTranscript);
    const transcript = contactFilter.blocked
      ? contactFilter.cleanMessage
      : rawTranscript;
    const source = this.cleanText(body?.source) || 'voice';
    const orderId = this.cleanText(body?.orderId) || undefined;
    const risk = this.audioRisk(
      transcript,
      this.detectAmount(transcript),
      this.detectGuarantee(transcript),
      this.detectDeadline(transcript),
    );

    await this.audit('VOICE_TRANSCRIPTION_LOGGED', {
      ipAddress,
      orderId,
      status: contactFilter.blocked ? 'HIGH' : risk.level,
      metadata: {
        transcript,
        rawTranscriptBlocked: contactFilter.blocked,
        source,
        locale: this.normalizeLocale(body?.locale),
        speakerRole: this.cleanText(body?.speakerRole),
        flags: [
          ...risk.flags,
          ...(contactFilter.blocked
            ? ['Tentativa de contato direto removida da transcricao']
            : []),
        ],
        auditUse: 'historico, auditoria e disputa',
      },
    });

    return {
      success: true,
      logged: true,
      level: contactFilter.blocked ? 'HIGH' : risk.level,
      flags: [
        ...risk.flags,
        ...(contactFilter.blocked
          ? ['Tentativa de contato direto removida da transcricao']
          : []),
      ],
      contactSafety: {
        blocked: contactFilter.blocked,
        reasons: contactFilter.reasons,
        alert: contactFilter.blocked ? contactFilter.message : null,
      },
      premiumVoiceUi: this.premiumVoiceUi(),
      orderId,
    };
  }

  async saveLanguagePreferences(body: any, ipAddress?: string) {
    const appLocale = this.normalizeLocale(body?.appLocale);
    const spokenLocale = this.normalizeLocale(body?.spokenLocale);
    const userId = this.cleanText(body?.userId) || undefined;

    await this.audit('VOICE_LANGUAGE_PREFERENCES_SAVED', {
      ipAddress,
      userId,
      status: 'READY',
      metadata: {
        appLocale,
        spokenLocale,
        translationReady: true,
        ttsReady: false,
        sttReady: true,
      },
    });

    return {
      success: true,
      appLocale,
      spokenLocale,
      supportedLocales: ['pt_BR', 'es_ES', 'en_US'],
      translationPipelineReady: true,
      voiceTranslationReady: true,
      providerEnabled: false,
    };
  }

  async postServiceSummary(body: any, ipAddress?: string) {
    const orderId = this.cleanText(body?.orderId) || undefined;
    const serviceTitle =
      this.cleanText(body?.serviceTitle) || 'Servico BoraServico';
    const status = this.cleanText(body?.status) || 'FINALIZATION_SENT';
    const proof =
      this.cleanText(body?.proofLabel) || 'Prova enviada pelo profissional.';
    const paymentStatus =
      this.cleanText(body?.paymentStatus) ||
      'Pagamento protegido aguardando confirmacao do cliente.';
    const observation = this.cleanText(body?.observation);
    const startedAt = this.cleanText(body?.startedAt);
    const finishedAt =
      this.cleanText(body?.finishedAt) || new Date().toISOString();

    const summary = [
      `${serviceTitle}: finalizacao registrada no BoraServico.`,
      startedAt ? `Inicio informado: ${startedAt}.` : null,
      `Conclusao enviada: ${finishedAt}.`,
      proof,
      paymentStatus,
      observation ? `Observacao: ${observation}.` : null,
    ]
      .filter(Boolean)
      .join(' ');

    await this.audit('VOICE_POST_SERVICE_SUMMARY_GENERATED', {
      ipAddress,
      orderId,
      status,
      metadata: {
        serviceTitle,
        proof,
        paymentStatus,
        observation,
        summary,
      },
    });

    return {
      success: true,
      orderId,
      status,
      summary,
      visibleTo: ['client', 'professional'],
      noPricePolicy: true,
      createdAt: new Date().toISOString(),
    };
  }

  private detectCategory(transcript: string): VoiceCategory {
    const text = this.normalize(transcript);
    let best = this.categories[0];
    let bestScore = 0;

    for (const category of this.categories) {
      const score = category.keywords.reduce((total, keyword) => {
        return total + (text.includes(this.normalize(keyword)) ? 1 : 0);
      }, 0);

      if (score > bestScore) {
        best = category;
        bestScore = score;
      }
    }

    if (bestScore === 0) {
      return {
        id: 'servicos',
        label: 'Servicos',
        keywords: [],
        title: 'Atendimento BoraServico',
        summary:
          'Pedido organizado pela IA para triagem com profissionais verificados.',
      };
    }

    return best;
  }

  private detectUrgency(transcript: string) {
    const text = this.normalize(transcript);
    if (/(urgente|agora|emergencia|hoje|imediato|o quanto antes)/.test(text)) {
      return 'Urgente';
    }
    if (/(amanha|proxima semana|semana que vem|agendar|marcar)/.test(text)) {
      return 'Agendado';
    }
    return 'Normal';
  }

  private detectSchedule(transcript: string) {
    const text = this.normalize(transcript);
    const now = new Date();
    let preferredDate: string | null = null;
    let preferredTime: string | null = null;

    if (text.includes('hoje')) {
      preferredDate = this.dateOnly(now);
    } else if (text.includes('amanha')) {
      preferredDate = this.dateOnly(
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
      );
    } else if (text.includes('depois de amanha')) {
      preferredDate = this.dateOnly(
        new Date(now.getTime() + 48 * 60 * 60 * 1000),
      );
    }

    const numericTime = text.match(/\b([01]?\d|2[0-3])(?::|h)?([0-5]\d)?\b/);
    if (numericTime) {
      const hour = Number(numericTime[1]);
      const minute = numericTime[2] ? Number(numericTime[2]) : 0;
      preferredTime = this.availableTime(hour, minute);
    } else {
      const spokenHour = this.detectSpokenHour(text);
      if (spokenHour != null) {
        preferredTime = this.availableTime(spokenHour, 0);
      }
    }

    return { preferredDate, preferredTime };
  }

  private detectAddress(transcript: string) {
    const match = transcript.match(
      /\b(rua|avenida|av\.?|alameda|travessa|estrada)\s+([^,.]+)/i,
    );
    if (!match) {
      return null;
    }
    return `${match[1]} ${match[2]}`.trim();
  }

  private buildStructuredDescription(
    transcript: string,
    category: VoiceCategory,
    photosCount: number,
  ) {
    const cleanTranscript =
      transcript || 'Cliente descreveu o problema por voz.';
    const photoLine =
      photosCount > 0
        ? `O pedido possui ${photosCount} foto(s) de apoio para analise visual.`
        : 'Sem foto anexada no momento.';

    return `${category.title}. ${category.summary} Relato do cliente: "${cleanTranscript}". ${photoLine} Cliente solicita avaliacao tecnica de profissional verificado.`;
  }

  private buildTechnicalSummary(
    transcript: string,
    category: VoiceCategory,
    photosCount: number,
  ) {
    const likelyIssue = category.summary;
    const media =
      photosCount > 0
        ? 'Foto e voz combinadas para contexto tecnico.'
        : 'Contexto gerado por voz.';

    return `${likelyIssue} ${media} A IA estruturou o briefing e manteve preco desabilitado. Relato original: ${transcript || 'nao informado'}.`;
  }

  private suggestQuestions(
    categoryId: string,
    transcript: string,
    photosCount: number,
  ) {
    const maxFollowUpQuestions = 5;
    const base = [
      'Qual melhor janela de horario para visita?',
      'O local possui acesso facil para o profissional?',
      'Ha alguma restricao de condominio, portaria ou estacionamento?',
    ];
    const byCategory: Record<string, string[]> = {
      hidraulica: [
        'O vazamento e continuo ou acontece apenas ao usar a pia?',
        'O registro de agua esta acessivel?',
      ],
      eletrica: [
        'O disjuntor esta desarmando?',
        'A tomada aquece ou apresenta cheiro de queimado?',
      ],
      'ar-condicionado': [
        'Qual marca e capacidade do aparelho?',
        'O equipamento esta pingando, sem gelar ou fazendo ruido?',
      ],
      construcao: [
        'Qual area aproximada do reparo?',
        'Ja existe material comprado?',
      ],
      limpeza: [
        'Qual metragem aproximada do ambiente?',
        'Ha necessidade de limpeza pesada ou pos-obra?',
      ],
      pintura: [
        'Quantos ambientes precisam de pintura?',
        'A parede precisa de massa ou correcao previa?',
      ],
      tecnologia: [
        'Qual equipamento apresenta falha?',
        'A rede ou dispositivo esta ligando normalmente?',
      ],
    };

    return [
      ...(byCategory[categoryId] ?? []),
      ...(photosCount > 0
        ? ['As fotos mostram o ponto principal do problema?']
        : ['Enviar foto ajuda o profissional a entender melhor.']),
      ...base,
    ].slice(0, maxFollowUpQuestions);
  }

  private detectAmount(transcript: string): number | null {
    const text = this.normalize(transcript);
    const match = text.match(
      /(?:r\$\s*)?(\d{2,5})(?:[,.](\d{1,2}))?\s*(?:reais|real)?/,
    );
    if (match) {
      const integer = Number(match[1]);
      const cents = match[2] ? Number(match[2].padEnd(2, '0')) / 100 : 0;
      return integer + cents;
    }

    const spoken: Array<[RegExp, number]> = [
      [/cento e oitenta/, 180],
      [/cento e noventa/, 190],
      [/duzentos e cinquenta/, 250],
      [/duzentos/, 200],
      [/trezentos/, 300],
      [/cento e cinquenta/, 150],
      [/cento e vinte/, 120],
      [/cem/, 100],
      [/oitenta/, 80],
      [/noventa/, 90],
      [/setenta/, 70],
      [/cinquenta/, 50],
    ];

    return spoken.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  }

  private detectDeadline(transcript: string) {
    const text = this.normalize(transcript);
    if (text.includes('amanha cedo')) return 'Amanha cedo';
    if (text.includes('amanha')) return 'Amanha';
    if (text.includes('hoje')) return 'Hoje';

    const match = text.match(/(?:em|ate)\s+(\d{1,2})\s*(?:h|horas?)/);
    if (match) {
      return `${match[1]}h`;
    }

    return null;
  }

  private detectGuarantee(transcript: string) {
    const text = this.normalize(transcript);
    const match = text.match(
      /garantia\s+(?:de\s+)?([a-z0-9\s]+?)(?:\.|,|$| e )/,
    );
    if (match) {
      return match[1].trim();
    }

    if (text.includes('garantia')) {
      return 'Garantia mencionada por voz';
    }

    return null;
  }

  private detectMaterialIncluded(transcript: string) {
    const text = this.normalize(transcript);
    if (
      /(sem material|material nao incluso|material nao incluido)/.test(text)
    ) {
      return false;
    }
    return /(material incluso|com material|inclui material|material incluido)/.test(
      text,
    );
  }

  private quoteNotes(
    transcript: string,
    amount: number | null,
    deadline: string | null,
    guarantee: string | null,
    materialIncluded: boolean,
  ) {
    const parts = [
      'Proposta preenchida por voz e pendente de confirmacao do profissional.',
      amount == null
        ? 'Valor nao detectado com seguranca.'
        : `Valor detectado: R$ ${amount.toFixed(2)}.`,
      deadline ? `Prazo: ${deadline}.` : 'Prazo nao detectado.',
      guarantee ? `Garantia: ${guarantee}.` : 'Garantia nao informada.',
      materialIncluded
        ? 'Material mencionado como incluso.'
        : 'Material nao confirmado como incluso.',
      `Transcricao: ${transcript}`,
    ];

    return parts.join(' ');
  }

  private audioRisk(
    transcript: string,
    amount: number | null,
    guarantee: string | null,
    deadline: string | null,
  ): { level: VoiceRiskLevel; flags: string[] } {
    const flags: string[] = [];
    const text = this.normalize(transcript);

    if (amount != null) flags.push('SPOKEN_AMOUNT');
    if (guarantee) flags.push('SPOKEN_GUARANTEE');
    if (deadline) flags.push('SPOKEN_DEADLINE');
    if (/(aceito|fechado|combinado|pode fechar|confirmo)/.test(text)) {
      flags.push('SPOKEN_ACCEPTANCE');
    }
    if (/(pix por fora|fora do app|me chama no whatsapp|telefone)/.test(text)) {
      flags.push('OFF_PLATFORM_CONTACT_RISK');
    }

    const level: VoiceRiskLevel =
      flags.includes('OFF_PLATFORM_CONTACT_RISK') || flags.length >= 4
        ? 'HIGH'
        : flags.length >= 2
          ? 'MEDIUM'
          : 'LOW';

    return { level, flags };
  }

  private detectCommand(transcript: string, role: string) {
    const text = this.normalize(transcript);

    if (/(mostrar|ver).*(servicos|servicos|ordens|minhas)/.test(text)) {
      return this.command(
        'SHOW_SERVICES',
        'NAVIGATE_SERVICES',
        '/client',
        'Abrindo seus servicos.',
        false,
      );
    }
    if (/(ver|abrir).*(negociacoes|propostas|orcamentos)/.test(text)) {
      return this.command(
        'OPEN_NEGOTIATIONS',
        'NAVIGATE_NEGOTIATIONS',
        '/negotiations',
        'Abrindo negociacoes.',
        false,
      );
    }
    if (/(abrir|ver).*(chat|mensagens|conversa)/.test(text)) {
      return this.command(
        'OPEN_CHAT',
        'NAVIGATE_CHAT',
        '/chat',
        'Abrindo chat.',
        false,
      );
    }
    if (/(suporte|ajuda|atendimento)/.test(text)) {
      return this.command(
        'SUPPORT',
        'OPEN_SUPPORT',
        '/support',
        'Chamando suporte BoraServico.',
        false,
      );
    }
    if (/(abrir rota|rota|google maps|mapa)/.test(text)) {
      return this.command(
        'OPEN_ROUTE',
        'OPEN_MAPS',
        null,
        'Rota pronta para abrir.',
        false,
      );
    }
    if (
      /(iniciar deslocamento|estou a caminho|ir para o local|sair para atendimento)/.test(
        text,
      )
    ) {
      return this.command(
        'START_DISPLACEMENT',
        'REQUIRES_SLIDE_START_ROUTE',
        null,
        'Use o slide para iniciar deslocamento com GPS ativo.',
        true,
      );
    }
    if (/(cheguei|fazer check.?in|check.?in)/.test(text)) {
      return this.command(
        'CHECK_IN',
        'REQUIRES_SLIDE_CHECK_IN',
        null,
        'Use o slide para confirmar check-in com GPS e geofence.',
        true,
      );
    }
    if (/(iniciar servico|comecar servico|começar servico|iniciar atendimento)/.test(text)) {
      return this.command(
        'START_SERVICE',
        'REQUIRES_SLIDE_START_SERVICE',
        null,
        'Use o slide para iniciar o serviço com GPS confirmado.',
        true,
      );
    }
    if (
      /(finalizar servico|concluir servico|terminei|checkout|check.?out)/.test(
        text,
      )
    ) {
      return this.command(
        'FINISH_SERVICE',
        'REQUIRES_SLIDE_CHECK_OUT',
        null,
        'Use o slide e envie prova para finalizar.',
        true,
      );
    }
    if (/(buscar|preciso|chamar|procurar)/.test(text)) {
      const category = this.detectCategory(transcript);
      return {
        ...this.command(
          'SEARCH_SERVICE',
          'VOICE_SEARCH_SERVICE',
          '/client/search',
          `Buscando ${category.label}.`,
          false,
        ),
        category: category.label,
        categoryId: category.id,
      };
    }

    return this.command(
      'UNKNOWN',
      'SHOW_VOICE_HELP',
      null,
      'Nao entendi o comando com seguranca.',
      false,
    );
  }

  private command(
    intent: string,
    action: string,
    route: string | null,
    response: string,
    requiresConfirmation: boolean,
  ) {
    return { intent, action, route, response, requiresConfirmation };
  }

  private detectSpokenHour(text: string) {
    const map: Array<[RegExp, number]> = [
      [/duas da tarde|duas horas da tarde/, 14],
      [/tres da tarde|tres horas da tarde/, 15],
      [/quatro da tarde|quatro horas da tarde/, 16],
      [/cinco da tarde|cinco horas da tarde/, 17],
      [/seis da tarde|seis horas da tarde/, 18],
      [/oito da manha|oito horas da manha/, 8],
      [/nove da manha|nove horas da manha/, 9],
      [/dez da manha|dez horas da manha/, 10],
      [/onze da manha|onze horas da manha/, 11],
      [/meio dia|meio-dia/, 12],
    ];

    return map.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  }

  private availableTime(hour: number, minute: number) {
    const times = [
      '08:00',
      '08:30',
      '09:00',
      '10:00',
      '11:00',
      '13:00',
      '14:30',
      '16:00',
      '17:30',
      '18:00',
    ];
    const target = hour * 60 + minute;
    let best = times[0];
    let bestDistance = Number.MAX_SAFE_INTEGER;

    for (const time of times) {
      const [h, m] = time.split(':').map(Number);
      const distance = Math.abs(h * 60 + m - target);
      if (distance < bestDistance) {
        best = time;
        bestDistance = distance;
      }
    }

    return best;
  }

  private dateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private normalizeLocale(value: any) {
    const raw = this.cleanText(value).replace('-', '_');
    if (/^es/i.test(raw)) return 'es_ES';
    if (/^en/i.test(raw)) return 'en_US';
    return 'pt_BR';
  }

  private translationSnapshot(locale: string) {
    return {
      appLocale: locale,
      spokenLocale: locale,
      supportedLocales: ['pt_BR', 'es_ES', 'en_US'],
      speechToTextReady: true,
      textToSpeechReady: false,
      translatedAudioReady: false,
      providerEnabled: false,
    };
  }

  private premiumVoiceUi() {
    return {
      speechToText: true,
      realtimeTranscription: true,
      animatedWaves: true,
      glow: true,
      pulse: true,
      hapticFeedback: true,
      manualTextFallback: true,
      translationReady: true,
    };
  }

  private cleanText(value: any) {
    return repairLegacyEncoding(value)?.trim() ?? '';
  }

  private normalize(value: string) {
    return this.cleanText(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private toInt(value: any) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  private async audit(action: string, input: any) {
    try {
      await this.auditService.register(action, {
        domain: 'voice',
        ...input,
      });
    } catch {
      return null;
    }
  }
}
