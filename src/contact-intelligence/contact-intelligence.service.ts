import { Injectable } from '@nestjs/common';

export type ContactIntelligenceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ContactIntelligenceAction = 'ALLOW' | 'WARN' | 'BLOCK';

export interface ContactIntelligenceViolation {
  type: string;
  label: string;
  severity: ContactIntelligenceSeverity;
  confidence: number;
  evidence: string;
}

export interface ContactIntelligenceResult {
  allowed: boolean;
  blocked: boolean;
  action: ContactIntelligenceAction;
  confidence: number;
  cleanMessage: string;
  maskedContent: string;
  violations: ContactIntelligenceViolation[];
  checkedAt: string;
}

@Injectable()
export class ContactIntelligenceService {
  private readonly numberWords: Record<string, string> = {
    zero: '0',
    um: '1',
    uma: '1',
    primeiro: '1',
    dois: '2',
    duas: '2',
    tres: '3',
    trÃªs: '3',
    treis: '3',
    quatro: '4',
    quarto: '4',
    cinco: '5',
    meia: '6',
    seis: '6',
    sete: '7',
    oito: '8',
    nove: '9',
    dez: '10',
  };

  check(payload: {
    content?: string;
    transcript?: string;
    ocrText?: string;
    messages?: string[];
    source?: string;
    allowAfterProtectedPayment?: boolean;
  }): ContactIntelligenceResult {
    const rawParts = [
      payload.content,
      payload.transcript,
      payload.ocrText,
      ...(Array.isArray(payload.messages) ? payload.messages : []),
    ]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());

    const rawContent = rawParts.join('\n');
    const normalized = this.normalize(rawContent);
    const wordDigits = this.wordsToDigits(normalized);
    const compactDigits = this.onlyDigits(wordDigits);
    const lines = rawContent
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const violations: ContactIntelligenceViolation[] = [];

    violations.push(...this.detectDirectPatterns(rawContent, normalized));
    violations.push(...this.detectFragmentedPhone(lines, wordDigits, compactDigits));
    violations.push(...this.detectAddressFragment(lines, normalized));

    const uniqueViolations = this.unique(violations);
    const maxConfidence = uniqueViolations.reduce((max, item) => Math.max(max, item.confidence), 0);
    const blocked = !payload.allowAfterProtectedPayment && uniqueViolations.length > 0;

