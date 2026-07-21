import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth';
import { editionsRouter } from './routes/editions';
import { checkpointsRouter } from './routes/checkpoints';
import { equipesRouter } from './routes/equipes';
import { validationsRouter } from './routes/validations';
import { messagesRouter } from './routes/messages';
import { stravaRouter } from './routes/strava';
import { itinerairesRouter } from './routes/itineraires';
import { configRouter } from './routes/config';
import { formatsRouter } from './routes/formats';
import { inscriptionsRouter } from './routes/inscriptions';
import { errorHandler } from './middleware/error';

export const app: Express = express();

const corsOrigins = [process.env.FRONTEND_URL, process.env.ADMIN_URL, 'http://localhost:3000', 'http://localhost:3002', 'https://soothing-cat-production-7144.up.railway.app'].filter(Boolean) as string[];
console.log('[CORS] Origines autorisées:', corsOrigins);

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

// Stripe webhook needs raw body — mount before global json parser
app.use('/equipes/stripe/webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes, réessayez dans 15 minutes' },
  }),
);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Routes
app.use('/auth', authRouter);
app.use('/editions', editionsRouter);
app.use('/editions', checkpointsRouter);  // /editions/:id/checkpoints
app.use('/editions', messagesRouter);     // /editions/:id/messages
app.use('/editions', itinerairesRouter);  // /editions/:id/itineraires
app.use('/editions', configRouter);       // /editions/:id/config
app.use('/editions', formatsRouter);      // /editions/:id/formats
app.use('/equipes', equipesRouter);
app.use('/inscriptions', inscriptionsRouter);
app.use('/validations', validationsRouter);
app.use('/strava', stravaRouter);

// Global error handler — must be last
app.use(errorHandler);
