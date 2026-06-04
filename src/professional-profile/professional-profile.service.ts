type VerificationStatus = 'not_requested' | 'pending' | 'verified' | 'rejected';

type ProfessionalProfile = {
  professionalId: string;
  displayName: string;
  headline: string;
  verification: {
    identity: VerificationStatus;
    selfie: VerificationStatus;
    document: VerificationStatus;
    address: VerificationStatus;
    explanation: string;
  };
  reputation: {
    averageRating: number;
    completedServices: number;
    punctuality: number;
    communication: number;
    quality: number;
    cleanliness: number;
    negotiation: number;
    trustScore: number;
  };
  badges: string[];
  aiSummary: string;
  lastReviews: Array<{
    id: string;
    clientName: string;
    rating: number;
    comment: string;
    tags: string[];
    createdAt: string;
  }>;
  updatedAt: string;
};

export class ProfessionalProfileService {
  private readonly profiles = new Map<string, ProfessionalProfile>();

  findOne(professionalId: string) {
    return this.ensureProfile(professionalId);
  }

  requestVerification(professionalId: string, body: Record<string, unknown>) {
    const profile = this.ensureProfile(professionalId);
    profile.verification = {
      identity: 'pending',
      selfie: body.selfieSubmitted === false ? 'not_requested' : 'pending',
      document: body.documentSubmitted === false ? 'not_requested' : 'pending',
      address: body.addressSubmitted === false ? 'not_requested' : 'pending',
      explanation:
        'Verificacao opcional solicitada. Ela aumenta confianca, melhora conversao e ajuda o cliente a escolher com mais seguranca, sem criar garantia propria do BoraServico.',
    };
    profile.updatedAt = new Date().toISOString();
    return profile;
  }

  createReview(professionalId: string, body: Record<string, unknown>) {
    const profile = this.ensureProfile(professionalId);
    const rating = this.toNumber(body.rating, 5);
    const review = {
      id: `review-${Date.now()}`,
      clientName: String(body.clientName || 'Cliente BoraServico'),
      rating,
      comment: String(
        body.comment || 'Profissional avaliado em criterios multidimensionais.',
      ),
      tags: Array.isArray(body.tags)
        ? body.tags.map((item) => String(item))
        : ['pontualidade', 'comunicacao', 'qualidade'],
      createdAt: new Date().toISOString(),
    };

    profile.lastReviews = [review, ...profile.lastReviews].slice(0, 5);
    profile.reputation.completedServices += 1;
    profile.reputation.averageRating = this.roundOne(
      (profile.reputation.averageRating + rating) / 2,
    );
    profile.reputation.trustScore = this.calculateTrustScore(profile);
    profile.aiSummary = this.buildAiSummary(profile);
    profile.updatedAt = new Date().toISOString();
    return profile;
  }

  updateTrustSummary(professionalId: string, body: Record<string, unknown>) {
    const profile = this.ensureProfile(professionalId);
    profile.headline = String(body.headline || profile.headline);
    profile.aiSummary = String(body.aiSummary || this.buildAiSummary(profile));
    profile.updatedAt = new Date().toISOString();
    return profile;
  }

  private ensureProfile(professionalId: string): ProfessionalProfile {
    const cleanId = professionalId?.trim() || 'visual-test-professional';
    const existing = this.profiles.get(cleanId);

    if (existing) {
      return existing;
    }

    const profile: ProfessionalProfile = {
      professionalId: cleanId,
      displayName: 'Profissional BoraServico',
      headline: 'Perfil premium em construcao com verificacao opcional.',
      verification: {
        identity: 'not_requested',
        selfie: 'not_requested',
        document: 'not_requested',
        address: 'not_requested',
        explanation:
          'A verificacao e opcional e serve para aumentar confianca. A responsabilidade do servico continua sendo entre cliente e profissional.',
      },
      reputation: {
        averageRating: 4.9,
        completedServices: 18,
        punctuality: 4.8,
        communication: 4.9,
        quality: 4.9,
        cleanliness: 4.7,
        negotiation: 4.8,
        trustScore: 92,
      },
      badges: [
        'Identidade opcional',
        'Boa comunicacao',
        'Pontualidade alta',
        'Preco justo por IA',
      ],
      aiSummary:
        'Profissional com bom historico, comunicacao clara e avaliacao alta. Verificacao opcional recomendada para aumentar conversao.',
      lastReviews: [
        {
          id: 'seed-review-1',
          clientName: 'Cliente verificado',
          rating: 5,
          comment: 'Atendimento claro, pontual e bem explicado.',
          tags: ['pontual', 'educado', 'organizado'],
          createdAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(cleanId, profile);
    return profile;
  }

  private calculateTrustScore(profile: ProfessionalProfile) {
    const base = profile.reputation.averageRating * 18;
    const verificationBonus = Object.values(profile.verification).filter(
      (value) => value === 'verified' || value === 'pending',
    ).length;
    return Math.min(99, Math.round(base + verificationBonus));
  }

  private buildAiSummary(profile: ProfessionalProfile) {
    return `Nota ${profile.reputation.averageRating.toFixed(1)}, ${profile.reputation.completedServices} servicos concluidos e confianca ${profile.reputation.trustScore}/100. Perfil premium ajuda o cliente a decidir com seguranca.`;
  }

  private toNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private roundOne(value: number) {
    return Math.round(value * 10) / 10;
  }
}
