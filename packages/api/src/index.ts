import 'dotenv/config';
import http from 'http';
import { app } from './app';
import { initWebSocket } from './ws';
import { connectRedis } from './config/redis';
import { startDevoilementJobs } from './jobs/devoilement';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  await connectRedis();

  const server = http.createServer(app);
  initWebSocket(server);
  startDevoilementJobs();

  server.listen(PORT, HOST, () => {
    console.log(`[API] Running on http://${HOST}:${PORT}`);
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
