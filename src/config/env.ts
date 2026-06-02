const coreProductionRequiredEnvNames = [
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'DATABASE_URL',
  'CORS_ORIGIN',
  'PLATFORM_COMMISSION_RATE',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'RENDER_EXTERNAL_URL',
  'PAYMENT_SUCCESS_URL',
  'PAYMENT_FAILURE_URL',
  'GOOGLE_MAPS_API_KEY',
] as const;

const optionalProductionEnvNames = [
  'JWT_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
  'PAYMENT_PENDING_URL',
  'PUBLIC_API_URL',
  'AI_PROVIDER',
  'GEMINI_MODEL',
  'OPENAI_MODEL',
  'FCM_ENABLED',
  'REALTIME_ENABLED',
  'PROOF_STORAGE_PROVIDER',
  'PROOF_STORAGE_DIR',
  'STORAGE_CDN_BASE_URL',
  'UPLOAD_PUBLIC_URL',
  'STORAGE_SIGNED_URL_TTL_SECONDS',
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_BUCKET',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_ENDPOINT',
  'PAGARME_PLATFORM_RECIPIENT_ID',
  'PAGARME_DEFAULT_RECIPIENT_ID',
  'MERCADO_PAGO_MARKETPLACE_FEE_ENABLED',
] as const;

const paymentProviderGroups = [
  {
    name: 'mercadoPago',
    env: ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET'],
  },
  {
    name: 'pagarme',
    env: [
      'PAGARME_API_KEY',
      'PAGARME_WEBHOOK_SECRET',
      'PAGARME_RECIPIENT_ID',
    ],
  },
] as const;

const aiProviderGroups = [
  {
    name: 'gemini',
    env: ['GEMINI_API_KEY'],
  },
  {
    name: 'openai',
    env: ['OPENAI_API_KEY'],
  },
] as const;

const productionTrackedEnvNames = [
  ...coreProductionRequiredEnvNames,
  ...optionalProductionEnvNames,
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'MP_ACCESS_TOKEN',
  'PAGARME_API_KEY',
  'PAGARME_WEBHOOK_SECRET',
  'PAGARME_RECIPIENT_ID',
  'PAGARME_PLATFORM_RECIPIENT_ID',
  'PAGARME_DEFAULT_RECIPIENT_ID',
  'GOOGLE_MAPS_API_KEY',
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_BUCKET',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
] as const;

const legacyEnvAliases: Record<string, string[]> = {
  MERCADO_PAGO_ACCESS_TOKEN: ['MP_ACCESS_TOKEN'],
};

export type ProductionEnvName = string;

export interface ProductionEnvGroupStatus {
  name: string;
  ready: boolean;
  configured: string[];
  missing: string[];
  invalid: string[];
}

export interface ProductionEnvStatus {
  productionReady: boolean;
  missing: ProductionEnvName[];
  configured: ProductionEnvName[];
  invalid: ProductionEnvName[];
  optionalMissing: ProductionEnvName[];
  blockers: string[];
  legacyAliasesActive: string[];
  paymentProviders: ProductionEnvGroupStatus[];
  aiProviders: ProductionEnvGroupStatus[];
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
  const secret = readEnv('JWT_SECRET');

  if (
    isProductionRuntime() &&
    (!secret || isUnsafeEnvValue('JWT_SECRET', secret))
  ) {
    throw new Error('JWT_SECRET_MISSING_OR_UNSAFE');
  }

  return secret ?? 'boraservico-dev-only-change-this-secret';
}

export function getJwtExpiresIn() {
  return readEnv('JWT_EXPIRES_IN') ?? '1d';
}

export function getRefreshTokenSecret() {
  const secret = readEnv('REFRESH_TOKEN_SECRET');

  if (
    isProductionRuntime() &&
    (!secret || isUnsafeEnvValue('REFRESH_TOKEN_SECRET', secret))
  ) {
    throw new Error('REFRESH_TOKEN_SECRET_MISSING_OR_UNSAFE');
  }

  return secret ?? `${getJwtSecret()}-refresh-dev-only-change-this-secret`;
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
  return readEnv('PAGARME_RECIPIENT_ID') ?? readEnv('PAGARME_DEFAULT_RECIPIENT_ID');
}

export function getPagarmePlatformRecipientId() {
  return readEnv('PAGARME_PLATFORM_RECIPIENT_ID');
}

