import { Router } from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import pool from '../db'; 
import { authenticateToken, AuthenticatedRequest } from '../middleware/authenticateToken'; // Assuming you have a middleware for authentication
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import config from '../config';
import dotenv from 'dotenv';
import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2/promise';
import path from 'path';

const router = Router();
dotenv.config();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Save files in the 'uploads' directory
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

/**
 * @swagger
 * /api/v1/jobapplication/{jobId}/apply:
 *   post:
 *     summary: Apply for a job by submitting required documents and information.
 *     tags:
 *       - Job Applications
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the job to apply for.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 description: Full name of the applicant.
 *               firstName:
 *                 type: string
 *                 description: First name of the applicant.
 *               lastName:
 *                 type: string
 *                 description: Last name of the applicant.
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the applicant.
 *               phoneNumber:
 *                 type: string
 *                 description: Primary phone number.
 *               secondPhoneNumber:
 *                 type: string
 *                 description: Secondary phone number.
 *               nationalId:
 *                 type: string
 *                 description: National ID of the applicant.
 *                 required: true
 *               experience:
 *                 type: string
 *                 description: Description of experience.
 *               highestLevelOfStudy:
 *                 type: string
 *                 description: Applicant's highest level of education.
 *               professionalCertificates:
 *                 type: string
 *                 description: Details of professional certificates.
 *               education:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     qualification:
 *                       type: string
 *                       description: Qualification name.
 *                     courseName:
 *                       type: string
 *                       description: Name of the course.
 *                     startDate:
 *                       type: string
 *                       format: date
 *                       description: Start date of the course.
 *                     endDate:
 *                       type: string
 *                       format: date
 *                       description: End date of the course.
 *                     marks:
 *                       type: number
 *                       format: float
 *                       description: Marks obtained in the course.
 *               experiences:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     companyName:
 *                       type: string
 *                     role:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     description:
 *                       type: string
 *               resume:
 *                 type: string
 *                 format: binary
 *                 description: Resume file.
 *               applicationLetter:
 *                 type: string
 *                 format: binary
 *                 description: Application letter file.
 *               certificates:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Certificate files.
 *               professionalCertificatesUploads:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Professional certificate files.
 *     responses:
 *       201:
 *         description: Application submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Application submitted successfully.
 *       400:
 *         description: Invalid request data.
 *       404:
 *         description: Job not found.
 *       500:
 *         description: Internal Server Error.
 */


interface MulterRequest extends Request {
  files?: {
    [fieldname: string]: Express.Multer.File[];
  };
}

