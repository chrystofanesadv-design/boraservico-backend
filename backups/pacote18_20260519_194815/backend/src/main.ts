import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import {
  getPublicEnvReadiness,
  isAllowedCorsOrigin,
  normalizeLegacyEnv,
} from './config/env';

async function bootstrap() {
  try {
    normalizeLegacyEnv();

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      rawBody: true,
    });

    app.use(helmet());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );

    app.enableCors({
      origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS origin not allowed: ${origin}`), false);
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders:
        'Content-Type, Authorization, X-Signature, X-Request-Id, X-Hub-Signature, X-Hub-Signature-256, X-PagarMe-Signature',
      credentials: true,
    });

    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
    });

    const port = process.env.PORT || 3000;

    await app.listen(port);

    const envStatus = getPublicEnvReadiness();

    console.log(`API online na porta ${port}`);
    console.log(
      `Production env ready: ${envStatus.productionReady ? 'yes' : 'no'} (${envStatus.configuredCount}/${envStatus.requiredCount})`,
    );
  } catch (error) {
    console.error('Erro ao iniciar API:', error);
    process.exit(1);
  }
}

bootstrap();
