export type DirectContactFilterResult = {
  blocked: boolean;
  message: string;
  reasons: string[];
  cleanMessage: string;
  maskedText: string;
  riskScore: number;
};

export function repairLegacyEncoding(value: any): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value)
    .replace(/ServiÃ§o/g, 'Serviço')
    .replace(/ServiÃ§os/g, 'Serviços')
    .replace(/BoraServiÃ§o/g, 'BoraServiço')
    .replace(/ConfirmaÃ§Ãµes/g, 'Confirmações')
    .replace(/SolicitaÃ§Ãµes/g, 'Solicitações')
    .replace(/PrÃ³ximos/g, 'Próximos')
    .replace(/HistÃ³rico/g, 'Histórico')
    .replace(/EstatÃ­sticas/g, 'Estatísticas')
    .replace(/nÃ£o/g, 'não')
    .replace(/NÃ£o/g, 'Não')
    .replace(/vocÃª/g, 'você')
    .replace(/VocÃª/g, 'Você')
    .replace(/endereÃ§o/g, 'endereço')
    .replace(/informaÃ§Ãµes/g, 'informações')
    .replace(/operaÃ§Ã£o/g, 'operação')
    .replace(/OperaÃ§Ã£o/g, 'Operação')
    .replace(/NegociaÃ§Ãµes/g, 'Negociações')
    .replace(/orÃ§amento/g, 'orçamento')
    .replace(/OrÃ§amento/g, 'Orçamento')
    .replace(/missÃ£o/g, 'missão')
    .replace(/MissÃ£o/g, 'Missão')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã£/g, 'ã')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ã§/g, 'ç');
}

export function containsOperationalResidue(value: any): boolean {
  const text = normalize(String(value ?? ''));

  return [
    'mock',
    'placeholder',
    'teste visual',
    'debug only',
    'lorem ipsum',
    'fake order',
    'ordem fake',
  ].some((token) => text.includes(token));
}

export function filterDirectContact(value: any): DirectContactFilterResult {
  const text = repairLegacyEncoding(value) ?? '';
  const normalized = normalize(text);
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  const digits = text.replace(/\D/g, '');
  const reasons = new Set<string>();

  if (looksLikePhone(text, normalized, compact, digits)) {
    reasons.add('telefone');
  }

  if (looksLikeSpelledPhone(normalized)) {
    reasons.add('telefone por extenso');
  }

  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) {
    reasons.add('email');
  }

  if (/(https?:\/\/|www\.|\.com\b|\.br\b|bit\.ly|wa\.me|t\.me|linktr\.ee|instagram\.com|tiktok\.com|facebook\.com|fb\.com)/i.test(text)) {
    reasons.add('link externo');
  }

  if (containsAny(normalized, [
    'whatsapp',
    'whats',
    'zap',
    'wpp',
    'me chama no',
    'passa seu numero',
    'passa o numero',
    'me liga',
    'fora do app',
    'por fora',
    'me chama fora do app',
    'chama fora do app',
    'negociar fora',
    'direct',
    'dm',
    'inbox',
    'telegram',
  ])) {
    reasons.add('contato externo');
  }

  if (containsAny(normalized, [
    'pix direto',
    'pix por fora',
    'paga no pix',
    'pagar no pix',
    'chave pix',
    'meu pix',
    'deposito direto',
    'transferencia direta',
  ])) {
    reasons.add('pix direto');
  }

  if (/(^|\s)@[\w.]{3,}/i.test(text) ||
      containsAny(normalized, ['instagram', 'insta', 'tiktok', 'tik tok', 'arroba', 'facebook', 'face'])) {
    reasons.add('rede social');
  }

  if (looksLikeAddress(normalized, digits)) {
    reasons.add('endereço completo');
  }

  if (looksLikeQrOrCode(normalized, compact)) {
    reasons.add('qr code/código externo');
  }

  const reasonsList = Array.from(reasons);
  const blocked = reasonsList.length > 0;
  const cleanMessage = clean(text);

  return {
    blocked,
    message: blocked
      ? 'Por segurança, mantenha a negociação dentro do BoraServiço até o pagamento protegido.'
      : 'Mensagem permitida.',
    reasons: reasonsList,
    cleanMessage,
    maskedText: blocked ? maskSensitive(text) : text,
    riskScore: Math.min(100, reasonsList.length * 25),
  };
}

