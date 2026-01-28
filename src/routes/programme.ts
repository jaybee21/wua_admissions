import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db';
import { User } from '../models/user';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { authenticateToken } from '../middleware/authenticateToken';
import { RowDataPacket, OkPacket } from 'mysql2';
import config from '../config';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Request, Response } from 'express';

dotenv.config();

const router = Router();

type ProgrammeRow = RowDataPacket & {
  id: number;
  code: string;
  department_code: string;
  name: string;
  email_address?: string | null;
  duration?: number | null;
  level?: number | null;
  study_type?: number | null;
  remarks?: string | null;
  supplementary_exams?: 0 | 1 | null;
  mature_entry?: 0 | 1 | null;
  special_entry?: 0 | 1 | null;
  year?: number | null;
  search_name?: string | null;
  attachment_year?: number | null;
  programme_group?: string | null;
  student_nos?: string | null;
  programme_fee?: string | null;   // mysql2 returns DECIMAL as string
  foreign_fee?: string | null;     // same here
  programme_duration?: string | null;
  prog_start_date?: string | null;
  prog_end_date?: string | null;
  id_programme_name?: string | null;
  down_payment?: string | null;
  downpay?: string | null;
  created_at: string;
};

/**
 * @swagger
 * tags:
 *   name: Programmes
 *   description: Department programmes endpoints
 */

/**
 * @swagger
 * /api/v1/programmes:
 *   get:
 *     summary: Get list of programmes (with optional filters + pagination)
 *     tags: [Programmes]
 *     parameters:
 *       - in: query
 *         name: department_code
 *         schema:
 *           type: string
 *         description: Filter by department code
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Filter by programme code
 *       - in: query
 *         name: level
 *         schema:
 *           type: integer
 *         description: Filter by level
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search by name or search_name (contains)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Page size
 *     responses:
 *       200:
 *         description: Programmes retrieved successfully
 *       500:
 *         description: Internal Server Error
 */
