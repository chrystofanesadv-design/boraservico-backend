const productionRequiredEnvNames = [
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'DATABASE_URL',
  'CORS_ORIGIN',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
] as const;

const legacyEnvAliases: Record<string, string[]> = {
  MERCADO_PAGO_ACCESS_TOKEN: ['MP_ACCESS_TOKEN'],
};

export type ProductionEnvName = (typeof productionRequiredEnvNames)[number];

export interface ProductionEnvStatus {
  productionReady: boolean;
  missing: ProductionEnvName[];
  configured: ProductionEnvName[];
  legacyAliasesActive: string[];
}

export function normalizeLegacyEnv() {
  for (const [canonicalName, aliases] of Object.entries(legacyEnvAliases)) {
    if (hasEnv(canonicalName)) {
      continue;
    }

    const alias = aliases.find((name) => hasEnv(name));

    if (alias) {
      process.env[canonicalName] = process.env[alias];
    }
  }
}

export function readEnv(name: string): string | undefined {
  const directValue = cleanEnvValue(process.env[name]);

  if (directValue) {
    return directValue;
  }

  const aliases = legacyEnvAliases[name] ?? [];

  for (const alias of aliases) {
    const value = cleanEnvValue(process.env[alias]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

export function getJwtSecret() {
  return readEnv('JWT_SECRET') ?? 'boraservico-dev-only-change-this-secret';
}

export function getJwtExpiresIn() {
  return readEnv('JWT_EXPIRES_IN') ?? '1d';
}

export function getRefreshTokenSecret() {
  return (
    readEnv('REFRESH_TOKEN_SECRET') ??
    `${getJwtSecret()}-refresh-dev-only-change-this-secret`
  );
}

export function getRefreshTokenExpiresIn() {
  return readEnv('JWT_REFRESH_EXPIRES_IN') ?? '30d';
}

export function getMercadoPagoAccessToken() {
  return readEnv('MERCADO_PAGO_ACCESS_TOKEN');
}

export function getMercadoPagoWebhookSecret() {
  return readEnv('MERCADO_PAGO_WEBHOOK_SECRET');
}

export function getPagarmeApiKey() {
  return readEnv('PAGARME_API_KEY');
}

export function getPagarmeWebhookSecret() {
  return readEnv('PAGARME_WEBHOOK_SECRET');
}

export function getPagarmeRecipientId() {
  return readEnv('PAGARME_RECIPIENT_ID');
}

export function getPlatformCommissionRate() {
  const value = Number(readEnv('PLATFORM_COMMISSION_RATE') ?? 0.12);

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    return 0.12;
  }

  return value;
}

export function getPublicApiUrl() {
  return readEnv('PUBLIC_API_URL') ?? readEnv('RENDER_EXTERNAL_URL');
}

export function getAiProviderPreference() {
  const provider = readEnv('AI_PROVIDER')?.toLowerCase();

  if (provider === 'openai' || provider === 'gemini') {
    return provider;
  }

  return 'auto';
}

export function getGeminiModel() {
  return readEnv('GEMINI_MODEL') ?? 'gemini-1.5-flash';
}

export function getOpenAiModel() {
  return readEnv('OPENAI_MODEL') ?? 'gpt-4o-mini';
}

export function getProofStorageProvider() {
  return readEnv('PROOF_STORAGE_PROVIDER') ?? 'local-private';
}

export function getProofStorageDir() {
  return readEnv('PROOF_STORAGE_DIR');
}

export function getStorageCdnBaseUrl() {
  return readEnv('STORAGE_CDN_BASE_URL') ?? readEnv('UPLOAD_PUBLIC_URL');
}

export function getFirebasePrivateKey() {
  return readEnv('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
}

export function getConfiguredCorsOrigins() {
  const configured = splitEnvList(readEnv('CORS_ORIGIN'));
  const renderExternalUrl = readEnv('RENDER_EXTERNAL_URL');

  return uniqueList([
    ...configured,
    ...(renderExternalUrl ? [renderExternalUrl] : []),
  ]);
}

export function isAllowedCorsOrigin(origin?: string) {
  if (!origin) {
    return true;
  }

  if (isLocalDevOrigin(origin)) {
    return true;
  }

  const configuredOrigins = getConfiguredCorsOrigins();

  if (
    configuredOrigins.includes('*') &&
    (process.env.NODE_ENV ?? 'development') !== 'production'
  ) {
    return true;
  }

  return configuredOrigins.some((allowedOrigin) =>
    matchesConfiguredOrigin(origin, allowedOrigin),
  );
}

export function getProductionEnvStatus(): ProductionEnvStatus {
  const missing = productionRequiredEnvNames.filter((name) => !readEnv(name));
  const configured = productionRequiredEnvNames.filter((name) => readEnv(name));
  const legacyAliasesActive = Object.entries(legacyEnvAliases)
    .filter(([canonicalName, aliases]) => {
      return !hasEnv(canonicalName) && aliases.some((alias) => hasEnv(alias));
    })
    .map(([canonicalName]) => canonicalName);

  return {
    productionReady: missing.length === 0,
    missing,
    configured,
    legacyAliasesActive,
  };
}

export function getPublicEnvReadiness() {
  const production = getProductionEnvStatus();

  return {
    productionReady: production.productionReady,
    requiredCount: productionRequiredEnvNames.length,
    configuredCount: production.configured.length,
    missing: production.missing,
    legacyAliasesActive: production.legacyAliasesActive,
    corsOrigins: getConfiguredCorsOrigins(),
    localDevCorsAllowed: true,
    payments: {
      mercadoPagoReady: Boolean(getMercadoPagoAccessToken()),
      mercadoPagoWebhookReady: Boolean(getMercadoPagoWebhookSecret()),
      pagarmeReady: Boolean(getPagarmeApiKey()),
      pagarmeWebhookReady: Boolean(getPagarmeWebhookSecret()),
      anyProviderReady: Boolean(getMercadoPagoAccessToken() || getPagarmeApiKey()),
    },
    ai: {
      providerPreference: getAiProviderPreference(),
      geminiReady: Boolean(readEnv('GEMINI_API_KEY')),
      openAiReady: Boolean(readEnv('OPENAI_API_KEY')),
      fallbackReady: Boolean(
        readEnv('GEMINI_API_KEY') && readEnv('OPENAI_API_KEY'),
      ),
    },
    storage: {
      provider: getProofStorageProvider(),
      cdnConfigured: Boolean(getStorageCdnBaseUrl()),
    },
    render: {
      externalUrlConfigured: Boolean(readEnv('RENDER_EXTERNAL_URL')),
      publicApiUrl: getPublicApiUrl(),
    },
  };
}

function hasEnv(name: string) {
  return Boolean(cleanEnvValue(process.env[name]));
}

function cleanEnvValue(value?: string) {
  const text = value?.trim();

  if (!text || text === '""' || text === "''") {
    return undefined;
  }

  return text;
}

function splitEnvList(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values));
}

function isLocalDevOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

function matchesConfiguredOrigin(origin: string, allowedOrigin: string) {
  if (allowedOrigin === origin) {
    return true;
  }

  if (!allowedOrigin.includes('*')) {
    return false;
  }

  const escaped = allowedOrigin
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  return new RegExp(`^${escaped}$`).test(origin);
}
