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
  const isLocalDev = frontendOrigin.includes('localhost') || frontendOrigin.includes('127.0.0.1');
  const allowedOrigins = new Set([
    frontendOrigin,
    'https://ryvl.top',
    'https://www.ryvl.top',
    'https://bot.ryvl.top',
    ...(isLocalDev ? ['http://localhost:4200', 'http://127.0.0.1:4200'] : []),
  ]);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => callback(null, !origin || allowedOrigins.has(origin)),
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

  // Run module cleanup hooks (Discord logout, cron stop) when pm2 restarts the process.
  app.enableShutdownHooks();

  const port = configService.port || 3000;
  await app.listen(port);
  logger.log(`RYVL backend listening on port ${port}; public website: ${frontendOrigin}`);
}

// A stray rejected promise (for example a Discord or VPG call nobody awaited) must not
// take the bot offline: since Node 15 an unhandled rejection exits the process.
process.on('unhandledRejection', (reason) => {
  new Logger('Process').error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start NestJS server', err);
  process.exit(1);
});
