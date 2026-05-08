import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // ✅ CORS liberado para Flutter/Web
    app.enableCors({
      origin: true,
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

    // ✅ Health check Railway
    app.getHttpAdapter().get('/', (_req, res) => {
      res.status(200).json({
        status: 'ok',
        message: 'BoraServico API ONLINE 🚀',
      });
    });

    // ✅ Health endpoint
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
  } catch (error) {
    console.error('❌ ERRO AO INICIAR API:', error);
    process.exit(1);
  }
}

bootstrap();