// Define the route for job application
router.post(
  '/:jobId/apply',
  upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'applicationLetter', maxCount: 1 },
    { name: 'certificates', maxCount: 10 },
    { name: 'professionalCertificatesUploads', maxCount: 10 },
  ]),
  async (req, res) => {
    const { jobId } = req.params;
    console.log('Request Body:', req.body);
    console.log('Uploaded Files:', (req as MulterRequest).files);
    const {
      fullName,
      firstName,
      lastName,
      email,
      phoneNumber,
      secondPhoneNumber,
      nationalId,
      experience,
      highestLevelOfStudy,
      professionalCertificates,
      education,
      experiences,
      marks,
    } = req.body;

    // Extract files from `req.files`
    const resumeFile = (req as MulterRequest).files?.['resume']?.[0]?.path || null;
    const applicationLetterFile = (req as MulterRequest).files?.['applicationLetter']?.[0]?.path || null;
    const certificateFiles = (req as MulterRequest).files?.['certificates']?.map((file) => file.path) || [];
    const professionalCertificateFiles = (req as MulterRequest).files?.['professionalCertificatesUploads']?.map((file) => file.path) || [];

    try {
      // Fetch job title using jobId
      const [rows]: any = await pool.query('SELECT title FROM jobs WHERE id = ?', [jobId]);
      const job = rows as { title: string }[];

      if (job.length === 0) {
        return res.status(404).json({ message: 'Job not found' });
      }
      const jobTitle = job[0].title;

      // Insert the application into the database
      const [result]: any = await pool.query(
        'INSERT INTO job_applications (job_id, full_name, first_name, last_name, email, phone_number, second_phone_number,national_id, resume_url, application_letter_url, certificates_urls, professional_certificates_urls, professional_certificates,marks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?,?, NOW(), NOW())',
        [
          jobId,
          fullName,
          firstName,
          lastName,
          email,
          phoneNumber,
          secondPhoneNumber,
          nationalId,
          resumeFile,
          applicationLetterFile,
          JSON.stringify(certificateFiles),
          JSON.stringify(professionalCertificateFiles),
          professionalCertificates,
          marks || 0,
        ]
      );

      const applicationId = result.insertId;

      // Insert experience details
      if (experiences && Array.isArray(experiences)) {
        for (const exp of experiences) {
          await pool.query(
            'INSERT INTO job_experiences (job_application_id, company_name, role, start_date, end_date, description) VALUES (?, ?, ?, ?, ?, ?)',
            [applicationId, exp.companyName, exp.role, exp.startDate, exp.endDate, exp.description]
          );
        }
      }

      // Insert education details
      if (education && Array.isArray(education)) {
        for (const edu of education) {
          await pool.query(
            'INSERT INTO job_education (job_application_id, qualification, course_name, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
            [applicationId, edu.qualification, edu.courseName, edu.startDate, edu.endDate]
          );
        }
      }

      // Send email confirmation
      await sendApplicationConfirmationEmail(email, fullName, jobTitle);

      // Send a success response
      return res.status(201).json({ message: 'Application submitted successfully' });
    } catch (error) {
      console.error('Error submitting application:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }
);


async function sendApplicationConfirmationEmail(email: string, fullName: string, jobTitle: string) {
    console.log('SMTP Configuration:', {
        user: config.email.user,
        pass: config.email.pass,
        email: email,
    });
    const transporter = nodemailer.createTransport({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      auth: {
        user: config.email.user, 
        pass: config.email.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  
    const mailOptions = {
      from: config.email.user,
      to: email,
      subject: 'Job Application Confirmation',
      html: `<p>Dear ${fullName},</p>
             <p>Thank you for applying for the position of <strong>${jobTitle}</strong>. We have received your application and will review it shortly.</p>
             <p>Best regards,</p>
             <p>Womens University in Africa</p>`,
    };
  
    try {
      await transporter.sendMail(mailOptions);
      console.log('Confirmation email sent to', email);
    } catch (error) {
      console.error('Error sending confirmation email:', error);
    }
  }

 /**
 * @swagger
 * /api/v1/jobapplication/status:
 *   patch:
 *     summary: Update the status of multiple job applications.
 *     tags:
 *       - Job Applications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               applicationIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of application IDs to update.
 *               status:
 *                 type: string
 *                 description: The new status for the applications.
 *                 enum: 
 *                   - Pending
 *                   - In Review
 *                   - Shortlisted
 *                   - Interview Scheduled
 *                   - Interviewed
 *                   - Offered
 *                   - Offer Accepted
 *                   - Offer Declined
 *                   - Rejected
 *                   - Withdrawn
 *                   - On Hold
 *                   - Hired
 *     responses:
 *       200:
 *         description: Application statuses updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Application statuses updated successfully to Rejected.
 *       400:
 *         description: Invalid status or invalid input.
 *       404:
 *         description: One or more applications not found.
 *       500:
 *         description: Internal Server Error.
 */
router.patch('/status', authenticateToken, async (req: Request, res: Response) => {
    const { applicationIds, status } = req.body;

    // Validate the status
    const validStatuses = [
        'Pending', 'In Review', 'Shortlisted', 'Interview Scheduled', 'Interviewed',
        'Offered', 'Offer Accepted', 'Offer Declined', 'Rejected', 'Withdrawn', 'On Hold', 'Hired'
    ];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }

    // Ensure applicationIds is an array
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
        return res.status(400).json({ message: 'Application IDs must be a non-empty array' });
    }

    try {
        // Update the application status in the database
        const [result]: any = await pool.query(
            `UPDATE job_applications SET application_status = ?, updated_at = NOW() 
             WHERE id IN (?)`,
            [status, applicationIds]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'No applications found to update' });
        }

        // Retrieve the details of the affected applications for sending emails
        const [rows]: any = await pool.query(
            `SELECT job_applications.email, job_applications.full_name, jobs.title
             FROM job_applications
             JOIN jobs ON job_applications.job_id = jobs.id
             WHERE job_applications.id IN (?)`,
            [applicationIds]
        );

        // Send an email for each rejected application if status is "Rejected"
        if (status === 'Rejected') {
            for (const application of rows) {
                await sendRejectionEmail(application.email, application.full_name, application.title);
            }
        }

        return res.status(200).json({ message: `Application statuses updated successfully to ${status}` });
    } catch (error) {
        console.error('Error updating application statuses:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});
// Function to send rejection email
async function sendRejectionEmail(email: string, fullName: string, jobTitle: string): Promise<void> {
    console.log('SMTP Configuration:', {
        user: config.email.user,
        pass: config.email.pass,
        email: email,
    });

    const transporter = nodemailer.createTransport({
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false,
        auth: {
            user: config.email.user,
            pass: config.email.pass,
        },
        tls: {
            rejectUnauthorized: false,
        },
    });

    const mailOptions = {
        from: config.email.user,
        to: email,
        subject: 'Job Application Status - Rejected',
        html: `<p>Dear ${fullName},</p>
               <p>We regret to inform you that after careful consideration, we have decided not to move forward with your application for the position of <strong>${jobTitle}</strong>.</p>
               <p>We appreciate your interest in the position and wish you the best in your job search.</p>
               <p>Best regards,</p>
               <p>Womens University in Africa</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Rejection email sent to', email);
    } catch (error) {
        console.error('Error sending rejection email:', error);
    }
}

/**
 * @swagger
 * /api/v1/jobapplication:
 *   get:
 *     summary: Filter job applications by status, job title, application date, full name, email, and marks.
 *     tags:
 *       - Job Applications
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by application status.
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: Filter by job title.
 *       - in: query
 *         name: applicationDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by application submission date (YYYY-MM-DD).
 *       - in: query
 *         name: fullName
 *         schema:
 *           type: string
 *         description: Filter by applicant's full name.
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         description: Filter by applicant's email.
 *       - in: query
 *         name: marks
 *         schema:
 *           type: string
 *         description: Filter by marks (supports range queries, e.g., '>70').
 *     responses:
 *       200:
 *         description: Filtered list of job applications.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   jobId:
 *                     type: integer
 *                   fullName:
 *                     type: string
 *                   email:
 *                     type: string
 *                   applicationStatus:
 *                     type: string
 *                   applicationDate:
 *                     type: string
 *                     format: date-time
 *                   jobTitle:
 *                     type: string
 *       500:
 *         description: Internal Server Error.
 */

router.get('/', authenticateToken, async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const title = req.query.title as string | undefined;
  const applicationDate = req.query.applicationDate as string | undefined;
  const fullName = req.query.fullName as string | undefined;
  const email = req.query.email as string | undefined;
  const marks = req.query.marks as string | undefined; 

  let query = `
    SELECT 
      ja.id AS applicationId,
      ja.job_id AS jobId,
      ja.full_name AS fullName,
      ja.first_name AS firstName,
      ja.last_name AS lastName,
      ja.email,
      ja.phone_number AS phoneNumber,
      ja.second_phone_number AS secondPhoneNumber,
      ja.resume_url AS resumeUrl,
      ja.application_letter_url AS applicationLetterUrl,
      ja.certificates_urls AS certificatesUrls,
      ja.professional_certificates_urls AS professionalCertificatesUrls,
      ja.application_status AS applicationStatus,
      ja.created_at AS applicationDate,
      ja.marks AS marks,
      j.title AS jobTitle
    FROM job_applications ja
    INNER JOIN jobs j ON ja.job_id = j.id
  `;

  const queryParams: (string | number)[] = [];
  const conditions: string[] = [];

  if (status) {
      conditions.push('ja.application_status = ?');
      queryParams.push(status);
  }

  if (title) {
      conditions.push('j.title = ?');
      queryParams.push(title);
  }

  if (applicationDate) {
      conditions.push('DATE(ja.created_at) = ?');
      queryParams.push(applicationDate);
  }

  if (fullName) {
      conditions.push('ja.full_name = ?');
      queryParams.push(fullName);
  }

  if (email) {
      conditions.push('ja.email = ?');
      queryParams.push(email);
  }

  if (marks) {
      const operator = marks.match(/^[<>]=?|=/) ? marks.match(/^[<>]=?|=/)![0] : '=';
      const value = marks.replace(/^[<>]=?|=/, '').trim();
      conditions.push(`CAST(ja.marks AS UNSIGNED) ${operator} ?`);
      queryParams.push(value);
  }

  if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
  }

  try {
      const [rows] = await pool.query(query, queryParams) as RowDataPacket[];

      const applications = rows.map((row: RowDataPacket) => ({
          applicationId: row.applicationId,
          jobId: row.jobId,
          jobTitle: row.jobTitle,
          fullName: row.fullName,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phoneNumber: row.phoneNumber,
          secondPhoneNumber: row.secondPhoneNumber,
          resumeUrl: row.resumeUrl,
          applicationLetterUrl: row.applicationLetterUrl,
          certificatesUrls: JSON.parse(row.certificatesUrls || '[]'),
          professionalCertificatesUrls: JSON.parse(row.professionalCertificatesUrls || '[]'),
          applicationStatus: row.applicationStatus,
          applicationDate: row.applicationDate,
          marks: row.marks,
      }));

      return res.status(200).json(applications);
  } catch (error) {
      console.error('Error retrieving applications:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
  }
});



 /**
 * @swagger
 * /api/v1/jobapplication/download/{type}/{filename}:
 *   get:
 *     summary: Download a document related to a job application.
 *     tags:
 *       - Job Applications
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [resume, applicationLetter, certificates, professionalCertificates]
 *         description: The type of document to download.
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the file to download.
 *     responses:
 *       200:
 *         description: File download successful.
 *       400:
 *         description: Invalid document type.
 *       404:
 *         description: File not found.
 *       500:
 *         description: Internal Server Error.
 */
 router.get('/download/:type/:filename', authenticateToken, (req: Request, res: Response) => {
    const { type, filename } = req.params;

    // Set up the allowed file types (resume, applicationLetter, certificates, professionalCertificates)
    const allowedTypes = ['resume', 'applicationLetter', 'certificates', 'professionalCertificates'];
    if (!allowedTypes.includes(type)) {
        return res.status(400).json({ message: 'Invalid document type' });
    }

    // Define the root directory for uploads
    const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');

    // Construct the full path
    const filePath = path.join(uploadsRoot, filename);

    // Check if the file exists and send it
    return res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error sending file:', err);
        }
    });
});
export default router;