router.get('/programmes', async (req: Request, res: Response) => {
  try {
    const {
      department_code,
      code,
      level,
      year,
      q,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '50', 10), 1), 200);
    const offset = (pageNum - 1) * limitNum;

    const where: string[] = [];
    const params: any[] = [];

    if (department_code) {
      where.push('department_code = ?');
      params.push(department_code);
    }
    if (code) {
      where.push('code = ?');
      params.push(code);
    }
    if (level) {
      where.push('level = ?');
      params.push(Number(level));
    }
    if (year) {
      where.push('year = ?');
      params.push(Number(year));
    }
    if (q) {
      where.push('(name LIKE ? OR search_name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM department_programme ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await pool.query<ProgrammeRow[]>(
      `SELECT *
       FROM department_programme
       ${whereSql}
       ORDER BY name ASC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching programmes:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/programmes/{id}:
 *   get:
 *     summary: Get a single programme by id
 *     tags: [Programmes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Programme retrieved successfully
 *       404:
 *         description: Programme not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });

    const [rows] = await pool.query<ProgrammeRow[]>(
      'SELECT * FROM department_programme WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Programme not found' });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching programme by id:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/programmes/code/{code}:
 *   get:
 *     summary: Get a single programme by programme code
 *     tags: [Programmes]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Programme retrieved successfully
 *       404:
 *         description: Programme not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/code/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;

    const [rows] = await pool.query<ProgrammeRow[]>(
      'SELECT * FROM department_programme WHERE code = ?',
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Programme not found' });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching programme by code:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     ProgrammeUpdateRequest:
 *       type: object
 *       description: Fields are optional; only provided fields will be updated
 *       properties:
 *         code: { type: string }
 *         department_code: { type: string }
 *         name: { type: string }
 *         email_address: { type: string, nullable: true }
 *         duration: { type: integer, nullable: true }
 *         level: { type: integer, nullable: true }
 *         study_type: { type: integer, nullable: true }
 *         remarks: { type: string, nullable: true }
 *         supplementary_exams: { type: boolean }
 *         mature_entry: { type: boolean }
 *         special_entry: { type: boolean }
 *         year: { type: integer, nullable: true }
 *         search_name: { type: string, nullable: true }
 *         attachment_year: { type: integer, nullable: true }
 *         programme_group: { type: string, nullable: true }
 *         student_nos: { type: string, nullable: true }
 *         programme_fee: { type: number, format: float, nullable: true }
 *         programme_duration: { type: string, nullable: true }
 *         prog_start_date: { type: string, nullable: true }
 *         prog_end_date: { type: string, nullable: true }
 *         foreign_fee: { type: number, format: float, nullable: true }
 *         id_programme_name: { type: string, nullable: true }
 *         down_payment: { type: number, format: float, nullable: true }
 *         downpay: { type: number, format: float, nullable: true }
 */

/**
 * @swagger
 * /api/v1/programmes/{id}:
 *   put:
 *     summary: Update a programme by id (partial update supported)
 *     tags: [Programmes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProgrammeUpdateRequest'
 *     responses:
 *       200:
 *         description: Programme updated successfully
 *       400:
 *         description: No valid fields provided / invalid id
 *       404:
 *         description: Programme not found
 *       500:
 *         description: Internal Server Error
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });

    // You can whitelist fields so nobody updates unexpected columns
    const allowedFields = new Set([
      'code',
      'department_code',
      'name',
      'email_address',
      'duration',
      'level',
      'study_type',
      'remarks',
      'supplementary_exams',
      'mature_entry',
      'special_entry',
      'year',
      'search_name',
      'attachment_year',
      'programme_group',
      'student_nos',
      'programme_fee',
      'programme_duration',
      'prog_start_date',
      'prog_end_date',
      'foreign_fee',
      'id_programme_name',
      'down_payment',
      'downpay',
    ]);

    const body = req.body ?? {};
    const updates: string[] = [];
    const params: any[] = [];

    const normalizeBool = (v: any) => (v === true || v === 1 || v === '1' ? 1 : 0);

    for (const key of Object.keys(body)) {
      if (!allowedFields.has(key)) continue;

      let value = body[key];

      // Convert booleans to tinyint(1)
      if (['supplementary_exams', 'mature_entry', 'special_entry'].includes(key)) {
        value = normalizeBool(value);
      }

      updates.push(`${key} = ?`);
      params.push(value);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No valid fields provided to update' });
    }

    // Check exists
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM department_programme WHERE id = ?',
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Programme not found' });
    }

    const sql = `UPDATE department_programme SET ${updates.join(', ')} WHERE id = ?`;
    const [result] = await pool.query<OkPacket>(sql, [...params, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Programme not found' });
    }

    const [rows] = await pool.query<ProgrammeRow[]>(
      'SELECT * FROM department_programme WHERE id = ?',
      [id]
    );

    return res.status(200).json({
      message: 'Programme updated successfully',
      data: rows[0],
    });
  } catch (error: any) {
    // Optional: handle duplicate code nicely
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Duplicate entry (code must be unique)' });
    }
    console.error('Error updating programme:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/programmes/{id}:
 *   delete:
 *     summary: Delete a programme by id
 *     tags: [Programmes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Programme deleted successfully
 *       400:
 *         description: Invalid id
 *       404:
 *         description: Programme not found
 *       500:
 *         description: Internal Server Error
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });

    const [result] = await pool.query<OkPacket>(
      'DELETE FROM department_programme WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Programme not found' });
    }

    return res.status(200).json({ message: 'Programme deleted successfully' });
  } catch (error) {
    console.error('Error deleting programme:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     ProgrammeCreateRequest:
 *       type: object
 *       required:
 *         - code
 *         - department_code
 *         - name
 *       properties:
 *         code: { type: string, example: "KAH" }
 *         department_code: { type: string, example: "WSS" }
 *         name: { type: string, example: "BA in Something" }
 *         email_address: { type: string, nullable: true, example: "dept@wua.ac.zw" }
 *         duration: { type: integer, nullable: true, example: 4 }
 *         level: { type: integer, nullable: true, example: 6 }
 *         study_type: { type: integer, nullable: true, example: 1 }
 *         remarks: { type: string, nullable: true }
 *         supplementary_exams: { type: boolean, example: false }
 *         mature_entry: { type: boolean, example: false }
 *         special_entry: { type: boolean, example: false }
 *         year: { type: integer, nullable: true, example: 2026 }
 *         search_name: { type: string, nullable: true }
 *         attachment_year: { type: integer, nullable: true }
 *         programme_group: { type: string, nullable: true }
 *         student_nos: { type: string, nullable: true }
 *         programme_fee: { type: number, format: float, nullable: true, example: 1200.00 }
 *         programme_duration: { type: string, nullable: true, example: "4 Years" }
 *         prog_start_date: { type: string, nullable: true, example: "2026-02-01" }
 *         prog_end_date: { type: string, nullable: true, example: "2029-11-30" }
 *         foreign_fee: { type: number, format: float, nullable: true, example: 2500.00 }
 *         id_programme_name: { type: string, nullable: true }
 *         down_payment: { type: number, format: float, nullable: true, example: 300.00 }
 *         downpay: { type: number, format: float, nullable: true, example: 300.00 }
 */

/**
 * @swagger
 * /api/v1/programmes:
 *   post:
 *     summary: Create a new programme
 *     tags: [Programmes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProgrammeCreateRequest'
 *     responses:
 *       201:
 *         description: Programme created successfully
 *       400:
 *         description: Missing required fields / invalid payload
 *       409:
 *         description: Duplicate programme code
 *       500:
 *         description: Internal Server Error
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    // Required fields based on your table (NOT NULL)
    const code = body.code?.trim();
    const department_code = body.department_code?.trim();
    const name = body.name?.trim();

    if (!code || !department_code || !name) {
      return res.status(400).json({
        message: 'Missing required fields: code, department_code, name',
      });
    }

    // tinyint fields (default to 0 if not provided)
    const toTinyInt = (v: any) => (v === true || v === 1 || v === '1' ? 1 : 0);

    const payload = {
      code,
      department_code,
      name,
      email_address: body.email_address ?? null,
      duration: body.duration ?? null,
      level: body.level ?? null,
      study_type: body.study_type ?? null,
      remarks: body.remarks ?? null,
      supplementary_exams: body.supplementary_exams == null ? 0 : toTinyInt(body.supplementary_exams),
      mature_entry: body.mature_entry == null ? 0 : toTinyInt(body.mature_entry),
      special_entry: body.special_entry == null ? 0 : toTinyInt(body.special_entry),
      year: body.year ?? null,
      search_name: body.search_name ?? null,
      attachment_year: body.attachment_year ?? null,
      programme_group: body.programme_group ?? null,
      student_nos: body.student_nos ?? null,
      programme_fee: body.programme_fee ?? null,
      programme_duration: body.programme_duration ?? null,
      prog_start_date: body.prog_start_date ?? null,
      prog_end_date: body.prog_end_date ?? null,
      foreign_fee: body.foreign_fee ?? null,
      id_programme_name: body.id_programme_name ?? null,
      down_payment: body.down_payment ?? null,
      downpay: body.downpay ?? null,
    };

    // Insert using SET ? (mysql2 will map object keys to columns)
    const [result] = await pool.query<OkPacket>(
      'INSERT INTO department_programme SET ?',
      [payload]
    );

    // Return the created row
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM department_programme WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      message: 'Programme created successfully',
      data: rows[0],
    });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Programme code already exists' });
    }
    console.error('Error creating programme:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export default router;