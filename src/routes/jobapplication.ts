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
 *                     courseName:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
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
  authenticateToken,
  upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'applicationLetter', maxCount: 1 },
    { name: 'certificates', maxCount: 10 },
    { name: 'professionalCertificatesUploads', maxCount: 10 },
  ]),
  async (req, res) => {
    const { jobId } = req.params;
    const {
      fullName,
      firstName,
      lastName,
      email,
      phoneNumber,
      secondPhoneNumber,
      experience,
      highestLevelOfStudy,
      professionalCertificates,
      education,
      experiences,
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
        'INSERT INTO job_applications (job_id, full_name, first_name, last_name, email, phone_number, second_phone_number, resume_url, application_letter_url, certificates_urls, professional_certificates_urls, professional_certificates, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [
          jobId,
          fullName,
          firstName,
          lastName,
          email,
          phoneNumber,
          secondPhoneNumber,
          resumeFile,
          applicationLetterFile,
          JSON.stringify(certificateFiles),
          JSON.stringify(professionalCertificateFiles),
          professionalCertificates,
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
 * /api/v1/jobapplication/{applicationId}/status:
 *   patch:
 *     summary: Update the status of a job application.
 *     tags:
 *       - Job Applications
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the job application to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 description: The new status for the application.
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
 *         description: Application status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Application status updated to Rejected.
 *       400:
 *         description: Invalid status.
 *       404:
 *         description: Application not found.
 *       500:
 *         description: Internal Server Error.
 */
  router.patch('/:applicationId/status', authenticateToken, async (req: Request, res: Response) => {
    const { applicationId } = req.params;
    const { status } = req.body;

    const validStatuses = [
        'Pending', 'In Review', 'Shortlisted', 'Interview Scheduled', 'Interviewed',
        'Offered', 'Offer Accepted', 'Offer Declined', 'Rejected', 'Withdrawn', 'On Hold', 'Hired'
    ];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }

    try {
        // Update the application status in the database
        const [result]: any = await pool.query(
            'UPDATE job_applications SET application_status = ?, updated_at = NOW() WHERE id = ?',
            [status, applicationId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        // Fetch applicant details and job title for sending an email
        const [rows]: any = await pool.query(
            `SELECT job_applications.email, job_applications.full_name, jobs.title
             FROM jobs
             JOIN jobs ON job_applications.job_id = jobs.id
             WHERE job_applications.id = ?`,
            [applicationId]
        );
        const application = rows[0];

        // Send an email if the status is "Rejected"
        if (status === 'Rejected') {
            await sendRejectionEmail(application.email, application.full_name, application.title);
        }

        return res.status(200).json({ message: `Application status updated to ${status}` });
    } catch (error) {
        console.error('Error updating application status:', error);
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
  

export default router;
