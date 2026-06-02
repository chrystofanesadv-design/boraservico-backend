import { Injectable } from '@nestjs/common';
import { ContactIntelligenceService } from '../contact-intelligence/contact-intelligence.service';

type SupportedLocale = 'pt_BR' | 'en_US' | 'es_ES';

interface VoiceTranslationRequest {
  orderId?: string;
  senderId?: string;
  receiverId?: string;
  sourceLocale?: SupportedLocale;
  targetLocale?: SupportedLocale;
  transcript?: string;
  ocrText?: string;
  previousMessages?: string[];
  allowAfterProtectedPayment?: boolean;
}

@Injectable()
export class VoiceTranslationEnterpriseService {
  private readonly history: Array<Record<string, unknown>> = [];

  constructor(private readonly contactIntelligenceService: ContactIntelligenceService) {}

  status() {
    return {
      status: 'ok',
      module: 'voice-translation-enterprise',
      supportedLocales: ['pt_BR', 'en_US', 'es_ES'],
      speechToText: { providerReady: false, fallbackTranscriptReady: true },
      translation: { providerReady: false, localFallbackReady: true },
      textToSpeech: { providerReady: false, payloadReady: true },
      antifraud: {
        fragmentedPhone: true,
        spelledPhone: true,
        fragmentedAddress: true,
        channels: ['voice-transcript', 'chat', 'ocr', 'rfq', 'negotiation', 'proposal'],
      },
    };
  }

  translateVoice(payload: VoiceTranslationRequest) {
    const sourceLocale = this.normalizeLocale(payload?.sourceLocale);
    const targetLocale = this.normalizeLocale(payload?.targetLocale);
    const transcript = this.clean(payload?.transcript);

    const fraud = this.contactIntelligenceService.check({
      content: transcript,
      transcript,
      ocrText: payload?.ocrText,
      messages: payload?.previousMessages,
      source: 'voice-translation',
      allowAfterProtectedPayment: payload?.allowAfterProtectedPayment === true,
    });

    if (fraud.blocked) {
      const blocked = {
        success: false,
        blocked: true,
        reason: 'DIRECT_CONTACT_BLOCKED',
        fraud,
        message: 'A mensagem de voz foi bloqueada por possÃ­vel tentativa de contato externo antes do pagamento protegido.',
      };
      this.saveHistory(payload, blocked);
      return blocked;
    }

    const translatedText = this.translateFallback(transcript, sourceLocale, targetLocale);
    const result = {
      success: true,
      blocked: false,
      orderId: payload?.orderId,
      senderId: payload?.senderId,
      receiverId: payload?.receiverId,
      sourceLocale,
      targetLocale,
      originalTranscript: transcript,
      translatedText,
      subtitles: [
        { locale: sourceLocale, label: this.localeLabel(sourceLocale), text: transcript },
        { locale: targetLocale, label: this.localeLabel(targetLocale), text: translatedText },
      ],
      textToSpeech: {
        providerReady: false,
        locale: targetLocale,
        text: translatedText,
        hint: 'Payload pronto para provider TTS real.',
      },
      fraud,
      createdAt: new Date().toISOString(),
    };

    this.saveHistory(payload, result);
    return result;
  }

  translateChat(payload: VoiceTranslationRequest & { message?: string }) {
    return this.translateVoice({
      ...payload,
      transcript: payload?.message ?? payload?.transcript,
    });
  }

  listHistory(orderId?: string) {
    const items = orderId
      ? this.history.filter((item) => item.orderId === orderId)
      : this.history;

    return {
      total: items.length,
      items: items.slice(0, 100),
    };
  }

  private saveHistory(payload: VoiceTranslationRequest, result: Record<string, unknown>) {
    this.history.unshift({
      id: `voice_translation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orderId: payload?.orderId,
      senderId: payload?.senderId,
      receiverId: payload?.receiverId,
      result,
      createdAt: new Date().toISOString(),
    });

    if (this.history.length > 300) {
      this.history.pop();
    }
  }

  private translateFallback(text: string, sourceLocale: SupportedLocale, targetLocale: SupportedLocale): string {
    if (!text || sourceLocale === targetLocale) return text;

    const dictionary: Record<string, Record<string, string>> = {
      'pt_BR:en_US': {
        'preciso de ajuda': 'I need help',
        'servico concluido': 'service completed',
        'estou chegando': 'I am arriving',
        'pode confirmar': 'can you confirm',
      },
      'pt_BR:es_ES': {
        'preciso de ajuda': 'necesito ayuda',
        'servico concluido': 'servicio terminado',
        'estou chegando': 'estoy llegando',
        'pode confirmar': 'puede confirmar',
      },
      'en_US:pt_BR': {
        'i need help': 'preciso de ajuda',
        'service completed': 'serviÃ§o concluÃ­do',
        'i am arriving': 'estou chegando',
        'can you confirm': 'pode confirmar',
      },
      'es_ES:pt_BR': {
        'necesito ayuda': 'preciso de ajuda',
        'servicio terminado': 'serviÃ§o concluÃ­do',
        'estoy llegando': 'estou chegando',
        'puede confirmar': 'pode confirmar',
      },
    };

    const key = `${sourceLocale}:${targetLocale}`;
    const normalized = this.normalize(text);
    const translated = dictionary[key]?.[normalized];

    if (translated) return translated;

    return `[${this.localeLabel(targetLocale)}] ${text}`;
  }

  private normalizeLocale(locale?: string): SupportedLocale {
    if (locale === 'en_US' || locale === 'es_ES' || locale === 'pt_BR') return locale;
    return 'pt_BR';
  }

  private localeLabel(locale: SupportedLocale): string {
    if (locale === 'en_US') return 'InglÃªs';
    if (locale === 'es_ES') return 'Espanhol';
    return 'PortuguÃªs';
  }

  private clean(value?: string): string {
    return (value ?? '').trim();
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
