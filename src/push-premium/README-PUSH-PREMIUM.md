# BoraServico - Push Premium Completo

Modulo criado pelo Super Pacote 17.

Objetivo:
- Centralizar notificacoes premium de RFQ, propostas, contrapropostas, aceite, recusa, pagamento protegido, tracking, check-in, check-out, wallet, referral, disputa e antifraude.
- Preparar payloads para Firebase Cloud Messaging real.
- Manter fallback local enquanto FCM definitivo nao estiver configurado.
- Manter sons/haptic premium como metadados padronizados.

Rotas:
- GET /push-premium
- GET /push-premium/templates
- GET /push-premium/events
- POST /push-premium/event
- POST /push-premium/bulk
- POST /push-premium/referral/reminders

Observacao:
Este modulo nao substitui push-real existente. Ele complementa a camada premium e deve ser integrado gradualmente ao fluxo oficial.