function looksLikePhone(original: string, normalized: string, compact: string, digits: string): boolean {
  if (digits.length >= 8 && digits.length <= 13) {
    return true;
  }

  if (/(?:\+?\s*55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[\s./-]?\d{4}/.test(original)) {
    return true;
  }

  if (/\(\s*\d{2}\s*\)/.test(original)) {
    return true;
  }

  if (/\b\d{2,3}\s*[/.-]\s*\d{3,4}\s*[/.-]\s*\d{3,4}\b/.test(original)) {
    return true;
  }

  if (/\b\d{2,3}\s+\d{3,4}\s+\d{3,4}\b/.test(original)) {
    return true;
  }

  if ((compact.includes('839') || compact.includes('849')) && compact.length >= 8) {
    return true;
  }

  return false;
}

function looksLikeSpelledPhone(normalized: string): boolean {
  const matches = normalized.match(/\b(zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove)\b/g) ?? [];

  return matches.length >= 7 ||
    normalized.includes('oito tres') ||
    normalized.includes('oito três') ||
    normalized.includes('nove nove');
}

function looksLikeAddress(normalized: string, digits: string): boolean {
  const hasStreetToken = containsAny(normalized, [
    'rua',
    'avenida',
    'av ',
    'travessa',
    'bairro',
    'numero',
    'nro',
    'casa',
    'apto',
    'apartamento',
    'bloco',
    'cep',
    'lote',
    'quadra',
    'condominio',
  ]);

  return (hasStreetToken && digits.length >= 2) ||
    /\b(rua|avenida|av|travessa|bairro|numero|nro|casa|cep)\b.{0,80}\d{2,}/i.test(normalized);
}

function looksLikeQrOrCode(normalized: string, compact: string): boolean {
  return normalized.includes('qr code') ||
    normalized.includes('qrcode') ||
    normalized.includes('codigo qr') ||
    normalized.includes('escaneia') ||
    normalized.includes('escaneie') ||
    normalized.includes('codigo de barras') ||
    compact.includes('qrcode');
}

function maskSensitive(text: string): string {
  return text
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email bloqueado]')
    .replace(/(?:\+?\s*55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[\s./-]?\d{4}/g, '[telefone bloqueado]')
    .replace(/\b\d{2,3}\s*[/.-]\s*\d{3,4}\s*[/.-]\s*\d{3,4}\b/g, '[telefone bloqueado]')
    .replace(/\b\d{2,3}\s+\d{3,4}\s+\d{3,4}\b/g, '[telefone bloqueado]')
    .replace(/(^|\s)@[\w.]{3,}/gi, ' [rede social bloqueada]');
}

function clean(text: string): string {
  const cleaned = maskSensitive(text)
    .replace(/\b(whatsapp|whats|zap|wpp|instagram|insta|tiktok|tik tok|facebook|direct|dm|telegram)\b/gi, 'app')
    .replace(/\b(chave\s*)?pix\b[^,.!?;]*/gi, '')
    .replace(/\b(fora do app|por fora|me chama fora do app)\b/gi, 'pelo app')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length >= 18 && !cleaned.includes('bloqueado')) {
    return cleaned;
  }

  return 'Tenho uma dúvida sobre o serviço e gostaria de combinar os detalhes pelo app.';
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function containsAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

export function validatePhotoSafety(payload: {
  filename?: string;
  mimetype?: string;
  mimeType?: string;
  metadata?: any;
  note?: string;
  rawText?: string;
  ocrText?: string;
}) {
  const filename = String(payload?.filename ?? '');
  const mimetype = String(payload?.mimetype ?? payload?.mimeType ?? '');
  const metadata = JSON.stringify(payload?.metadata ?? {});
  const rawText = String(payload?.rawText ?? payload?.ocrText ?? '');
  const note = String(payload?.note ?? '');
  const combined = `${filename} ${mimetype} ${metadata} ${rawText} ${note}`;

  const contact = filterDirectContact(combined);
  const detected = [...contact.reasons];

  const blocked = contact.blocked;
  const riskScore = Math.min(100, detected.length * 25);

  return {
    allowed: !blocked,
    blocked,
    reviewRequired: blocked || detected.length > 0,
    detected,
    reasons: detected,
    filename,
    mimetype,
    maskedText: contact.maskedText,
    riskScore,
    action: blocked ? 'block' : detected.length > 0 ? 'admin_review' : 'allow',
    status: blocked ? 'blocked_by_antifraud' : detected.length > 0 ? 'admin_review' : 'allowed',
  };
}

