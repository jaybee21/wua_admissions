import { Router } from 'express';
import pool from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authenticateToken';
import { Job } from '../models/job';
import { ResultSetHeader } from 'mysql2';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Job:
 *       type: object
 *       required:
 *         - title
 *         - description
 *         - qualifications
 *         - experience
 *         - startDate
 *         - endDate
 *         - createdBy
 *       properties:
 *         title:
 *           type: string
 *           example: "Software Engineer"
 *         description:
 *           type: string
 *           example: "We are looking for a Software Engineer..."
 *         qualifications:
 *           type: string
 *           example: "Bachelor's degree in Computer Science"
 *         experience:
 *           type: string
 *           example: "3+ years of experience in software development"
 *         startDate:
 *           type: string
 *           format: date
 *           example: "2024-11-01"
 *         endDate:
 *           type: string
 *           format: date
 *           example: "2024-11-30"
 *         status:
 *           type: string
 *           example: "Open"
 *         createdBy:
 *           type: string
 *           example: "adminUser"
 */

/**
 * @swagger
 * /api/v1/jobs:
 *   post:
 *     summary: Create a new job posting
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Job'
 *     responses:
 *       201:
 *         description: Job created successfully
 *       500:
 *         description: Internal Server Error
 */
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const job: Job = req.body; 
  const createdBy = req.user?.username;
  
  try {
    await pool.query(
      'INSERT INTO jobs (title, description, qualifications, experience, startDate, endDate, status, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [job.title, job.description, job.qualifications, job.experience, job.startDate, job.endDate, 'Open', createdBy]
    );
    
    res.status(201).json({ message: 'Job created successfully' });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/jobs:
 *   get:
 *     summary: Get all job postings
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: A list of job postings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Job'
 *       500:
 *         description: Internal Server Error
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM jobs');
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   put:
 *     summary: Update a job posting
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The job ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Job'
 *     responses:
 *       200:
 *         description: Job updated successfully
 *       404:
 *         description: Job not found
 *       500:
 *         description: Internal Server Error
 */
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const job: Partial<Job> = req.body;

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE jobs SET title = ?, description = ?, qualifications = ?, experience = ?, startDate = ?, endDate = ?, status = ?, updatedAt = NOW() WHERE id = ?',
      [job.title, job.description, job.qualifications, job.experience, job.startDate, job.endDate, job.status, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }

    return res.status(200).json({ message: 'Job updated successfully' });
  } catch (error) {
    console.error('Error updating job:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   delete:
 *     summary: Delete a job posting
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The job ID
 *     responses:
 *       200:
 *         description: Job deleted successfully
 *       404:
 *         description: Job not found
 *       500:
 *         description: Internal Server Error
 */
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM jobs WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }

    return res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/jobs/search:
 *   get:
 *     summary: Search jobs by title or filter by status
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: The title of the job to search for
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Open, Closed, Pending]
 *         description: Filter jobs by their status
 *     responses:
 *       200:
 *         description: A list of job postings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Job'
 *       500:
 *         description: Internal Server Error
 */
router.get('/search', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { title, status } = req.query;

  let query = 'SELECT * FROM jobs WHERE 1=1';
  const queryParams: string[] = [];

  if (title) {
    query += ' AND title LIKE ?';
    queryParams.push(`%${title}%`);
  }

  if (status) {
    query += ' AND status = ?';
    queryParams.push(status as string);
  }

  try {
    const [rows] = await pool.query(query, queryParams);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error searching jobs:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});




export default router;
