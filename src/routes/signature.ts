import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../db';
import { OkPacket, RowDataPacket } from 'mysql2';

const router = Router();

// Ensure upload folder exists
const uploadDir = path.join(process.cwd(), 'uploads', 'signatures');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // safe unique file name: role-timestamp.ext
    const role = String(req.body.role || 'signature')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${role}-${Date.now()}${ext}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('Only PNG, JPG, JPEG, or WEBP images are allowed'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

type SignatureRow = RowDataPacket & {
  id: number;
  role: string;
  name: string;
  title: string | null;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number | null;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
};

/**
 * @swagger
 * tags:
 *   name: Signatures
 *   description: Signature upload and retrieval
 */

/**
 * @swagger
 * /api/v1/signatures/{role}:
 *   get:
 *     summary: Get active signature by role
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         example: Registrar
 *     responses:
 *       200:
 *         description: Active signature retrieved
 *       404:
 *         description: Signature not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/:role', async (req: Request, res: Response) => {
  try {
    const { role } = req.params;

    const [rows] = await pool.query<SignatureRow[]>(
      `SELECT * FROM signatures
       WHERE role = ? AND is_active = 1
       ORDER BY created_at DESC
       LIMIT 1`,
      [role]
    );

    if (!rows.length) return res.status(404).json({ message: 'Signature not found' });

    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error('Get signature error:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/signatures:
 *   post:
 *     summary: Upload a new signature image (and set it active for its role)
 *     tags: [Signatures]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [role, name, signature]
 *             properties:
 *               role:
 *                 type: string
 *                 example: Registrar
 *               name:
 *                 type: string
 *                 example: Dr. Jane Doe
 *               title:
 *                 type: string
 *                 example: Registrar
 *               signature:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Signature uploaded successfully
 *       400:
 *         description: Missing fields / invalid file
 *       500:
 *         description: Internal Server Error
 */
router.post('/', upload.single('signature'), async (req: Request, res: Response) => {
  try {
    const { role, name, title } = req.body;

    if (!role || !name) {
      // if file already uploaded but data missing, delete file
      if (req.file?.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'role and name are required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'signature file is required (field name: signature)' });
    }

    // Deactivate existing active signatures for this role
    await pool.query('UPDATE signatures SET is_active = 0 WHERE role = ?', [role]);

    const publicPath = `/uploads/signatures/${req.file.filename}`;

    const [result] = await pool.query<OkPacket>(
      `INSERT INTO signatures
       (role, name, title, file_name, file_path, mime_type, file_size, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        role,
        name,
        title ?? null,
        req.file.filename,
        publicPath,
        req.file.mimetype,
        req.file.size,
      ]
    );

    const [rows] = await pool.query<SignatureRow[]>(
      'SELECT * FROM signatures WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      message: 'Signature uploaded successfully',
      data: rows[0],
    });
  } catch (err: any) {
    // If multer throws or DB fails, remove uploaded file
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    console.error('Upload signature error:', err);
    return res.status(500).json({ message: err.message || 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/signatures/{id}:
 *   put:
 *     summary: Replace an existing signature image + metadata (keeps same record)
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *               name:
 *                 type: string
 *               title:
 *                 type: string
 *               signature:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Signature updated successfully
 *       404:
 *         description: Signature not found
 *       500:
 *         description: Internal Server Error
 */
router.put('/:id', upload.single('signature'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      if (req.file?.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Invalid id' });
    }

    const [existingRows] = await pool.query<SignatureRow[]>(
      'SELECT * FROM signatures WHERE id = ?',
      [id]
    );
    if (!existingRows.length) {
      if (req.file?.path) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Signature not found' });
    }

    const existing = existingRows[0];

    // If role is changing and this record is active, deactivate old role actives then keep active true for this record
    const newRole = req.body.role ?? existing.role;

    // Build updates
    const updates: string[] = [];
    const params: any[] = [];

    if (req.body.role) {
      updates.push('role = ?');
      params.push(req.body.role);
    }
    if (req.body.name) {
      updates.push('name = ?');
      params.push(req.body.name);
    }
    if (req.body.title !== undefined) {
      updates.push('title = ?');
      params.push(req.body.title || null);
    }

    // Replace file if new one uploaded
    if (req.file) {
      const newPublicPath = `/uploads/signatures/${req.file.filename}`;
      updates.push('file_name = ?', 'file_path = ?', 'mime_type = ?', 'file_size = ?');
      params.push(req.file.filename, newPublicPath, req.file.mimetype, req.file.size);
    }

    if (!updates.length) {
      if (req.file?.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Nothing to update' });
    }

    // If this signature is active, ensure only one active per role
    if (existing.is_active === 1) {
      await pool.query('UPDATE signatures SET is_active = 0 WHERE role = ? AND id <> ?', [newRole, id]);
      await pool.query('UPDATE signatures SET is_active = 1 WHERE id = ?', [id]);
    }

    await pool.query<OkPacket>(
      `UPDATE signatures SET ${updates.join(', ')} WHERE id = ?`,
      [...params, id]
    );

    // delete old file if replaced
    if (req.file) {
      const oldDiskPath = path.join(process.cwd(), existing.file_path.replace(/^\//, ''));
      if (fs.existsSync(oldDiskPath)) fs.unlinkSync(oldDiskPath);
    }

    const [rows] = await pool.query<SignatureRow[]>(
      'SELECT * FROM signatures WHERE id = ?',
      [id]
    );

    return res.status(200).json({ message: 'Signature updated successfully', data: rows[0] });
  } catch (err: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Update signature error:', err);
    return res.status(500).json({ message: err.message || 'Internal Server Error' });
  }
});

export default router;
