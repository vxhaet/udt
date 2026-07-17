import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@udt/db';
import { LoginSchema } from '@udt/shared';
import type { UserTokenPayload } from '@udt/shared';
import { AppError } from '../middleware/error';
import { requireUser } from '../middleware/auth';

export const authRouter = Router();

// POST /auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      throw new AppError(401, 'Email ou mot de passe incorrect');
    }

    const payload: UserTokenPayload = {
      type: 'user',
      userId: user.id,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/register — SUPER_ADMIN uniquement
authRouter.post('/register', requireUser('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const body = LoginSchema.extend({
      role: require('zod').z.enum(['SUPER_ADMIN', 'ORGANISATEUR', 'QG']).default('QG'),
    }).parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new AppError(409, 'Un compte avec cet email existe déjà');

    const password_hash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: { email: body.email, password_hash, role: body.role },
      select: { id: true, email: true, role: true, created_at: true },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
authRouter.get('/me', requireUser(), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, role: true, created_at: true },
    });
    if (!user) throw new AppError(404, 'Utilisateur introuvable');
    res.json(user);
  } catch (err) {
    next(err);
  }
});
