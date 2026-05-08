import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ CORS liberado para Flutter/Web
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // ✅ Validação global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // ✅ Rota raiz para teste Railway
  app.getHttpAdapter().get('/', (_req, res) => {
    res.status(200).send('BoraServico API ONLINE 🚀');
  });

  // ✅ Health check
  app.getHttpAdapter().get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      app: 'BoraServico Backend',
      timestamp: new Date().toISOString(),
    });
  });

  // ✅ Porta dinâmica Railway
  const port = Number(process.env.PORT) || 8080;

  // ✅ Bind obrigatório Railway
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 API ONLINE NA PORTA ${port}`);
}

bootstrap().catch((err) => {
  console.error('❌ ERRO AO INICIAR API:', err);
  process.exit(1);
});