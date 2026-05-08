import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ CORS liberado para Flutter/Web
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // ✅ Porta dinâmica Railway
  const port = Number(process.env.PORT) || 3000;

  // ✅ Bind obrigatório Railway
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 API ONLINE NA PORTA ${port}`);
}

bootstrap().catch((err) => {
  console.error('❌ ERRO AO INICIAR API:', err);
  process.exit(1);
});