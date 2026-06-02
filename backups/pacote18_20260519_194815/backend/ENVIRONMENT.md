# BoraServico Backend - variaveis de ambiente

## Obrigatorias para producao

- `JWT_SECRET`: segredo forte para assinatura dos tokens JWT.
- `REFRESH_TOKEN_SECRET`: segredo forte e diferente para refresh tokens.
- `DATABASE_URL`: URL PostgreSQL usada pelo Prisma em runtime.
- `CORS_ORIGIN`: origens web permitidas, separadas por virgula.
- `MERCADO_PAGO_ACCESS_TOKEN`: token principal do Mercado Pago.
- `MERCADO_PAGO_WEBHOOK_SECRET`: segredo usado para validar webhooks de pagamento.
- `FIREBASE_PROJECT_ID`: project id do Firebase.
- `FIREBASE_CLIENT_EMAIL`: client email do service account Firebase Admin.
- `FIREBASE_PRIVATE_KEY`: private key do service account, com `\n` escapado.
- `GEMINI_API_KEY`: chave Gemini para IA.
- `OPENAI_API_KEY`: chave OpenAI para IA.

## Opcionais recomendadas

- `JWT_EXPIRES_IN`: tempo de expiração do access token. Ex.: `15m`.
- `JWT_REFRESH_EXPIRES_IN`: tempo de expiração do refresh token. Ex.: `30d`.
- `AI_PROVIDER`: `auto`, `gemini` ou `openai`.
- `GEMINI_MODEL` e `OPENAI_MODEL`: modelos ativos por provider.
- `RENDER_EXTERNAL_URL`: URL pública do Render usada em CORS/webhooks.
- `PROOF_STORAGE_PROVIDER`: provider de evidências. Padrão: `local-private`.
- `PROOF_STORAGE_DIR`: diretório privado de upload quando local.
- `STORAGE_CDN_BASE_URL`: base CDN quando houver storage externo.

## Compatibilidade

O backend ainda aceita `MP_ACCESS_TOKEN` como alias legado quando
`MERCADO_PAGO_ACCESS_TOKEN` nao estiver definido. Novos ambientes devem usar
sempre `MERCADO_PAGO_ACCESS_TOKEN`.

## CORS

- Origens locais de desenvolvimento (`localhost`, `127.0.0.1` e `*.localhost`)
  sao permitidas.
- Em producao, configure `CORS_ORIGIN` com as URLs publicas reais do app/painel.
- Requests sem header `Origin`, comuns em mobile apps, health checks e server to
  server, continuam permitidos.

## Status de producao

`GET /health`, `GET /observability/health` e `GET /security` retornam
`productionReady: false` e a lista `env.missing` enquanto qualquer variavel
obrigatoria acima estiver ausente.
