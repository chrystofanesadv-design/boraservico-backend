# BoraServico Backend - ambiente de producao

## Obrigatorias de core

- `NODE_ENV=production`
- `JWT_SECRET`: segredo forte, minimo 32 caracteres.
- `REFRESH_TOKEN_SECRET`: segredo forte e diferente do access token.
- `DATABASE_URL`: PostgreSQL real usado pelo Prisma.
- `CORS_ORIGIN`: URLs publicas permitidas, separadas por virgula.
- `RENDER_EXTERNAL_URL`: URL publica do backend no Render.
- `PUBLIC_API_URL`: URL publica usada em callbacks/webhooks.
- `PAYMENT_SUCCESS_URL` e `PAYMENT_FAILURE_URL`: retorno do checkout.
- `PLATFORM_COMMISSION_RATE`: comissao da plataforma. Padrao: `0.10`.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: service account do Firebase Admin.

## Provedores obrigatorios por grupo

Pagamentos: configure ao menos um grupo completo.

- Mercado Pago: `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET`.
- Pagar.me: `PAGARME_API_KEY`, `PAGARME_WEBHOOK_SECRET` e `PAGARME_RECIPIENT_ID`.

IA: configure ao menos um provider.

- Gemini: `GEMINI_API_KEY`.
- OpenAI: `OPENAI_API_KEY`.

Para fallback real, configure os dois providers de IA. Para redundancia financeira, configure Mercado Pago e Pagar.me.

## Opcionais recomendadas

- `JWT_EXPIRES_IN`: exemplo `15m`.
- `JWT_REFRESH_EXPIRES_IN`: exemplo `30d`.
- `PAYMENT_PENDING_URL`: retorno de pagamento pendente.
- `AI_PROVIDER`: `auto`, `gemini` ou `openai`.
- `GEMINI_MODEL` e `OPENAI_MODEL`.
- `FCM_ENABLED` e `REALTIME_ENABLED`.
- `PROOF_STORAGE_PROVIDER`, `PROOF_STORAGE_DIR`, `STORAGE_CDN_BASE_URL`, `UPLOAD_PUBLIC_URL`.

## Compatibilidade

O backend ainda aceita `MP_ACCESS_TOKEN` como alias legado quando `MERCADO_PAGO_ACCESS_TOKEN` nao estiver definido. Novos ambientes devem usar sempre `MERCADO_PAGO_ACCESS_TOKEN`.

## CORS e mobile

Origens locais (`localhost`, `127.0.0.1`, `*.localhost`) sao permitidas em desenvolvimento. Em producao, requests sem header `Origin` continuam permitidos para mobile apps, health checks e chamadas server-to-server.

## Status de producao

`GET /health`, `GET /observability/health`, `GET /health/ready` e `GET /security` retornam `productionReady`, `missing`, `invalid`, `blockers`, status por provider de pagamento, IA, Firebase, storage e Render. Valores placeholder, segredos curtos e URLs locais passam a ser tratados como invalidos no readiness.
