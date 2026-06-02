import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { MatchingService } from '../matching/matching.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  OperationalPushEvent,
  PushRealService,
} from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  containsOperationalResidue,
  filterDirectContact,
  repairLegacyEncoding,
} from '../security/contact-filter';

type NegotiationStatus =
  | 'OPEN'
  | 'WAITING_CLIENT'
  | 'WAITING_PROFESSIONAL'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

@Injectable()
export class NegotiationsService {
  private readonly maxProfessionalsPerRequest = 3;
  private schemaReady?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
    private readonly paymentsService: PaymentsService,
    private readonly pushRealService: PushRealService,
  ) {}

  async createRequest(actor: any, body: any) {
    await this.ensureSchema();

    const clientId = this.requireActorId(actor, body?.clientId);
    const title =
      this.readString(body?.title ?? body?.serviceTitle) ||
      this.readString(body?.category) ||
      'Pedido BoraServico';
    const description =
      this.readString(body?.description ?? body?.requestDescription) || '';
    const category = this.readString(body?.category ?? body?.categoryName);
    const address = this.readString(body?.address);
    const urgency = this.readString(body?.urgency) || 'Normal';
    const observations = this.readString(body?.observations ?? body?.notes);

    const contactFilter = filterDirectContact(
      [
        title,
        description,
        observations,
        body?.details,
        body?.extraDetails,
        body?.voiceTranscript,
        body?.transcript,
        body?.counterProposal,
        body?.proposal,
      ]
        .filter(Boolean)
        .join(' '),
    );

    if (contactFilter.blocked) {
      return {
        success: false,
        blocked: true,
        error: 'DIRECT_CONTACT_BLOCKED',
        message: contactFilter.message,
        reasons: contactFilter.reasons,
        cleanMessage: contactFilter.cleanMessage,
      };
    }

    const ai = this.buildAiIntermediation({
      title,
      description,
      category,
      address,
      urgency,
      observations,
      photosCount: body?.photosCount,
      voiceTranscript: body?.voiceTranscript ?? body?.transcript,
      voiceBriefing: body?.voiceBriefing ?? body?.aiBriefing,
    });
    const requestId = this.readString(body?.id) || randomUUID();
    const photos = this.stringifyJson(body?.photos ?? body?.attachments ?? []);
    const metadata = this.stringifyJson({
      source: 'perfect-budget',
      preferredDate: this.readString(body?.preferredDate),
      preferredTime: this.readString(body?.preferredTime),
      voiceTranscript: this.readString(
        body?.voiceTranscript ?? body?.transcript,
      ),
      voiceBriefing: body?.voiceBriefing ?? body?.aiBriefing ?? null,
      photosCount: this.readNumber(body?.photosCount, 0),
      photoVoiceMerged:
        this.readNumber(body?.photosCount, 0) > 0 &&
        Boolean(this.readString(body?.voiceTranscript ?? body?.transcript)),
      mediaEvidence: {
        photos: body?.photos ?? body?.attachments ?? [],
        proofs: body?.proofs ?? [],
        source: body?.mediaSource ?? 'rfq',
      },
      contactSafety: {
        protectedUntilPayment: true,
        blockedTerms: [
          'telefone',
          'WhatsApp',
          'email',
          'endereço completo',
          'links externos',
          'PIX direto',
        ],
      },
      noAiPricing: true,
      createdBy: actor?.role ?? 'CLIENT',
    });

    await this.execute(
      `INSERT INTO "RequestForQuote"
        ("id", "clientId", "status", "title", "description", "category", "address", "urgency",
         "observations", "photos", "aiBriefing", "aiQuestions", "aiWarnings", "metadata", "createdAt", "updatedAt")
       VALUES ($1, $2, 'OPEN', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      requestId,
      clientId,
      title,
      description,
      category,
      address,
      urgency,
      observations,
      photos,
      ai.technicalSummary,
      this.stringifyJson(ai.suggestedQuestions),
      this.stringifyJson(ai.warnings),
      metadata,
    );

    const professionals =
      await this.matchingService.findCompatibleProfessionals(
        {
          requestId,
          orderId: requestId,
          category,
          title,
          serviceTitle: title,
          description,
          address,
          urgency,
          radiusKm: body?.radiusKm ?? 5,
        },
        this.maxProfessionalsPerRequest,
      );
    const selectedProfessionals = professionals.slice(
      0,
      this.maxProfessionalsPerRequest,
    );

    for (const professional of selectedProfessionals) {
      await this.createNegotiationForProfessional({
        requestId,
        clientId,
        professional,
      });
    }

    const payload = {
      requestId,
      serviceOrderId: requestId,
      category,
      title,
      briefing: ai.technicalSummary,
      mediaContext: ai.mediaContext,
      urgency,
      preferredTime: body?.preferredTime,
      protectedAddress: this.protectedAddress(address),
      photosCount: this.readNumber(body?.photosCount, 0),
      voiceIntegrated: Boolean(
        this.readString(body?.voiceTranscript ?? body?.transcript),
      ),
      message: 'Novo orçamento disponivel',
    };

    RealtimeGateway.emitOperational('new-service', { payload });
    RealtimeGateway.emitOperational('quote-request-created', {
      ...payload,
      professionalIds: selectedProfessionals.map((item: any) => item.id),
      maxProfessionals: this.maxProfessionalsPerRequest,
    });
    this.notifyPremium('NEW_REQUEST', {
      ...payload,
      orderId: requestId,
      requestId,
      clientId,
      professionalIds: selectedProfessionals.map((item: any) => item.id),
      serviceTitle: title,
      status: 'OPEN',
    });

    const request = await this.getRequestForActor(requestId, {
      userId: clientId,
      role: 'CLIENT',
    });

    return {
      success: true,
      requestId,
      quoteRequestId: requestId,
      status: 'OPEN',
      message: 'Pedido enviado para até 3 profissionais compativeis.',
      aiIntermediation: ai,
      matching: {
        maxProfessionals: this.maxProfessionalsPerRequest,
        sentProfessionalCount: selectedProfessionals.length,
        professionals: selectedProfessionals.map((item: any) => ({
          id: item.id,
          name: item.name,
          rating: item.rating,
          distanceKm: item.distanceKm,
          etaMinutes: item.etaMinutes,
          visibleBadges: item.visibleBadges,
        })),
      },
      request,
    };
  }

  async listClientRequests(actor: any) {
    await this.ensureSchema();

    const clientId = this.requireActorId(actor);
    const rows = await this.query(
      `SELECT * FROM "RequestForQuote"
       WHERE "clientId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      clientId,
    );

    const requests: any[] = [];

    for (const row of rows.filter((item) => this.isVisiblePublicRow(item))) {
      requests.push(await this.toPublicRequest(row, actor, false));
    }

    return { success: true, requests };
  }

  async listProfessionalNegotiations(actor: any) {
    await this.ensureSchema();

    const professionalId = this.requireActorId(actor);
    const rows = await this.query(
      `SELECT n.*, r."title", r."description", r."category", r."address", r."urgency",
              r."aiBriefing", r."aiQuestions", r."aiWarnings", r."metadata" AS "requestMetadata",
              r."status" AS "requestStatus"
       FROM "Negotiation" n
       JOIN "RequestForQuote" r ON r."id" = n."requestId"
       WHERE n."professionalId" = $1
       ORDER BY n."updatedAt" DESC
       LIMIT 80`,
      professionalId,
    );

    const negotiations: any[] = [];

    for (const row of rows.filter((item) => this.isVisiblePublicRow(item))) {
      negotiations.push(await this.toPublicNegotiation(row, actor));
    }

    return { success: true, negotiations };
  }

  async listAdminNegotiations(actor: any) {
    await this.ensureSchema();
    this.assertAdmin(actor);

    const rows = await this.query(
      `SELECT n.*, r."title", r."description", r."category", r."address", r."urgency",
              r."aiBriefing", r."aiQuestions", r."aiWarnings", r."metadata" AS "requestMetadata",
              r."status" AS "requestStatus"
       FROM "Negotiation" n
       JOIN "RequestForQuote" r ON r."id" = n."requestId"
       ORDER BY n."updatedAt" DESC
       LIMIT 150`,
    );

    const negotiations: any[] = [];

    for (const row of rows.filter((item) => this.isVisiblePublicRow(item))) {
      negotiations.push(await this.toPublicNegotiation(row, actor));
    }

    return {
      success: true,
      negotiations,
      fraudWatch: negotiations
        .filter((item: any) => item.suspicionAlerts.length > 0)
        .map((item: any) => ({
          negotiationId: item.id,
          requestId: item.requestId,
          alerts: item.suspicionAlerts,
        })),
    };
  }

  async getRequestForActor(id: string, actor: any) {
    await this.ensureSchema();

    const request = await this.findRequest(id);
    this.assertRequestAccess(request, actor);

    return this.toPublicRequest(request, actor, true);
  }

  async getNegotiationForActor(id: string, actor: any) {
    await this.ensureSchema();

    const negotiation = await this.findNegotiation(id);
    this.assertNegotiationAccess(negotiation, actor);

    return {
      success: true,
      negotiation: await this.toPublicNegotiation(negotiation, actor),
    };
  }

  async submitQuote(id: string, actor: any, body: any) {
    await this.ensureSchema();

    const negotiation = await this.findNegotiation(id);
    this.assertProfessionalNegotiationAccess(negotiation, actor);
    this.assertNegotiationOpen(negotiation);

    const amount = this.requireAmount(body?.amount ?? body?.value);
    const text = [
      body?.notes,
      body?.note,
      body?.includes,
      body?.excludes,
      body?.deadline,
      body?.voiceTranscript,
      body?.transcript,
    ]
      .filter(Boolean)
      .join(' ');
    this.assertNoDirectContact(text);

    const quoteId = randomUUID();

    await this.execute(
      `INSERT INTO "Quote"
        ("id", "negotiationId", "professionalId", "amount", "deadline", "notes",
         "includes", "excludes", "materialIncluded", "etaMinutes", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      quoteId,
      id,
      negotiation.professionalId,
      amount,
      this.readString(body?.deadline),
      this.readString(body?.notes ?? body?.note ?? body?.observation),
      this.readString(body?.includes),
      this.readString(body?.excludes),
      Boolean(body?.materialIncluded),
      this.readOptionalNumber(body?.etaMinutes ?? body?.eta),
    );
    await this.setNegotiationStatus(id, 'WAITING_CLIENT');
    await this.addEvent(
      id,
      actor,
      'QUOTE_SENT',
      'Orçamento enviado pelo profissional.',
      {
        quoteId,
        amount,
        deadline: this.readString(body?.deadline),
        formalizedFromVoice: Boolean(
          this.readString(body?.voiceTranscript ?? body?.transcript),
        ),
        voiceTranscript: this.readString(
          body?.voiceTranscript ?? body?.transcript,
        ),
        mediaEvidence: body?.photos ?? body?.proofs ?? [],
      },
    );

    RealtimeGateway.emitOperational('negotiation-quote-sent', {
      negotiationId: id,
      requestId: negotiation.requestId,
      orderId: negotiation.acceptedOrderId ?? negotiation.requestId,
      clientId: negotiation.clientId,
      professionalId: negotiation.professionalId,
      amount,
    });
    this.notifyPremium('PROPOSAL_RECEIVED', {
      orderId: negotiation.acceptedOrderId ?? negotiation.requestId,
      requestId: negotiation.requestId,
      negotiationId: id,
      clientId: negotiation.clientId,
      professionalId: negotiation.professionalId,
      serviceTitle: negotiation.title,
      amount,
      status: 'WAITING_CLIENT',
    });

    return this.getNegotiationForActor(id, actor);
  }

  async sendCounterOffer(id: string, actor: any, body: any) {
    await this.ensureSchema();

    const negotiation = await this.findNegotiation(id);
    this.assertClientNegotiationAccess(negotiation, actor);
    this.assertNegotiationOpen(negotiation);

    const amount = this.requireAmount(body?.amount ?? body?.value);
    const message = this.readString(body?.message ?? body?.reason);
    const voiceTranscript = this.readString(
      body?.voiceTranscript ?? body?.transcript,
    );
    this.assertNoDirectContact(message);
    this.assertNoDirectContact(voiceTranscript);

    const counterOfferId = randomUUID();

    await this.execute(
      `INSERT INTO "CounterOffer"
        ("id", "negotiationId", "clientId", "amount", "message", "createdAt")
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      counterOfferId,
      id,
      negotiation.clientId,
      amount,
      message,
    );
    await this.setNegotiationStatus(id, 'WAITING_PROFESSIONAL');
    await this.addEvent(
      id,
      actor,
      'COUNTER_OFFER_SENT',
      'Contraproposta enviada pelo cliente.',
      {
        counterOfferId,
        amount,
        formalizedFromVoice: Boolean(voiceTranscript),
        voiceTranscript,
      },
    );

    RealtimeGateway.emitOperational('negotiation-counter-offer-sent', {
      negotiationId: id,
      requestId: negotiation.requestId,
      orderId: negotiation.acceptedOrderId ?? negotiation.requestId,
      clientId: negotiation.clientId,
      professionalId: negotiation.professionalId,
      amount,
    });
    this.notifyPremium('COUNTER_OFFER_RECEIVED', {
      orderId: negotiation.acceptedOrderId ?? negotiation.requestId,
      requestId: negotiation.requestId,
      negotiationId: id,
      clientId: negotiation.clientId,
      professionalId: negotiation.professionalId,
      serviceTitle: negotiation.title,
      amount,
      status: 'WAITING_PROFESSIONAL',
    });

    return this.getNegotiationForActor(id, actor);
  }

  async sendFinalOffer(id: string, actor: any, body: any) {
    await this.ensureSchema();

    const negotiation = await this.findNegotiation(id);
    this.assertProfessionalNegotiationAccess(negotiation, actor);
    this.assertNegotiationOpen(negotiation);

    const amount = this.requireAmount(body?.amount ?? body?.value);
    const message = this.readString(body?.message ?? body?.notes);
    const voiceTranscript = this.readString(
      body?.voiceTranscript ?? body?.transcript,
    );
    this.assertNoDirectContact(message);
    this.assertNoDirectContact(voiceTranscript);
    const finalOfferId = randomUUID();

    await this.execute(
      `INSERT INTO "FinalOffer"
        ("id", "negotiationId", "professionalId", "amount", "deadline", "message", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      finalOfferId,
      id,
      negotiation.professionalId,
      amount,
      this.readString(body?.deadline),
      message,
    );
    await this.setNegotiationStatus(id, 'WAITING_CLIENT');
    await this.addEvent(
      id,
      actor,
      'FINAL_OFFER_SENT',
      'Valor final enviado pelo profissional.',
      {
        finalOfferId,
        amount,
        formalizedFromVoice: Boolean(voiceTranscript),
        voiceTranscript,
        mediaEvidence: body?.photos ?? body?.proofs ?? [],
      },
    );

    RealtimeGateway.emitOperational('negotiation-final-offer-sent', {
      negotiationId: id,
      requestId: negotiation.requestId,
      orderId: negotiation.acceptedOrderId ?? negotiation.requestId,
      clientId: negotiation.clientId,
      professionalId: negotiation.professionalId,
      amount,
    });
    this.notifyPremium('FINAL_OFFER_RECEIVED', {
      orderId: negotiation.acceptedOrderId ?? negotiation.requestId,
      requestId: negotiation.requestId,
      negotiationId: id,
      clientId: negotiation.clientId,
      professionalId: negotiation.professionalId,
      serviceTitle: negotiation.title,
      amount,
      status: 'WAITING_CLIENT',
    });

    return this.getNegotiationForActor(id, actor);
  }

  async requestDetails(id: string, actor: any, body: any) {
    await this.ensureSchema();

    const negotiation = await this.findNegotiation(id);
    this.assertNegotiationAccess(negotiation, actor);
    this.assertNegotiationOpen(negotiation);

    const message =
      this.readString(body?.message) ||
      'O profissional precisa de mais informações para montar um orçamento preciso.';
    const voiceTranscript = this.readString(
      body?.voiceTranscript ?? body?.transcript,
    );
    this.assertNoDirectContact(message);
    this.assertNoDirectContact(voiceTranscript);
    const role = this.normalizedRole(actor?.role);
    const status: NegotiationStatus =
      role === 'PROFESSIONAL' ? 'WAITING_CLIENT' : 'WAITING_PROFESSIONAL';

    await this.setNegotiationStatus(id, status);
    await this.addEvent(id, actor, 'DETAILS_REQUESTED', message, {
      requestedBy: role,
      nextStep:
        role === 'PROFESSIONAL'
          ? 'CLIENT_SEND_MORE_DETAILS'
          : 'PROFESSIONAL_REVIEW_DETAILS',
      guidedMission: true,
      voiceTranscript,
      mediaEvidence: body?.photos ?? body?.proofs ?? [],
    });

    RealtimeGateway.emitOperational('negotiation-details-requested', {
      negotiationId: id,
      requestId: negotiation.requestId,
      orderId: negotiation.acceptedOrderId ?? negotiation.requestId,
      clientId: negotiation.clientId,
      professionalId: negotiation.professionalId,
      status,
      requestedBy: role,
      message,
    });

    return this.getNegotiationForActor(id, actor);
  }

  async rejectNegotiation(id: string, actor: any, body: any) {
    await this.ensureSchema();

    const negotiation = await this.findNegotiation(id);
    this.assertNegotiationAccess(negotiation, actor);

    const reason = this.readString(body?.reason ?? body?.message);
    this.assertNoDirectContact(reason);
    await this.setNegotiationStatus(id, 'REJECTED');
    await this.addEvent(
      id,
      actor,
      'NEGOTIATION_REJECTED',
      reason || 'Negociacao recusada.',
      { reason },
    );

    return this.getNegotiationForActor(id, actor);
  }

  async acceptNegotiation(id: string, actor: any, body?: any) {
    await this.ensureSchema();

    const negotiation = await this.findNegotiation(id);
    this.assertClientNegotiationAccess(negotiation, actor);
    this.assertNegotiationOpen(negotiation);

    const request = await this.findRequest(negotiation.requestId);
    const selectedAmount = await this.acceptedAmountForNegotiation(id);

    if (selectedAmount <= 0) {
      throw new BadRequestException(
        'A negociacao precisa ter orçamento ou valor final do profissional.',
      );
    }

    const professionalExists = await this.prisma.user
      .findUnique({ where: { id: negotiation.professionalId } })
      .catch(() => null);
    const order = await this.prisma.serviceOrder.create({
      data: {
        clientId: request.clientId,
        professionalId: professionalExists ? negotiation.professionalId : null,
        status: 'ACCEPTED',
        category: request.category,
        address: request.address,
        title: request.title,
        description: this.orderDescription(request),
        price: selectedAmount,
        acceptedAt: new Date(),
      },
    });

    let escrow: any = null;

    try {
      escrow = await this.paymentsService.createEscrow({
        orderId: order.id,
        amount: selectedAmount,
      });
    } catch (error) {
      escrow = {
        success: false,
        error: 'ESCROW_PENDING',
        message:
          error instanceof Error
            ? error.message
            : 'Escrow sera criado na confirmacao de pagamento.',
      };
    }

    await this.execute(
      `UPDATE "RequestForQuote"
       SET "status" = 'ACCEPTED', "acceptedOrderId" = $2, "updatedAt" = NOW()
       WHERE "id" = $1`,
      request.id,
      order.id,
    );
    await this.execute(
      `UPDATE "Negotiation"
       SET "status" = CASE WHEN "id" = $2 THEN 'ACCEPTED' ELSE 'REJECTED' END,
           "acceptedOrderId" = CASE WHEN "id" = $2 THEN $3 ELSE "acceptedOrderId" END,
           "updatedAt" = NOW()
       WHERE "requestId" = $1`,
      request.id,
      id,
      order.id,
    );
    await this.addEvent(
      id,
      actor,
      'NEGOTIATION_ACCEPTED',
      'Proposta aceita pelo cliente.',
      {
        orderId: order.id,
        amount: selectedAmount,
        escrow,
        clientNote: this.readString(body?.message),
      },
    );
    await this.insertOperationalTimeline(order.id, selectedAmount);
    await this.insertSystemChat(order.id, request.clientId, [
      'Negociacao aceita. A OS oficial foi criada.',
      'Pagamento protegido iniciado. O chat operacional e o tracking ficam liberados conforme confirmacao.',
    ]);

    RealtimeGateway.emitOperational('negotiation-accepted', {
      requestId: request.id,
      negotiationId: id,
      orderId: order.id,
      clientId: request.clientId,
      professionalId: negotiation.professionalId,
      amount: selectedAmount,
      status: 'ACCEPTED',
    });
    RealtimeGateway.emitOperational('order-status-updated', {
      orderId: order.id,
      status: 'ACCEPTED',
      amount: selectedAmount,
      professionalId: negotiation.professionalId,
    });
    const escrowConfirmed =
      escrow?.success !== false &&
      ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(
        this.readString(escrow?.status ?? escrow?.payment?.status)
          ?.toUpperCase() ?? '',
      );

    this.notifyPremium('PROPOSAL_ACCEPTED', {
      requestId: request.id,
      negotiationId: id,
      orderId: order.id,
      clientId: request.clientId,
      professionalId: negotiation.professionalId,
      serviceTitle: request.title,
      amount: selectedAmount,
      status: 'ACCEPTED',
    });

    if (escrowConfirmed) {
      RealtimeGateway.emitOperational('payment-confirmed', {
        requestId: request.id,
        negotiationId: id,
        orderId: order.id,
        clientId: request.clientId,
        professionalId: negotiation.professionalId,
        amount: selectedAmount,
        status: 'ESCROW_HELD',
        message: 'Pagamento protegido confirmado',
      });
      RealtimeGateway.emitOperational('contact-released', {
        requestId: request.id,
        negotiationId: id,
        orderId: order.id,
        clientId: request.clientId,
        professionalId: negotiation.professionalId,
        message: 'Endereço, chat e rota liberados',
      });
      this.notifyPremium('PAYMENT_CONFIRMED', {
        requestId: request.id,
        negotiationId: id,
        orderId: order.id,
        clientId: request.clientId,
        professionalId: negotiation.professionalId,
        serviceTitle: request.title,
        amount: selectedAmount,
        status: 'ESCROW_HELD',
      });
      this.notifyPremium('CONTACT_RELEASED', {
        requestId: request.id,
        negotiationId: id,
        orderId: order.id,
        clientId: request.clientId,
        professionalId: negotiation.professionalId,
        serviceTitle: request.title,
        status: 'CONTACT_RELEASED',
      });
    }

    return {
      success: true,
      requestId: request.id,
      negotiationId: id,
      orderId: order.id,
      order: {
        ...order,
        address: escrowConfirmed
          ? order.address
          : this.protectedAddress(order.address ?? undefined),
        protectedAddress: this.protectedAddress(order.address ?? undefined),
        contactUnlocked: escrowConfirmed,
        protectedUntilPayment: !escrowConfirmed,
        routeUnlocked: escrowConfirmed,
        trackingUnlocked: escrowConfirmed,
      },
      escrow,
      acceptedAmount: selectedAmount,
      closedNegotiations: true,
      contactAccess: this.contactSafetySnapshot(escrowConfirmed),
      nextStep: 'escrow_tracking_chat_operacional',
    };
  }

  async intermediaryHelp(actor: any, body: any) {
    await this.ensureSchema();

    const requestId = this.readString(body?.requestId);
    const negotiationId = this.readString(body?.negotiationId);
    const request = requestId
      ? await this.findRequest(requestId)
      : negotiationId
        ? await this.findRequest(
            (await this.findNegotiation(negotiationId)).requestId,
          )
        : undefined;

    if (!request) {
      throw new BadRequestException('requestId ou negotiationId obrigatorio');
    }

    this.assertRequestAccess(request, actor);

    const publicRequest = await this.toPublicRequest(request, actor, true);

    return {
      success: true,
      noPricePolicy: true,
      message:
        'A IA organiza informacoes, aponta riscos e compara propostas reais. Ela não define preço.',
      summary: publicRequest.aiIntermediation,
      comparison: this.compareNegotiations(publicRequest.negotiations ?? []),
    };
  }

  private async createNegotiationForProfessional(input: {
    requestId: string;
    clientId: string;
    professional: any;
  }) {
    if (
      containsOperationalResidue(
        [input.professional?.id, input.professional?.name].join(' '),
      )
    ) {
      return;
    }

    const professionalName = this.readString(input.professional?.name);

    if (!professionalName) {
      return;
    }

    const existingCount = await this.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "Negotiation" WHERE "requestId" = $1`,
      input.requestId,
    );

    if (
      Number(existingCount[0]?.count ?? 0) >= this.maxProfessionalsPerRequest
    ) {
      return;
    }

    const id = randomUUID();
    const metadata = this.stringifyJson({
      neighborhood: input.professional.neighborhood,
      city: input.professional.city,
      visibleBadges: input.professional.visibleBadges ?? [],
      headline: input.professional.headline,
      noAiPricing: true,
    });

    await this.execute(
      `INSERT INTO "Negotiation"
        ("id", "requestId", "clientId", "professionalId", "professionalName", "status",
         "rating", "distanceKm", "responseMinutes", "score", "metadata", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT ("requestId", "professionalId") DO NOTHING`,
      id,
      input.requestId,
      input.clientId,
      input.professional.id,
      professionalName,
      this.readOptionalNumber(input.professional.rating),
      this.readOptionalNumber(input.professional.distanceKm),
      this.readOptionalNumber(input.professional.etaMinutes),
      this.readOptionalNumber(input.professional.score?.finalScore),
      metadata,
    );
    await this.addEvent(
      id,
      { userId: input.clientId, role: 'SYSTEM' },
      'NEGOTIATION_OPENED',
      'Pedido enviado. Aguardando análise do profissional.',
      { professionalId: input.professional.id },
      true,
    );
  }

  private notifyPremium(
    eventType: OperationalPushEvent,
    payload: Record<string, any>,
  ) {
    void this.pushRealService
      .notifyOrderEvent(eventType, payload)
      .catch(() => undefined);
  }

  private async findRequest(id: string) {
    const rows = await this.query(
      `SELECT * FROM "RequestForQuote" WHERE "id" = $1 LIMIT 1`,
      id,
    );
    const request = rows[0];

    if (!request) {
      throw new NotFoundException('Pedido de orçamento não encontrado');
    }

    return request;
  }

  private async findNegotiation(id: string) {
    const rows = await this.query(
      `SELECT n.*, r."title", r."description", r."category", r."address", r."urgency",
              r."aiBriefing", r."aiQuestions", r."aiWarnings", r."metadata" AS "requestMetadata",
              r."status" AS "requestStatus"
       FROM "Negotiation" n
       JOIN "RequestForQuote" r ON r."id" = n."requestId"
       WHERE n."id" = $1
       LIMIT 1`,
      id,
    );
    const negotiation = rows[0];

    if (!negotiation) {
      throw new NotFoundException('Negociacao não encontrada');
    }

    return negotiation;
  }

  private async toPublicRequest(
    row: any,
    actor: any,
    includeNegotiations: boolean,
  ) {
    const negotiations = includeNegotiations
      ? await this.negotiationsForRequest(row.id, actor)
      : undefined;
    const metadata = this.parseJson(row.metadata, {});
    const contactUnlocked = await this.canViewProtectedDetails(row, actor);
    const address = contactUnlocked
      ? row.address
      : this.protectedAddress(row.address);

    return {
      success: true,
      id: row.id,
      requestId: row.id,
      clientId: row.clientId,
      acceptedOrderId: row.acceptedOrderId,
      status: row.status,
      title: this.maskDirectContactText(row.title, contactUnlocked),
      description: this.maskDirectContactText(row.description, contactUnlocked),
      category: row.category,
      address,
      protectedAddress: this.protectedAddress(row.address),
      contactUnlocked,
      urgency: row.urgency,
      observations: this.maskDirectContactText(
        row.observations,
        contactUnlocked,
      ),
      photos: this.parseJson(row.photos, []),
      media: {
        photos: this.parseJson(row.photos, []),
        photosCount:
          this.parseJson(row.photos, []).length ||
          Number(metadata.photosCount ?? 0),
        voiceTranscript: metadata.voiceTranscript ?? null,
        voiceBriefing: metadata.voiceBriefing ?? null,
        photoVoiceMerged: Boolean(metadata.photoVoiceMerged),
      },
      contactSafety: this.contactSafetySnapshot(contactUnlocked),
      aiIntermediation: {
        noPricePolicy: true,
        technicalSummary: row.aiBriefing,
        suggestedQuestions: this.parseJson(row.aiQuestions, []),
        warnings: this.parseJson(row.aiWarnings, []),
        mediaContext: metadata.mediaEvidence ?? null,
      },
      metadata,
      negotiations,
      comparison: negotiations
        ? this.compareNegotiations(negotiations)
        : undefined,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt),
    };
  }

  private async negotiationsForRequest(requestId: string, actor: any) {
    const rows = await this.query(
      `SELECT n.*, r."title", r."description", r."category", r."address", r."urgency",
              r."aiBriefing", r."aiQuestions", r."aiWarnings", r."metadata" AS "requestMetadata",
              r."status" AS "requestStatus"
       FROM "Negotiation" n
       JOIN "RequestForQuote" r ON r."id" = n."requestId"
       WHERE n."requestId" = $1
       ORDER BY n."updatedAt" DESC`,
      requestId,
    );
    const negotiations: any[] = [];

    for (const row of rows
      .filter((item) => this.isVisiblePublicRow(item))
      .slice(0, this.maxProfessionalsPerRequest)) {
      negotiations.push(await this.toPublicNegotiation(row, actor));
    }

    return negotiations;
  }

  private async toPublicNegotiation(row: any, actor: any) {
    const [quotes, counters, finals, events] = await Promise.all([
      this.query(
        `SELECT * FROM "Quote" WHERE "negotiationId" = $1 ORDER BY "createdAt" DESC LIMIT 10`,
        row.id,
      ),
      this.query(
        `SELECT * FROM "CounterOffer" WHERE "negotiationId" = $1 ORDER BY "createdAt" DESC LIMIT 10`,
        row.id,
      ),
      this.query(
        `SELECT * FROM "FinalOffer" WHERE "negotiationId" = $1 ORDER BY "createdAt" DESC LIMIT 10`,
        row.id,
      ),
      this.query(
        `SELECT * FROM "NegotiationEvent" WHERE "negotiationId" = $1 ORDER BY "createdAt" ASC LIMIT 80`,
        row.id,
      ),
    ]);
    const latestQuote = quotes[0] ? this.publicQuote(quotes[0]) : null;
    const latestCounterOffer = counters[0]
      ? this.publicCounter(counters[0])
      : null;
    const latestFinalOffer = finals[0] ? this.publicFinal(finals[0]) : null;
    const requestMetadata = this.parseJson(
      row.requestMetadata ?? row.metadata,
      {},
    );
    const contactUnlocked = await this.canViewProtectedDetails(row, actor);
    const suspicionAlerts = this.detectSuspicion({
      latestQuote,
      latestFinalOffer,
      events,
    });

    return {
      id: row.id,
      negotiationId: row.id,
      requestId: row.requestId,
      clientId: row.clientId,
      professionalId: row.professionalId,
      professionalName: this.readString(row.professionalName),
      status: row.status,
      rating: this.readOptionalNumber(row.rating),
      distanceKm: this.readOptionalNumber(row.distanceKm),
      responseMinutes: this.readOptionalNumber(row.responseMinutes),
      score: this.readOptionalNumber(row.score),
      title: this.maskDirectContactText(row.title, contactUnlocked),
      description: this.maskDirectContactText(row.description, contactUnlocked),
      category: row.category,
      address: contactUnlocked
        ? row.address
        : this.protectedAddress(row.address),
      protectedAddress: this.protectedAddress(row.address),
      contactUnlocked,
      urgency: row.urgency,
      aiIntermediation: {
        noPricePolicy: true,
        technicalSummary: row.aiBriefing,
        suggestedQuestions: this.parseJson(row.aiQuestions, []),
        warnings: this.parseJson(row.aiWarnings, []),
        mediaContext: requestMetadata.mediaEvidence ?? null,
      },
      metadata: this.parseJson(row.metadata, {}),
      contactSafety: this.contactSafetySnapshot(contactUnlocked),
      latestQuote: latestQuote
        ? this.maskContactPayload(latestQuote, contactUnlocked)
        : null,
      latestCounterOffer: latestCounterOffer
        ? this.maskContactPayload(latestCounterOffer, contactUnlocked)
        : null,
      latestFinalOffer: latestFinalOffer
        ? this.maskContactPayload(latestFinalOffer, contactUnlocked)
        : null,
      quotes: quotes.map((item: any) =>
        this.maskContactPayload(this.publicQuote(item), contactUnlocked),
      ),
      counterOffers: counters.map((item: any) =>
        this.maskContactPayload(this.publicCounter(item), contactUnlocked),
      ),
      finalOffers: finals.map((item: any) =>
        this.maskContactPayload(this.publicFinal(item), contactUnlocked),
      ),
      events: events.map((item: any) =>
        this.maskContactPayload(this.publicEvent(item), contactUnlocked),
      ),
      suspicionAlerts,
      roleView: this.normalizedRole(actor?.role),
      acceptedOrderId: row.acceptedOrderId,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt),
    };
  }

  private publicQuote(row: any) {
    return {
      id: row.id,
      amount: Number(row.amount),
      deadline: row.deadline,
      notes: row.notes,
      includes: row.includes,
      excludes: row.excludes,
      materialIncluded: Boolean(row.materialIncluded),
      etaMinutes: this.readOptionalNumber(row.etaMinutes),
      createdAt: this.toIso(row.createdAt),
    };
  }

  private publicCounter(row: any) {
    return {
      id: row.id,
      amount: Number(row.amount),
      message: row.message,
      createdAt: this.toIso(row.createdAt),
    };
  }

  private publicFinal(row: any) {
    return {
      id: row.id,
      amount: Number(row.amount),
      deadline: row.deadline,
      message: row.message,
      createdAt: this.toIso(row.createdAt),
    };
  }

  private publicEvent(row: any) {
    return {
      id: row.id,
      actorId: row.actorId,
      actorRole: row.actorRole,
      type: row.type,
      message: row.message,
      metadata: this.parseJson(row.metadata, {}),
      createdAt: this.toIso(row.createdAt),
    };
  }

  private compareNegotiations(negotiations: any[]) {
    const withAmount = negotiations
      .map((item) => ({
        id: item.id,
        professionalName: item.professionalName,
        amount: item.latestFinalOffer?.amount ?? item.latestQuote?.amount,
        deadline:
          item.latestFinalOffer?.deadline ?? item.latestQuote?.deadline ?? null,
        materialIncluded: item.latestQuote?.materialIncluded ?? false,
        rating: item.rating,
        status: item.status,
      }))
      .filter((item) => Number(item.amount) > 0);

    return {
      noPricePolicy: true,
      summary:
        withAmount.length === 0
          ? 'Aguardando os profissionais enviarem orçamentos reais.'
          : `${withAmount.length} proposta(s) real(is) recebida(s). Compare escopo, prazo, material e reputacao.`,
      proposals: withAmount,
      alerts: negotiations.flatMap((item) => item.suspicionAlerts ?? []),
      reminder:
        'A IA não sugere valor. Ela apenas ajuda a comparar as propostas enviadas por profissionais.',
    };
  }

  private detectSuspicion(input: {
    latestQuote?: any;
    latestFinalOffer?: any;
    events?: any[];
  }) {
    const alerts: string[] = [];
    const quote = input.latestFinalOffer ?? input.latestQuote;

    if (!quote) {
      return alerts;
    }

    if (!input.latestQuote?.materialIncluded) {
      alerts.push('O profissional não informou material incluso.');
    }

    const deadline = `${quote.deadline ?? ''}`.toLowerCase();

    if (
      deadline.includes('agora') ||
      deadline.includes('30 min') ||
      deadline.includes('imediato')
    ) {
      alerts.push(
        'Prazo muito curto: confirme deslocamento e escopo antes de aceitar.',
      );
    }

    const joined = (input.events ?? [])
      .map((item: any) => `${item.message ?? ''} ${item.metadata ?? ''}`)
      .join(' ')
      .toLowerCase();

    if (
      joined.includes('whatsapp') ||
      joined.includes('telefone') ||
      joined.includes('pix direto') ||
      joined.includes('fora do app')
    ) {
      alerts.push('Possivel tentativa de contato ou pagamento fora do app.');
    }

    return alerts;
  }

  private buildAiIntermediation(data: any) {
    const category = this.readString(data.category) || 'serviço residencial';
    const description = this.readString(data.description) || '';
    const urgency = this.readString(data.urgency) || 'Normal';
    const voiceTranscript = this.readString(data.voiceTranscript);
    const voiceBriefing = this.readString(data.voiceBriefing);
    const photosCount = this.readNumber(data.photosCount, 0);
    const missing: string[] = [];

    if (description.length < 40) {
      missing.push('Descreva onde ocorre o problema e ha quanto tempo.');
    }

    if (!this.readString(data.address)) {
      missing.push('Informe bairro ou endereço para calcular distancia.');
    }

    if (photosCount === 0) {
      missing.push(
        'Fotos ajudam o profissional a responder com mais precisão.',
      );
    }

    const suggestedQuestions = [
      `Qual e o objetivo principal do serviço de ${category}?`,
      'Existe material comprado ou o profissional deve informar o que precisa?',
      'Qual janela de horário e melhor para visita ou execução?',
      'Há alguma restrição de acesso, condomínio, portaria ou vaga?',
      ...missing,
    ].slice(0, 6);
    const warnings = [
      'A IA não define preço e não gera orçamento automatico.',
      urgency.toLowerCase().includes('emerg')
        ? 'Urgencia alta: confirme prazo real com cada profissional.'
        : undefined,
    ].filter(Boolean);
    const technicalSummary = [
      `Categoria: ${category}.`,
      `Urgencia: ${urgency}.`,
      description ? `Descricao organizada: ${description}` : undefined,
      voiceTranscript
        ? `Transcricao de voz integrada: ${voiceTranscript}`
        : undefined,
      voiceBriefing ? `Briefing de voz: ${voiceBriefing}` : undefined,
      photosCount > 0
        ? `${photosCount} foto(s) anexada(s) ao contexto do RFQ.`
        : undefined,
      data.observations ? `Observacoes: ${data.observations}` : undefined,
      missing.length > 0
        ? `Pontos a complementar: ${missing.join(' ')}`
        : 'Briefing inicial suficiente para receber propostas.',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      noPricePolicy: true,
      technicalSummary,
      suggestedQuestions,
      warnings,
      mediaContext: {
        photosCount,
        voiceIntegrated: Boolean(voiceTranscript || voiceBriefing),
        photoVoiceMerged:
          photosCount > 0 && Boolean(voiceTranscript || voiceBriefing),
      },
    };
  }

  private async acceptedAmountForNegotiation(id: string) {
    const finals = await this.query(
      `SELECT "amount" FROM "FinalOffer" WHERE "negotiationId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      id,
    );

    if (finals[0]) {
      return Number(finals[0].amount);
    }

    const quotes = await this.query(
      `SELECT "amount" FROM "Quote" WHERE "negotiationId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      id,
    );

    return quotes[0] ? Number(quotes[0].amount) : 0;
  }

  private async setNegotiationStatus(id: string, status: NegotiationStatus) {
    await this.execute(
      `UPDATE "Negotiation" SET "status" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
      id,
      status,
    );
  }

  private async addEvent(
    negotiationId: string,
    actor: any,
    type: string,
    message: string,
    metadata?: any,
    ignoreMissing = false,
  ) {
    try {
      await this.execute(
        `INSERT INTO "NegotiationEvent"
          ("id", "negotiationId", "actorId", "actorRole", "type", "message", "metadata", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        randomUUID(),
        negotiationId,
        this.readString(actor?.userId ?? actor?.id),
        this.normalizedRole(actor?.role),
        type,
        message,
        this.stringifyJson(metadata ?? {}),
      );
    } catch (error) {
      if (!ignoreMissing) {
        throw error;
      }
    }
  }

  private async insertOperationalTimeline(orderId: string, amount: number) {
    await this.prisma.operationalTimelineEvent
      .createMany({
        data: [
          {
            orderId,
            type: 'CREATED',
            title: 'OS criada apos aceite',
            description:
              'Negociacao aceita pelo cliente e convertida em ordem oficial.',
            state: 'COMPLETE',
            metadata: this.stringifyJson({ source: 'perfect-budget', amount }),
          },
          {
            orderId,
            type: 'MATCHING_STARTED',
            title: 'Escrow iniciado',
            description:
              'Pagamento protegido conectado ao novo fluxo de negociacao.',
            state: 'CURRENT',
            metadata: this.stringifyJson({ source: 'perfect-budget', amount }),
          },
        ],
      })
      .catch(() => undefined);
  }

  private async insertSystemChat(
    orderId: string,
    clientId: string,
    messages: string[],
  ) {
    for (const message of messages) {
      await this.prisma.chatMessage
        .create({
          data: {
            orderId,
            senderId: clientId,
            senderRole: 'SYSTEM',
            message,
          },
        })
        .catch(() => undefined);
    }
  }

  private orderDescription(request: any) {
    return [
      request.aiBriefing,
      request.description,
      request.observations ? `Observacoes: ${request.observations}` : undefined,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private assertRequestAccess(request: any, actor: any) {
    if (this.isAdmin(actor)) {
      return;
    }

    const userId = this.readString(actor?.userId ?? actor?.id);

    if (request.clientId === userId) {
      return;
    }

    throw new ForbiddenException('Acesso negado ao pedido de orçamento');
  }

  private assertNegotiationAccess(negotiation: any, actor: any) {
    if (this.isAdmin(actor)) {
      return;
    }

    const userId = this.readString(actor?.userId ?? actor?.id);

    if (
      negotiation.clientId === userId ||
      negotiation.professionalId === userId
    ) {
      return;
    }

    throw new ForbiddenException('Acesso negado a negociacao');
  }

  private assertClientNegotiationAccess(negotiation: any, actor: any) {
    if (this.isAdmin(actor)) {
      return;
    }

    const userId = this.readString(actor?.userId ?? actor?.id);

    if (negotiation.clientId !== userId) {
      throw new ForbiddenException('Somente o cliente pode executar esta acao');
    }
  }

  private assertProfessionalNegotiationAccess(negotiation: any, actor: any) {
    if (this.isAdmin(actor)) {
      return;
    }

    const userId = this.readString(actor?.userId ?? actor?.id);

    if (negotiation.professionalId !== userId) {
      throw new ForbiddenException(
        'Somente o profissional desta negociacao pode executar esta acao',
      );
    }
  }

  private assertNegotiationOpen(negotiation: any) {
    if (
      ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(
        negotiation.status,
      )
    ) {
      throw new BadRequestException('Negociacao encerrada');
    }
  }

  private assertAdmin(actor: any) {
    if (!this.isAdmin(actor)) {
      throw new ForbiddenException('Acesso administrativo obrigatorio');
    }
  }

  private isAdmin(actor: any) {
    return this.normalizedRole(actor?.role) === 'ADMIN';
  }

  private requireActorId(actor: any, fallback?: any) {
    const id = this.readString(actor?.userId ?? actor?.id ?? fallback);

    if (!id) {
      throw new BadRequestException('Usuario autenticado obrigatorio');
    }

    return id;
  }

  private requireAmount(value: any) {
    const amount = this.readNumber(value, 0);

    if (amount <= 0) {
      throw new BadRequestException(
        'Valor deve ser informado pelo profissional ou cliente.',
      );
    }

    return Math.round(amount * 100) / 100;
  }

  private assertNoDirectContact(text?: string) {
    const contactFilter = filterDirectContact(text);

    if (contactFilter.blocked) {
      throw new BadRequestException({
        error: 'DIRECT_CONTACT_BLOCKED',
        message: contactFilter.message,
        reasons: contactFilter.reasons,
        cleanMessage: contactFilter.cleanMessage,
      });
    }
  }

  private async canViewProtectedDetails(row: any, actor: any) {
    void actor;
    const orderId = this.readString(row.acceptedOrderId);

    if (!orderId) {
      return false;
    }

    try {
      const status = await this.paymentsService.getOrderStatus(orderId);
      const paymentStatus = this.readString(status?.status)?.toUpperCase();

      return Boolean(
        paymentStatus &&
        ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(
          paymentStatus,
        ),
      );
    } catch {
      return false;
    }
  }

  private contactSafetySnapshot(unlocked: boolean) {
    return {
      protectedUntilPayment: !unlocked,
      unlocked,
      alert: unlocked
        ? null
        : 'Contato protegido até o pagamento. Use o chat do BoraServiço.',
      blockedTerms: [
        'telefone',
        'WhatsApp',
        'e-mail',
        'endereço completo',
        'links externos',
        'PIX direto',
        'Instagram',
        'TikTok',
        'Facebook',
        'Telegram',
        'QR Code',
        '@usuários',
      ],
    };
  }

  private maskContactPayload<T>(payload: T, unlocked: boolean): T {
    if (unlocked || payload == null || typeof payload !== 'object') {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) =>
        this.maskContactPayload(item, unlocked),
      ) as T;
    }

    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(payload as Record<string, any>)) {
      if (typeof value === 'string') {
        const contactFilter = filterDirectContact(value);
        result[key] = contactFilter.blocked
          ? contactFilter.cleanMessage
          : value;
        if (contactFilter.blocked) {
          result.contactBlocked = true;
          result.contactBlockedReasons = contactFilter.reasons;
          result.contactBlockedMessage = contactFilter.message;
        }
      } else if (value && typeof value === 'object') {
        result[key] = this.maskContactPayload(value, unlocked);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  private maskDirectContactText(value: any, unlocked: boolean) {
    const text = this.readString(value);

    if (!text || unlocked) {
      return text;
    }

    const contactFilter = filterDirectContact(text);

    return contactFilter.blocked ? contactFilter.cleanMessage : text;
  }

  private isVisiblePublicRow(row: any) {
    return !containsOperationalResidue(
      [
        row?.id,
        row?.requestId,
        row?.professionalId,
        row?.professionalName,
        row?.title,
        row?.description,
        row?.category,
        row?.address,
        row?.observations,
        row?.metadata,
        row?.requestMetadata,
      ].join(' '),
    );
  }

  private protectedAddress(address?: string) {
    const value = this.readString(address);

    if (!value) {
      return 'Endereço protegido até o pagamento protegido.';
    }

    const parts = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const safeParts = parts.filter((part) => {
      const normalized = part
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      return (
        !/\d/.test(normalized) &&
        !/\b(rua|avenida|av|travessa|número|nro|apto|apartamento|bloco|casa|cep)\b/.test(
          normalized,
        )
      );
    });
    const region = safeParts[safeParts.length - 1];

    return region
      ? `${region}, endereço protegido`
      : 'Região protegida até o pagamento protegido.';
  }

  private readString(value: any) {
    const text = repairLegacyEncoding(value)?.trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readNumber(value: any, fallback: number) {
    const parsed =
      typeof value === 'string'
        ? Number(value.replace(/\./g, '').replace(',', '.'))
        : Number(value);

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private readOptionalNumber(value: any) {
    const parsed = this.readNumber(value, Number.NaN);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizedRole(value: any) {
    const role = this.readString(value)?.toUpperCase();

    if (
      role === 'PROFISSIONAL' ||
      role === 'PROVIDER' ||
      role === 'PRESTADOR'
    ) {
      return 'PROFESSIONAL';
    }

    if (role === 'CLIENTE' || role === 'CUSTOMER' || role === 'USER') {
      return 'CLIENT';
    }

    return role || 'SYSTEM';
  }

  private stringifyJson(value: any) {
    try {
      return JSON.stringify(value ?? null);
    } catch {
      return null;
    }
  }

  private parseJson(value: any, fallback: any) {
    if (value == null || value === '') {
      return fallback;
    }

    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  private toIso(value: any) {
    if (!value) {
      return null;
    }

    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private query<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(sql, ...params);
  }

  private async execute(sql: string, ...params: any[]) {
    await this.prisma.$executeRawUnsafe(sql, ...params);
  }

  private async ensureSchema() {
    this.schemaReady ??= this.createSchema();
    return this.schemaReady;
  }

  private async createSchema() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS "RequestForQuote" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "clientId" TEXT NOT NULL,
        "acceptedOrderId" TEXT UNIQUE,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "category" TEXT,
        "address" TEXT,
        "urgency" TEXT,
        "observations" TEXT,
        "photos" TEXT,
        "aiBriefing" TEXT,
        "aiQuestions" TEXT,
        "aiWarnings" TEXT,
        "metadata" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "Negotiation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "requestId" TEXT NOT NULL,
        "acceptedOrderId" TEXT UNIQUE,
        "clientId" TEXT NOT NULL,
        "professionalId" TEXT NOT NULL,
        "professionalName" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "rating" DOUBLE PRECISION,
        "distanceKm" DOUBLE PRECISION,
        "responseMinutes" INTEGER,
        "score" DOUBLE PRECISION,
        "metadata" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "Quote" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "negotiationId" TEXT NOT NULL,
        "professionalId" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "deadline" TEXT,
        "notes" TEXT,
        "includes" TEXT,
        "excludes" TEXT,
        "materialIncluded" BOOLEAN NOT NULL DEFAULT false,
        "etaMinutes" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "CounterOffer" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "negotiationId" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "message" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "FinalOffer" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "negotiationId" TEXT NOT NULL,
        "professionalId" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "deadline" TEXT,
        "message" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "NegotiationEvent" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "negotiationId" TEXT NOT NULL,
        "actorId" TEXT,
        "actorRole" TEXT NOT NULL DEFAULT 'SYSTEM',
        "type" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "metadata" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Negotiation_requestId_professionalId_key"
        ON "Negotiation"("requestId", "professionalId")`,
      `CREATE INDEX IF NOT EXISTS "RequestForQuote_clientId_createdAt_idx"
        ON "RequestForQuote"("clientId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "Negotiation_professionalId_status_idx"
        ON "Negotiation"("professionalId", "status")`,
      `CREATE INDEX IF NOT EXISTS "Negotiation_clientId_status_idx"
        ON "Negotiation"("clientId", "status")`,
      `CREATE INDEX IF NOT EXISTS "Quote_negotiationId_createdAt_idx"
        ON "Quote"("negotiationId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "CounterOffer_negotiationId_createdAt_idx"
        ON "CounterOffer"("negotiationId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "FinalOffer_negotiationId_createdAt_idx"
        ON "FinalOffer"("negotiationId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "NegotiationEvent_negotiationId_createdAt_idx"
        ON "NegotiationEvent"("negotiationId", "createdAt")`,
    ];

    for (const statement of statements) {
      await this.execute(statement);
    }
  }
}
