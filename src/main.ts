import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Libera acesso do Flutter/Web
  app.enableCors();

  // ✅ Porta Railway
  const port = process.env.PORT || 3000;

  // ✅ Escuta rede pública Railway
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 API ONLINE NA PORTA ${port}`);
}

bootstrap();