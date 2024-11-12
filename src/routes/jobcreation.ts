import { Router } from 'express';
import pool from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authenticateToken';
import { Job, Requirement } from '../models/job';
import { Pool, ResultSetHeader } from 'mysql2/promise';
import { RowDataPacket } from 'mysql2/promise';

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
 *     summary: Create a new job posting with requirements
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               job:
 *                 $ref: '#/components/schemas/Job'
 *               requirements:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: ['qualification', 'experience', 'nice_to_have']
 *                     description:
 *                       type: string
 *                       example: "Strong programming skills"
 *                     marks:
 *                       type: integer
 *                       example: 10
 *                     years_required:
 *                       type: integer
 *                       example: 3
 *                     equivalent:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: "Master's degree in related field"
 *     responses:
 *       201:
 *         description: Job created successfully
 *       500:
 *         description: Internal Server Error
 */

router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { job, requirements } = req.body;
  const createdBy = req.user?.username;

  const client = await pool.getConnection();
  try {
    await client.beginTransaction();

    // Calculate total marks based on requirements
    const totalMarks = requirements.reduce((sum: number, req: any) => sum + req.marks, 0);

    // Insert job and specify ResultSetHeader type
    const [jobResult] = await client.query<ResultSetHeader>(
      'INSERT INTO jobs (title, description, startDate, endDate, status, createdBy, createdAt, updatedAt, total_marks) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)',
      [
        job.title,
        job.description,
        job.startDate,
        job.endDate,
        'Open',
        createdBy,
        totalMarks
      ]
    );

    const jobId = jobResult.insertId;

    // Insert requirements
    for (const req of requirements) {
      await client.query(
        'INSERT INTO job_requirements (job_id, requirement_type, description, marks, years_required, equivalent) VALUES (?, ?, ?, ?, ?, ?)',
        [
          jobId,
          req.type,
          req.description,
          req.marks,
          req.type === 'experience' ? req.years_required : null,
          req.equivalent ? JSON.stringify(req.equivalent) : null
        ]
      );
    }

    await client.commit();
    res.status(201).json({ message: 'Job created successfully' });
  } catch (error) {
    await client.rollback();
    console.error('Error creating job:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    client.release();
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
router.get('/', async (req: AuthenticatedRequest, res) => {
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
 *     summary: Update a job posting along with its requirements
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
 *             type: object
 *             properties:
 *               job:
 *                 $ref: '#/components/schemas/Job'
 *               requirements:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: ['qualification', 'experience', 'nice_to_have']
 *                     description:
 *                       type: string
 *                       example: "Strong programming skills"
 *                     marks:
 *                       type: integer
 *                       example: 10
 *                     years_required:
 *                       type: integer
 *                       example: 3
 *                     equivalent:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: "Master's degree in related field"
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
  const { job, requirements } = req.body;

  const client = await pool.getConnection();
  try {
    await client.beginTransaction();

    // Update the job details
    const [jobResult] = await client.query<ResultSetHeader>(
      'UPDATE jobs SET title = ?, description = ?, startDate = ?, endDate = ?, status = ?, updatedAt = NOW() WHERE id = ?',
      [job.title, job.description, job.startDate, job.endDate, job.status, id]
    );

    if (jobResult.affectedRows === 0) {
      await client.rollback();
      return res.status(404).json({ message: 'Job not found' });
    }

    // Delete old requirements and insert updated requirements
    await client.query('DELETE FROM job_requirements WHERE job_id = ?', [id]);

    for (const req of requirements) {
      await client.query(
        'INSERT INTO job_requirements (job_id, requirement_type, description, marks, years_required, equivalent) VALUES (?, ?, ?, ?, ?, ?)',
        [
          id,
          req.type,
          req.description,
          req.marks,
          req.type === 'experience' ? req.years_required : null,
          req.equivalent ? JSON.stringify(req.equivalent) : null
        ]
      );
    }

    await client.commit();
    res.status(200).json({ message: 'Job updated successfully' });
    return;
  } catch (error) {
    await client.rollback();
    console.error('Error updating job:', error);
    res.status(500).json({ message: 'Internal Server Error' });
    return;
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   get:
 *     summary: Retrieve a job posting by its ID along with its requirements
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
 *         description: Job retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 job:
 *                   $ref: '#/components/schemas/Job'
 *                 requirements:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       description:
 *                         type: string
 *                       marks:
 *                         type: integer
 *                       years_required:
 *                         type: integer
 *                       equivalent:
 *                         type: array
 *                         items:
 *                           type: string
 *       404:
 *         description: Job not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    // Fetch the job details with RowDataPacket typing and cast the result to Job[]
    const [jobResults] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM jobs WHERE id = ?',
      [id]
    );
    const jobs = jobResults as Job[];

    if (jobs.length === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const job = jobs[0];

    // Fetch the associated requirements with RowDataPacket typing and cast the result to Requirement[]
    const [requirementsResults] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM job_requirements WHERE job_id = ?',
      [id]
    );
    const requirements = requirementsResults as Requirement[];

    return res.status(200).json({
      job,
      requirements
    });
  } catch (error) {
    console.error('Error fetching job:', error);
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