export function getPlatformCommissionRate() {
  const value = Number(readEnv('PLATFORM_COMMISSION_RATE') ?? 0.1);

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    return 0.1;
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

export function getStorageSignedUrlTtlSeconds() {
  const value = Number(readEnv('STORAGE_SIGNED_URL_TTL_SECONDS') ?? 900);

  return Number.isFinite(value) ? Math.min(Math.max(value, 60), 86400) : 900;
}

export function getCloudflareR2Config() {
  const accountId = readEnv('CLOUDFLARE_R2_ACCOUNT_ID');
  const endpoint =
    readEnv('CLOUDFLARE_R2_ENDPOINT') ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  return {
    accountId,
    endpoint,
    bucket: readEnv('CLOUDFLARE_R2_BUCKET'),
    accessKeyId: readEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
    secretAccessKey: readEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
  };
}

export function isCloudflareR2Ready() {
  const config = getCloudflareR2Config();

  return Boolean(
    config.endpoint &&
      config.bucket &&
      config.accessKeyId &&
      config.secretAccessKey,
  );
}

export function getGoogleMapsApiKey() {
  return readEnv('GOOGLE_MAPS_API_KEY');
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
  const tracked = Array.from(new Set(productionTrackedEnvNames));
  const missing = coreProductionRequiredEnvNames.filter((name) => !readEnv(name));
  const invalid = tracked.filter((name) => {
    const value = readEnv(name);
    return Boolean(value && isUnsafeEnvValue(name, value));
  });
  const configured = tracked.filter((name) => {
    const value = readEnv(name);
    return Boolean(value && !isUnsafeEnvValue(name, value));
  });
  const optionalMissing = optionalProductionEnvNames.filter(
    (name) => !readEnv(name),
  );
  const paymentProviders = paymentProviderGroups.map((group) =>
    getGroupStatus(group.name, Array.from(group.env)),
  );
  const aiProviders = aiProviderGroups.map((group) =>
    getGroupStatus(group.name, Array.from(group.env)),
  );
  const paymentProviderReady = paymentProviders.some((group) => group.ready);
  const aiProviderReady = aiProviders.some((group) => group.ready);
  const blockers = [
    ...missing.map((name) => `ENV_MISSING:${name}`),
    ...invalid.map((name) => `ENV_INVALID:${name}`),
    ...(paymentProviderReady ? [] : ['PAYMENT_PROVIDER_MISSING']),
    ...(aiProviderReady ? [] : ['AI_PROVIDER_MISSING']),
  ];
  const legacyAliasesActive = Object.entries(legacyEnvAliases)
    .filter(([canonicalName, aliases]) => {
      return !hasEnv(canonicalName) && aliases.some((alias) => hasEnv(alias));
    })
    .map(([canonicalName]) => canonicalName);

  return {
    productionReady: blockers.length === 0,
    missing,
    configured,
    invalid,
    optionalMissing,
    blockers,
    legacyAliasesActive,
    paymentProviders,
    aiProviders,
  };
}

export function getPublicEnvReadiness() {
  const production = getProductionEnvStatus();
  const mercadoPago = production.paymentProviders.find(
    (provider) => provider.name === 'mercadoPago',
  );
  const pagarme = production.paymentProviders.find(
    (provider) => provider.name === 'pagarme',
  );
  const gemini = production.aiProviders.find(
    (provider) => provider.name === 'gemini',
  );
  const openai = production.aiProviders.find(
    (provider) => provider.name === 'openai',
  );
  const storageCdnConfigured = isEnvConfiguredForProduction(
    'STORAGE_CDN_BASE_URL',
  );
  const proofStorageProvider = getProofStorageProvider();
  const r2Ready = isCloudflareR2Ready();
  const storageCloudReady =
    proofStorageProvider !== 'local-private' || storageCdnConfigured || r2Ready;

  return {
    productionReady: production.productionReady,
    requiredCount: coreProductionRequiredEnvNames.length,
    configuredCount: production.configured.length,
    missing: production.missing,
    invalid: production.invalid,
    optionalMissing: production.optionalMissing,
    blockers: production.blockers,
    legacyAliasesActive: production.legacyAliasesActive,
    corsOrigins: getConfiguredCorsOrigins(),
    localDevCorsAllowed: true,
    payments: {
      commissionRate: getPlatformCommissionRate(),
      platformSharePercent: Math.round(getPlatformCommissionRate() * 100),
      professionalSharePercent: Math.round(
        (1 - getPlatformCommissionRate()) * 100,
      ),
      mercadoPagoReady: Boolean(mercadoPago?.ready),
      mercadoPagoWebhookReady: isEnvConfiguredForProduction(
        'MERCADO_PAGO_WEBHOOK_SECRET',
      ),
      pagarmeReady: Boolean(pagarme?.ready),
      pagarmeWebhookReady: isEnvConfiguredForProduction('PAGARME_WEBHOOK_SECRET'),
      pagarmeRecipientReady: isEnvConfiguredForProduction('PAGARME_RECIPIENT_ID'),
      pagarmePlatformRecipientReady: isEnvConfiguredForProduction(
        'PAGARME_PLATFORM_RECIPIENT_ID',
      ),
      anyProviderReady: production.paymentProviders.some(
        (provider) => provider.ready,
      ),
      providers: production.paymentProviders,
    },
    ai: {
      providerPreference: getAiProviderPreference(),
      geminiReady: Boolean(gemini?.ready),
      openAiReady: Boolean(openai?.ready),
      fallbackReady: Boolean(gemini?.ready && openai?.ready),
      providers: production.aiProviders,
    },
    storage: {
      provider: proofStorageProvider,
      cdnConfigured: storageCdnConfigured,
      r2Ready,
      cloudReady: storageCloudReady,
    },
    maps: {
      googleMapsReady: isEnvConfiguredForProduction('GOOGLE_MAPS_API_KEY'),
    },
    render: {
      externalUrlConfigured: isEnvConfiguredForProduction('RENDER_EXTERNAL_URL'),
      publicApiUrl: getPublicApiUrl(),
    },
  };
}

function hasEnv(name: string) {
  return Boolean(cleanEnvValue(process.env[name]));
}

function isEnvConfiguredForProduction(name: string) {
  const value = readEnv(name);

  return Boolean(value && !isUnsafeEnvValue(name, value));
}

function getGroupStatus(
  name: string,
  envNames: string[],
): ProductionEnvGroupStatus {
  const missing = envNames.filter((envName) => !readEnv(envName));
  const invalid = envNames.filter((envName) => {
    const value = readEnv(envName);
    return Boolean(value && isUnsafeEnvValue(envName, value));
  });
  const configured = envNames.filter((envName) => {
    const value = readEnv(envName);
    return Boolean(value && !isUnsafeEnvValue(envName, value));
  });

  return {
    name,
    ready: missing.length === 0 && invalid.length === 0,
    configured,
    missing,
    invalid,
  };
}

function isProductionRuntime() {
  return (process.env.NODE_ENV ?? 'development') === 'production';
}

function isUnsafeEnvValue(name: string, value: string) {
  const normalizedName = name.toUpperCase();
  const normalizedValue = value.trim();
  const lowerValue = normalizedValue.toLowerCase();
  const placeholder =
    /change[_-]?me|replace[_-]?with|placeholder|todo|your[_-]|seu[_-]|sua[_-]|usuario:senha|example|dummy/.test(
      lowerValue,
    );

  if (placeholder) {
    return true;
  }

  if (normalizedName === 'DATABASE_URL') {
    return (
      !/^postgres(ql)?:\/\//i.test(normalizedValue) ||
      /localhost|127\.0\.0\.1|usuario:senha/i.test(normalizedValue)
    );
  }

  if (
    normalizedName.endsWith('_URL') ||
    normalizedName === 'CORS_ORIGIN' ||
    normalizedName === 'RENDER_EXTERNAL_URL'
  ) {
    return /localhost|127\.0\.0\.1|seu-app|seu-dominio/i.test(
      normalizedValue,
    );
  }

  if (normalizedName === 'FIREBASE_PRIVATE_KEY') {
    return (
      normalizedValue.length < 100 ||
      !normalizedValue.includes('BEGIN PRIVATE KEY')
    );
  }

  if (
    normalizedName.includes('SECRET') ||
    normalizedName.includes('TOKEN') ||
    normalizedName.includes('API_KEY') ||
    normalizedName.endsWith('_KEY')
  ) {
    return normalizedValue.length < 32 || /^test[-_]/i.test(normalizedValue);
  }

  return false;
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
