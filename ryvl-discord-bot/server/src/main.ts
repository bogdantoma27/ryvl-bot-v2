import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // One canonical browser origin is enough: Caddy redirects www and HTTP.
  // Local development still works when FRONTEND_URL explicitly names localhost.
  // CORS is a browser policy, not a replacement for endpoint authentication.
  const frontendOrigin = new URL(configService.frontendUrl).origin;
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => callback(null, !origin || origin === frontendOrigin),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Preserve the application's existing validation and internal listener.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = configService.port || 3000;
  await app.listen(port);
  logger.log(`RYVL backend listening on port ${port}; public website: ${frontendOrigin}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start NestJS server', err);
  process.exit(1);
});
