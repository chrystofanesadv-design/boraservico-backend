import { Injectable } from '@nestjs/common';
import { FraudCheckDto } from './dto/fraud-check.dto';

type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type FraudAction = 'ALLOW' | 'WARN' | 'BLOCK' | 'SUSPEND_3_DAYS' | 'SUSPEND_10_DAYS' | 'BAN_REVIEW';

type FraudViolation = {
  type: string;
  label: string;
  severity: FraudSeverity;
  match: string;
};

type FraudAuditEntry = {
  id: string;
  createdAt: string;
  source: string;
  orderId?: string;
  professionalId?: string;
  clientId?: string;
  maskedContent: string;
  violations: FraudViolation[];
  attemptCount: number;
  phase: number;
  action: FraudAction;
  message: string;
};

@Injectable()
export class FraudEnterpriseService {
  private readonly auditLog: FraudAuditEntry[] = [];
  private readonly attemptsByProfessional = new Map<string, number>();

  private readonly rules: Array<{ type: string; label: string; severity: FraudSeverity; pattern: RegExp }> = [
    { type: 'whatsapp', label: 'WhatsApp ou telefone', severity: 'CRITICAL', pattern: /(?:whats(?:app)?|zap|wpp|chama no zap|me chama).{0,30}/i },
    { type: 'phone', label: 'Telefone', severity: 'CRITICAL', pattern: /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[\s.-]?\d{4}/ },
    { type: 'email', label: 'E-mail', severity: 'HIGH', pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
    { type: 'url', label: 'Link externo', severity: 'HIGH', pattern: /(?:https?:\/\/|www\.|\.com\b|\.com\.br\b|\.net\b|\.org\b|bit\.ly|linktr\.ee)/i },
    { type: 'instagram', label: 'Instagram', severity: 'HIGH', pattern: /(?:instagram|insta|ig\b|@)[a-z0-9._]{3,}/i },
    { type: 'tiktok', label: 'TikTok', severity: 'HIGH', pattern: /(?:tiktok|tik tok|@)[a-z0-9._]{3,}/i },
    { type: 'telegram', label: 'Telegram', severity: 'HIGH', pattern: /(?:telegram|t\.me\/|me chama no tele)/i },
    { type: 'address', label: 'Endereco completo antes do pagamento', severity: 'MEDIUM', pattern: /\b(?:rua|avenida|av\.|travessa|rodovia|br-|numero|nÂº|bairro|cep)\b.{0,80}\d{1,5}/i },
    { type: 'qr_code', label: 'QR Code ou codigo externo', severity: 'CRITICAL', pattern: /(?:qr\s?code|pix copia e cola|copia e cola|br\.gov\.bcb\.pix)/i },
    { type: 'contact_bypass', label: 'Tentativa de burlar contato pelo app', severity: 'HIGH', pattern: /(?:por fora|fora do app|sem taxa|direto comigo|fecha comigo direto|nao fala aqui)/i },
  ];

  check(dto: FraudCheckDto) {
    const combinedContent = [dto.content, dto.ocrText, dto.transcript]
      .filter(Boolean)
      .join('\n')
      .trim();

    const violations = this.detect(combinedContent);
    const professionalKey = dto.professionalId || 'unknown-professional';
    const previousAttempts = this.attemptsByProfessional.get(professionalKey) ?? 0;
    const nextAttempts = violations.length > 0 ? previousAttempts + 1 : previousAttempts;

    if (violations.length > 0) {
      this.attemptsByProfessional.set(professionalKey, nextAttempts);
    }

    const phase = this.getPhase(nextAttempts);
    const action = this.getAction(nextAttempts, violations);
    const message = this.getMessage(nextAttempts, action, violations);

    const entry: FraudAuditEntry = {
      id: `fraud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      source: dto.source,
      orderId: dto.orderId,
      professionalId: dto.professionalId,
      clientId: dto.clientId,
      maskedContent: this.maskSensitive(combinedContent),
      violations,
      attemptCount: nextAttempts,
      phase,
      action,
      message,
    };

    if (violations.length > 0) {
      this.auditLog.unshift(entry);
      if (this.auditLog.length > 500) this.auditLog.pop();
    }

    return {
      allowed: violations.length === 0,
      blocked: violations.length > 0,
      action,
      phase,
      attemptCount: nextAttempts,
      violations,
      message,
      auditId: violations.length > 0 ? entry.id : null,
    };
  }

  listAudit() {
    return {
      total: this.auditLog.length,
      items: this.auditLog.slice(0, 100),
    };
  }

  getRules() {
    return {
      protectedChannels: ['chat', 'rfq', 'negotiation', 'counter-offer', 'final-offer', 'voice-transcript', 'photo-ocr', 'upload'],
      blockedTypes: this.rules.map((rule) => ({ type: rule.type, label: rule.label, severity: rule.severity })),
      policy: [
        '1 a 2 tentativas: bloqueio da mensagem e aviso educativo.',
        '3 tentativas: suspensao sugerida de 3 dias.',
        '4 a 5 tentativas: bloqueio e alerta de reincidencia.',
        '6 tentativas: suspensao sugerida de 10 dias.',
        '7 ou mais tentativas: revisao para bloqueio definitivo.',
      ],
    };
  }

  private detect(content: string): FraudViolation[] {
    if (!content) return [];

    const found: FraudViolation[] = [];
    for (const rule of this.rules) {
      const match = content.match(rule.pattern)?.[0];
      if (match) {
        found.push({
          type: rule.type,
          label: rule.label,
          severity: rule.severity,
          match: this.maskSensitive(match),
        });
      }
    }

    const unique = new Map<string, FraudViolation>();
    for (const item of found) {
      if (!unique.has(item.type)) unique.set(item.type, item);
    }
    return Array.from(unique.values());
  }

  private getPhase(attemptCount: number) {
    if (attemptCount <= 0) return 0;
    if (attemptCount <= 3) return 1;
    if (attemptCount <= 6) return 2;
    return 3;
  }

  private getAction(attemptCount: number, violations: FraudViolation[]): FraudAction {
    if (violations.length === 0) return 'ALLOW';
    if (attemptCount >= 7) return 'BAN_REVIEW';
    if (attemptCount >= 6) return 'SUSPEND_10_DAYS';
    if (attemptCount >= 3) return 'SUSPEND_3_DAYS';
    return 'BLOCK';
  }

  private getMessage(attemptCount: number, action: FraudAction, violations: FraudViolation[]) {
    if (violations.length === 0) return 'Conteudo liberado.';

    const base = 'Por seguranca, nao compartilhe telefone, WhatsApp, e-mail, redes sociais, links, QR Code ou endereco antes do pagamento protegido.';
    if (action === 'SUSPEND_3_DAYS') return `${base} Esta e a tentativa ${attemptCount}. A conta pode ser suspensa por 3 dias.`;
    if (action === 'SUSPEND_10_DAYS') return `${base} Reincidencia detectada. A conta pode ser suspensa por 10 dias.`;
    if (action === 'BAN_REVIEW') return `${base} Reincidencia grave. O caso sera revisado para bloqueio definitivo.`;
    return `${base} Tentativa ${attemptCount}/3 antes da primeira suspensao.`;
  }

  private maskSensitive(value: string) {
    return value
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email-mascarado]')
      .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[\s.-]?\d{4}/g, '[telefone-mascarado]')
      .replace(/@[a-z0-9._]{3,}/gi, '@[usuario-mascarado]')
      .replace(/https?:\/\/\S+|www\.\S+/gi, '[link-mascarado]');
  }
}
