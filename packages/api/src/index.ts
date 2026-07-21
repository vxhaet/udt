import 'dotenv/config';
import http from 'http';
import { app } from './app';
import { initWebSocket } from './ws';
import { connectRedis } from './config/redis';
import { startDevoilementJobs } from './jobs/devoilement';

const PORT = process.env.PORT ?? 3001;

async function bootstrap() {
  await connectRedis();

  const server = http.createServer(app);
  initWebSocket(server);
  startDevoilementJobs();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[API] Running on http://0.0.0.0:${PORT}`);
    console.log(`[API] Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });

  process.on('SIGTERM', () => {
    console.log('[API] SIGTERM received, shutting down gracefully');
    server.close(() => process.exit(0));
  });
}

bootstrap().catch((err) => {
  console.error('[API] Fatal error during bootstrap:', err);
  process.exit(1);
});
# cache bust Mar 21 jul 2026 19:29:00 CEST
