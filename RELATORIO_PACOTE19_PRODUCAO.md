# BoraServico - Relatorio Pacote 19 Producao

Data da auditoria: 2026-05-19

Backup criado antes das alteracoes: `C:\Users\chrys\boraservico_pacote19_backup_20260519_215426`.

APK final copiado para: `C:\Users\chrys\Downloads\boraservico-pacote19-producao-final.apk`.

## 1. APIs configuradas no codigo

- Auth/JWT: login, registro, access token, refresh token, refresh rotation e revoke existem.
- Mercado Pago: checkout por preference, webhook, validacao de assinatura, status remoto, idempotencia por evento e auditoria existem.
- Pagar.me: checkout por orders API, webhook, validacao de assinatura, status remoto, split com recipient e auditoria existem.
- Firebase/FCM: Flutter inicializa Firebase Core e Messaging; backend inicializa Firebase Admin por envs; token FCM e refresh de token sincronizam com `/push/token`.
- IA real: `ai-real` usa Gemini/OpenAI por env, com fallback entre providers, classify, price, fraud-risk, conversion e cancellation.
- Maps/tracking: Google Maps no Flutter, GPS via Geolocator, eventos de tracking REST e Socket.IO.
- Storage: upload privado de prova com JWT, limite de 10 MB, filtro de MIME, listagem/download autorizado.
- Realtime: Socket.IO com salas por ordem/tracking, eventos operacionais, chat, typing e read receipt.
- Observabilidade: health, readiness, env status, database, payments, realtime, firebase, storage, logs e errors.

## 2. APIs faltando ou sem credencial real local

- `MERCADO_PAGO_ACCESS_TOKEN` canonico ausente no `.env.production`; existe apenas alias legado curto (`MP_ACCESS_TOKEN`) e sem webhook secret real.
- `PAGARME_API_KEY`, `PAGARME_WEBHOOK_SECRET` e `PAGARME_RECIPIENT_ID` ausentes.
- `OPENAI_API_KEY` e `GEMINI_API_KEY` no `.env.production` parecem placeholders/curtas, nao validaveis como producao real.
- `FIREBASE_PRIVATE_KEY` no `.env.production` e curta demais para service account real.
- `MAPS_API_KEY` nao existe em `android/local.properties` nem no ambiente atual.
- `STORAGE_CDN_BASE_URL` e provider cloud de storage nao estao configurados.
- Payout/saque PIX real para banco/provedor externo ainda nao existe; ha ledger interno.

## 3. APIs parciais

- Mercado Pago: checkout e webhook estao reais; split depende de configuracao de marketplace fee/recebedores e validacao de conta; escrow/release sao ledger interno.
- Pagar.me: checkout e split estrutural existem; depende de recipient real e homologacao; payout nao integrado.
- Firebase: Flutter esta pronto; backend depende de service account real.
- IA: provider real existe; depende de chave real.
- Maps: app esta pronto; depende de `MAPS_API_KEY` com billing e restricoes.
- Storage: privado local funciona; cloud/CDN real pendente.
- Realtime: single-node funciona; producao multi-instancia precisa adapter Redis/socket.io.

## 4. Envs obrigatorias

Core: `NODE_ENV`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `DATABASE_URL`, `CORS_ORIGIN`, `RENDER_EXTERNAL_URL`, `PUBLIC_API_URL`, `PAYMENT_SUCCESS_URL`, `PAYMENT_FAILURE_URL`, `PLATFORM_COMMISSION_RATE`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

Pagamentos: ao menos um grupo completo: Mercado Pago (`MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`) ou Pagar.me (`PAGARME_API_KEY`, `PAGARME_WEBHOOK_SECRET`, `PAGARME_RECIPIENT_ID`).

IA: ao menos um de `GEMINI_API_KEY` ou `OPENAI_API_KEY`; ambos para fallback real.

Flutter release: `API_BASE_URL`, `SOCKET_BASE_URL`, `MAPS_API_KEY`.

## 5. Envs opcionais

`JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `PAYMENT_PENDING_URL`, `AI_PROVIDER`, `GEMINI_MODEL`, `OPENAI_MODEL`, `FCM_ENABLED`, `REALTIME_ENABLED`, `PROOF_STORAGE_PROVIDER`, `PROOF_STORAGE_DIR`, `STORAGE_CDN_BASE_URL`, `UPLOAD_PUBLIC_URL`.

## 6. O que funciona real

- Build backend NestJS.
- Prisma Client generation.
- Flutter analyze.
- APK release assinado.
- Auth/JWT/refresh no codigo.
- Upload privado local com JWT.
- Socket.IO operacional em single-node.
- Health/readiness com blockers.
- Catálogo/ordens/carteira/tracking/realtime/admin em estrutura backend.

## 7. O que e visual/mockado

- `src/ai/ai.service.ts` continua sendo IA heuristica legado/mock.
- `auth/visual_test_login.dart`, modo visual e dados `TESTE-VISUAL-*` sao apenas teste local.
- Algumas metricas do admin Flutter sao cards visuais estaticos.
- Modulos "Marketing IA" e "Videos IA" aparecem no admin visual, mas nao ha pipeline real de videos IA.
- Saque PIX e payout sao registro interno, nao liquidacao bancaria real.

## 8. O que depende de chave/API

Pagamentos externos, webhook real, IA real, FCM backend, Maps Android, storage/CDN, URLs de retorno de pagamento e producao Render dependem de envs reais.

## 9. Status financeiro

Ledger, escrow interno, release, refund, split calculado, auditoria e antifraude existem. Payout externo e liquidacao bancaria real ainda pendem. Mercado Pago/Pagar.me dependem de credenciais e webhooks reais.

## 10. Status IA

`ai-real.service.ts` esta pronto para Gemini/OpenAI, com fallback e JSON parsing. Sem chaves reais, endpoints protegidos retornarao provider missing/failed. Legacy `/ai` e mockado.

## 11. Status Maps

Plugin e tela existem. Manifest usa placeholder `${MAPS_API_KEY}` e nao expoe chave fixa. No ambiente atual, a chave nao esta configurada, entao o APK gerado depende dessa configuracao para mapa real.

## 12. Status Firebase

`google-services.json` existe para `com.boraservico.app`; Firebase Core/Messaging e background handler existem; token refresh sincroniza. Backend precisa de service account real.

## 13. Status realtime

Socket.IO tem salas, eventos e tracking. Foi ajustado para CORS real e handshake com JWT no Flutter. Falta adapter Redis para escala horizontal.

## 14. Status pagamentos

Checkout, webhook, idempotencia, auditoria, release/refund e status existem. Split e payout ainda precisam validacao real por provider. Webhook secret ausente impede producao real local.

## 15. Status storage

Provas sao privadas e protegidas por JWT. Readiness agora checa `storage/private/proofs`. Cloud/CDN real ainda falta.

## 16. Status producao

O codigo esta mais seguro para producao e falha readiness quando envs estao ausentes, invalidas ou placeholders. O ambiente local ainda nao esta `productionReady` por falta de envs reais.

## 17. Status deploy

Backend build passou. Prisma generate passou. `prisma migrate status` falhou porque o `.env` local aponta para PostgreSQL localhost indisponivel; nenhuma migration foi executada.

## 18. Status admin

Backend admin tem endpoints protegidos por JWT/AdminGuard. Flutter admin tem tela operacional e painel visual; algumas metricas ainda sao estaticas.

## 19. Status metricas

Observabilidade backend e real para health, DB, payments, Firebase, storage e logs. Cards Flutter de metricas administrativas ainda sao parcialmente visuais.

## 20. Status automacoes

Automacoes IA/operacionais estao em endpoints e fluxos parciais; nao ha scheduler/worker externo validado em producao.

## 21. Status videos IA

Aparece como modulo visual no admin. Nao ha endpoints, storage, fila, provider ou renderizacao real de video IA.

## 22. Riscos criticos

- Credenciais reais ausentes/invalidas no ambiente local.
- Storage local nao e suficiente para producao Render sem disco persistente/cloud.
- Payout externo real nao implementado.
- Refresh token revoke usa memoria; reinicio do backend limpa revogacoes.
- Maps key nao configurada no ambiente de build atual.
- Banco de producao nao foi validado por falta de `DATABASE_URL` real acessivel.
- Socket.IO precisa adapter para escala multi-instancia.

## 23. Proximos passos ideais

1. Configurar envs reais no Render, sem commitar segredos.
2. Configurar webhook Mercado Pago/Pagar.me apontando para `/payments-webhook/:provider`.
3. Configurar `MAPS_API_KEY` restrita ao package/SHA do keystore.
4. Trocar storage local por bucket privado + CDN ou URL assinada.
5. Implementar payout real com provider financeiro.
6. Persistir revoke/session store em banco ou Redis.
7. Rodar `npx prisma migrate status` e `npx prisma migrate deploy` apenas contra banco real, apos backup.
8. Criar AAB para Play Store.

## 24. Checklist final producao

- [x] Backup antes das alteracoes.
- [x] `npm run build`.
- [x] `npx prisma generate`.
- [x] `flutter analyze`.
- [x] `flutter build apk --release`.
- [x] APK copiado para Downloads.
- [x] JWT/Auth preservado.
- [x] Nenhuma migration destrutiva rodada.
- [x] Sem segredos novos hardcoded.
- [ ] Env real completa no Render.
- [ ] Banco PostgreSQL real validado.
- [ ] Webhooks reais testados.
- [ ] Storage cloud/CDN.
- [ ] Maps key real configurada no build.

## 25. Checklist Play Store

- [x] Package name: `com.boraservico.app`.
- [x] Keystore release configurado localmente.
- [x] APK release gerado.
- [x] Icone e splash existem.
- [x] Permissoes essenciais: internet, camera, imagens, localizacao, notificacoes.
- [ ] AAB (`flutter build appbundle --release`) para envio Play Store.
- [ ] Politica de privacidade revisada/publicada.
- [ ] Data safety preenchido.
- [ ] Screenshots, banner e descricao final.
- [ ] Maps/Firebase release SHA configurados no Google/Firebase.