    return {
      allowed: !blocked,
      blocked,
      action: blocked ? 'BLOCK' : uniqueViolations.length > 0 ? 'WARN' : 'ALLOW',
      confidence: maxConfidence,
      cleanMessage: blocked ? 'Mensagem bloqueada por possÃ­vel contato externo antes do pagamento protegido.' : rawContent,
      maskedContent: this.mask(rawContent),
      violations: uniqueViolations,
      checkedAt: new Date().toISOString(),
    };
  }

  private detectDirectPatterns(rawContent: string, normalized: string): ContactIntelligenceViolation[] {
    const rules: Array<{
      type: string;
      label: string;
      severity: ContactIntelligenceSeverity;
      confidence: number;
      pattern: RegExp;
    }> = [
      { type: 'email', label: 'E-mail externo', severity: 'HIGH', confidence: 94, pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
      { type: 'url', label: 'Link externo', severity: 'HIGH', confidence: 92, pattern: /(?:https?:\/\/|www\.|\.com\b|\.com\.br\b|\.net\b|\.org\b|bit\.ly|linktr\.ee)/i },
      { type: 'social', label: 'Rede social ou arroba', severity: 'HIGH', confidence: 90, pattern: /(?:instagram|insta|tiktok|tik tok|telegram|facebook|@)[a-z0-9._-]{3,}/i },
      { type: 'whatsapp', label: 'Tentativa de WhatsApp', severity: 'CRITICAL', confidence: 96, pattern: /(?:whats(?:app)?|zap|wpp|me chama|chama no zap|manda mensagem)/i },
      { type: 'external_deal', label: 'Tentativa de fechar por fora', severity: 'CRITICAL', confidence: 97, pattern: /(?:por fora|fora do app|sem taxa|direto comigo|fecha comigo direto|nao fala aqui|nÃ£o fala aqui)/i },
      { type: 'phone_direct', label: 'Telefone direto', severity: 'CRITICAL', confidence: 97, pattern: /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[\s.\-]?\d{4}/ },
      { type: 'pix_qr', label: 'PIX/QR externo', severity: 'CRITICAL', confidence: 96, pattern: /(?:qr\s?code|pix copia e cola|copia e cola|br\.gov\.bcb\.pix|chave pix)/i },
    ];

    const haystack = `${rawContent}\n${normalized}`;
    return rules
      .map((rule) => {
        const match = haystack.match(rule.pattern)?.[0];
        if (!match) return null;
        return {
          type: rule.type,
          label: rule.label,
          severity: rule.severity,
          confidence: rule.confidence,
          evidence: match.slice(0, 80),
        };
      })
      .filter((item): item is ContactIntelligenceViolation => item !== null);
  }

  private detectFragmentedPhone(lines: string[], wordDigits: string, compactDigits: string): ContactIntelligenceViolation[] {
    const violations: ContactIntelligenceViolation[] = [];

    const lineDigitGroups = lines
      .map((line) => this.onlyDigits(this.wordsToDigits(this.normalize(line))))
      .filter((digits) => digits.length > 0);

    for (let index = 0; index < lineDigitGroups.length; index += 1) {
      const twoLines = lineDigitGroups.slice(index, index + 2).join('');
      const threeLines = lineDigitGroups.slice(index, index + 3).join('');

      if (this.looksLikeBrazilianMobile(twoLines)) {
        violations.push({
          type: 'phone_fragmented_2_lines',
          label: 'Telefone fragmentado em 2 linhas/mensagens',
          severity: 'CRITICAL',
          confidence: 96,
          evidence: lineDigitGroups.slice(index, index + 2).join(' / '),
        });
      }

      if (this.looksLikeBrazilianMobile(threeLines)) {
        violations.push({
          type: 'phone_fragmented_3_lines',
          label: 'Telefone fragmentado em 3 linhas/mensagens',
          severity: 'CRITICAL',
          confidence: 98,
          evidence: lineDigitGroups.slice(index, index + 3).join(' / '),
        });
      }
    }

    if (this.looksLikeBrazilianMobile(compactDigits)) {
      violations.push({
        type: 'phone_compacted',
        label: 'Telefone identificado apÃ³s compactar texto/voz',
        severity: 'CRITICAL',
        confidence: 97,
        evidence: this.maskDigits(compactDigits),
      });
    }

    const spokenNumberSequence = wordDigits.match(/(?:\b\d{1,2}\b[\s,.;:-]*){8,13}/)?.[0];
    if (spokenNumberSequence && this.looksLikeBrazilianMobile(this.onlyDigits(spokenNumberSequence))) {
      violations.push({
        type: 'phone_spelled_out',
        label: 'Telefone escrito/falado por extenso',
        severity: 'CRITICAL',
        confidence: 95,
        evidence: spokenNumberSequence.slice(0, 80),
      });
    }

    return violations;
  }

  private detectAddressFragment(lines: string[], normalized: string): ContactIntelligenceViolation[] {
    const violations: ContactIntelligenceViolation[] = [];
    const streetPattern = /\b(?:rua|r\.|avenida|av\.|travessa|tv\.|alameda|estrada|rodovia|bairro|condominio|condomÃ­nio|lote|quadra|casa|apto|apartamento)\b/i;
    const numberPattern = /\b(?:n(?:umero|Ãºmero)?\.?|nÂº|numero|casa|apto|apartamento)?\s*\d{1,5}\b/i;

    for (let index = 0; index < lines.length; index += 1) {
      const group = lines.slice(index, index + 3).join(' ');
      if (streetPattern.test(group) && numberPattern.test(group)) {
        violations.push({
          type: 'address_fragmented',
          label: 'EndereÃ§o fragmentado em 2 a 3 linhas/mensagens',
          severity: 'HIGH',
          confidence: 92,
          evidence: group.slice(0, 100),
        });
      }
    }

    if (streetPattern.test(normalized) && numberPattern.test(normalized)) {
      violations.push({
        type: 'address_direct',
        label: 'EndereÃ§o completo antes do pagamento protegido',
        severity: 'HIGH',
        confidence: 90,
        evidence: normalized.slice(0, 100),
      });
    }

    return violations;
  }

  private looksLikeBrazilianMobile(digits: string): boolean {
    const normalized = digits.replace(/^55/, '');
    if (normalized.length === 11) {
      const ddd = normalized.slice(0, 2);
      const ninthDigit = normalized[2];
      return /^[1-9][0-9]$/.test(ddd) && ninthDigit === '9';
    }
    if (normalized.length === 10) {
      return /^[1-9][0-9]/.test(normalized.slice(0, 2));
    }
    if (normalized.length === 9) {
      return normalized[0] === '9';
    }
    return false;
  }

  private wordsToDigits(content: string): string {
    return content
      .split(/(\s+|[,.!?;:()\-_/]+)/)
      .map((token) => this.numberWords[token] ?? token)
      .join('');
  }

  private onlyDigits(content: string): string {
    return content.replace(/\D+/g, '');
  }

  private normalize(content: string): string {
    return (content ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private unique(violations: ContactIntelligenceViolation[]): ContactIntelligenceViolation[] {
    const seen = new Set<string>();
    const result: ContactIntelligenceViolation[] = [];

    for (const violation of violations) {
      const key = `${violation.type}:${violation.evidence}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(violation);
    }

    return result.sort((a, b) => b.confidence - a.confidence);
  }

  private mask(content: string): string {
    return content
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email-bloqueado]')
      .replace(/(\d{2})(\d{3,5})(\d{4})/g, '$1*****$3')
      .slice(0, 1000);
  }

  private maskDigits(digits: string): string {
    if (digits.length <= 4) return '****';
    return `${digits.slice(0, 2)}${'*'.repeat(Math.max(4, digits.length - 6))}${digits.slice(-4)}`;
  }
}
