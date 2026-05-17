import fs from 'fs';
import path from 'path';
import multer from 'multer';

export const ITR_DOC_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'itr-docs');

fs.mkdirSync(ITR_DOC_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ITR_DOC_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});

function allowedMime(m: string): boolean {
  return /pdf|jpeg|jpg|png/i.test(m);
}

export const uploadItrDocument = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
    const ok =
      ['pdf', 'jpeg', 'jpg', 'png'].includes(ext) ||
      allowedMime(file.mimetype || '');
    if (ok) cb(null, true);
    else cb(new Error('Only PDF, JPG, and PNG files are allowed'));
  },
});
