import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { requireParticipant } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { uploadToR2 } from '../services/storage';

const ALLOWED_MIMES = ['image/jpeg', 'image/png'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new AppError(400, 'Format non supporté (jpeg/png uniquement)'));
  },
});

export const uploadRouter: Router = Router();

uploadRouter.post('/', requireParticipant(), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, 'Aucun fichier envoyé');

    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const key = `validations/${randomUUID()}.${ext}`;
    const url = await uploadToR2(key, req.file.buffer, req.file.mimetype);

    res.json({ url });
  } catch (err) {
    next(err);
  }
});
