import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import path from 'path';
import pool from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authenticateToken';
import { RowDataPacket } from 'mysql2';
import { generateOfferLetter } from '../utils/offerLetter';
import config from '../config';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

type ActiveRangeRow = RowDataPacket & {
  id: number;
  prefix: string;
  start_number: number;
  end_number: number;
  next_number: number;
  is_active: 0 | 1;
};

type OfferLetterEventAction = 'generated' | 'downloaded' | 'printed';

const toNullableNumber = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const logOfferLetterEvent = async (params: {
  offerLetterId: number;
  applicationId: number;
  action: OfferLetterEventAction;
  userId?: number | null;
  req?: Request;
}) => {
  try {
    await pool.query(
      `INSERT INTO offer_letter_events
       (offer_letter_id, application_id, action, acted_by, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.offerLetterId,
        params.applicationId,
        params.action,
        params.userId ?? null,
        params.req?.ip ?? null,
        params.req?.headers['user-agent'] ?? null,
      ]
    );
  } catch (error) {
    console.warn('Offer letter event log failed:', error);
  }
};

/**
 * @swagger
 * tags:
 *   name: StudentNumbers
 *   description: Student number ranges and assignments
 */

/**
 * @swagger
 * /api/v1/student-numbers/range:
 *   post:
 *     summary: Create and activate a new student number range (single active range)
 *     tags: [StudentNumbers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startNumber, endNumber]
 *             properties:
 *               prefix:
 *                 type: string
 *                 example: "w"
 *               startNumber:
 *                 type: integer
 *                 example: 200000
 *               endNumber:
 *                 type: integer
 *                 example: 299999
 *     responses:
 *       201:
 *         description: Range created and activated
 *       400:
 *         description: Invalid range
 *       500:
 *         description: Internal Server Error
 */
router.post('/range', authenticateToken, async (req: Request, res: Response) => {
  try {
    const prefix = (req.body?.prefix ?? 'w').toString().trim() || 'w';
    const startNumber = Number(req.body?.startNumber);
    const endNumber = Number(req.body?.endNumber);

    if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || startNumber <= 0 || endNumber <= 0) {
      return res.status(400).json({ message: 'startNumber and endNumber must be positive integers' });
    }
    if (startNumber > endNumber) {
      return res.status(400).json({ message: 'startNumber must be <= endNumber' });
    }

    // Single active range: deactivate previous, then create new active range
    await pool.query('UPDATE student_number_ranges SET is_active = 0 WHERE is_active = 1');

    const [result] = await pool.query<any>(
      `INSERT INTO student_number_ranges
       (prefix, start_number, end_number, next_number, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [prefix, startNumber, endNumber, startNumber]
    );

    return res.status(201).json({
      message: 'Student number range created and activated',
      id: result.insertId,
      prefix,
      startNumber,
      endNumber,
      nextNumber: startNumber,
    });
  } catch (error) {
    console.error('Error creating range:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/student-numbers/range/active:
 *   get:
 *     summary: Get the currently active student number range
 *     tags: [StudentNumbers]
 *     responses:
 *       200:
 *         description: Active range
 *       404:
 *         description: No active range
 *       500:
 *         description: Internal Server Error
 */
router.get('/range/active', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM student_number_ranges WHERE is_active = 1 LIMIT 1'
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No active range found' });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching active range:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/student-numbers/assign/{referenceNumber}:
 *   post:
 *     summary: Accept an application and assign the next available student number
 *     tags: [StudentNumbers]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student number assigned (or already assigned)
 *       400:
 *         description: Missing data / invalid range
 *       404:
 *         description: Application not found
 *       409:
 *         description: Range exhausted
 *       500:
 *         description: Internal Server Error
 */
router.post('/assign/:referenceNumber', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { referenceNumber } = req.params;
  const acceptedProgramme = typeof req.body?.acceptedProgramme === 'string' ? req.body.acceptedProgramme.trim() : '';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [appRows] = await connection.query<any[]>(
      'SELECT id, reference_number, programme, accepted_status, student_number FROM applications WHERE reference_number = ? FOR UPDATE',
      [referenceNumber]
    );

    if (!appRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Application not found' });
    }

    const application = appRows[0];

    if (application.student_number) {
      await connection.commit();
      return res.status(200).json({
        message: 'Student number already assigned',
        studentNumber: application.student_number,
      });
    }

    const [rangeRows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM student_number_ranges WHERE is_active = 1 LIMIT 1 FOR UPDATE'
    );

    if (!rangeRows.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'No active student number range set' });
    }

    const range = rangeRows[0] as ActiveRangeRow;
    if (range.next_number > range.end_number) {
      await connection.rollback();
      return res.status(409).json({ message: 'Student number range exhausted' });
    }

    const studentNumber = `${range.prefix}${range.next_number}`;

    const programmeToAccept = acceptedProgramme || application.programme;

    await connection.query(
      'UPDATE applications SET accepted_status = ?, student_number = ?, programme = ? WHERE id = ?',
      ['accepted', studentNumber, programmeToAccept, application.id]
    );

    await connection.query(
      'UPDATE student_number_ranges SET next_number = next_number + 1 WHERE id = ?',
      [range.id]
    );

    await connection.query(
      `INSERT INTO student_number_assignments
       (application_id, reference_number, student_number, range_id, assigned_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        application.id,
        application.reference_number,
        studentNumber,
        range.id,
        toNullableNumber(req.user?.id),
      ]
    );

    await connection.commit();

    // Fetch student email + name + programme name for the message
    const [infoRows] = await pool.query<any[]>(
      `SELECT 
         a.reference_number,
         a.student_number,
         a.programme AS programme_code,
         a.year_of_commencement,
         a.starting_semester,
         a.satellite_campus,
         pd.title,
         pd.first_names,
         pd.surname,
         pd.email,
         pd.postal_address,
         pd.residential_address,
         dp.name AS programme_name,
         dp.programme_duration,
         dp.prog_start_date,
         dp.prog_end_date,
         dp.programme_fee,
         dp.down_payment
       FROM applications a
       LEFT JOIN personal_details pd ON pd.application_id = a.id
       LEFT JOIN department_programme dp ON dp.code = a.programme
       WHERE a.reference_number = ?`,
      [referenceNumber]
    );

    const info = infoRows[0];
    const fullName = `${info?.first_names ?? ''} ${info?.surname ?? ''}`.trim();
    const programmeName = info?.programme_name || info?.programme_code || 'your programme';

    // Fetch active signature for Deputy Registrar (Academic Affairs)
    const [signatureRows] = await pool.query<RowDataPacket[]>(
      `SELECT name, title, file_path 
       FROM signatures 
       WHERE role = ? AND is_active = 1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      ['Deputy Registrar (Academic Affairs)']
    );

    const [settingsRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         down_payment_due_date,
         total_fees_due_date,
         registration_start_date,
         registration_end_date,
         orientation_start_date,
         orientation_end_date,
         orientation_time,
         min_applicants_by_date,
         offer_valid_until_date
       FROM offer_letter_settings
       WHERE is_active = 1
       ORDER BY created_at DESC
       LIMIT 1`
    );

    const settings = settingsRows[0] as any;

    const signature = signatureRows[0] as any;
    const signatureFilePath = signature?.file_path
      ? path.join(process.cwd(), signature.file_path.replace(/^\//, ''))
      : null;

    const logoFilePath = path.join(process.cwd(), 'src', 'uploads', 'wua-logo.png');

    let letterGenerated = false;
    let letterPublicPath: string | null = null;
    let letterFileName: string | null = null;

    try {
      const verificationCode = uuidv4();
      const letter = await generateOfferLetter({
        referenceNumber,
        studentNumber,
        verificationCode,
        title: info?.title,
        firstNames: info?.first_names,
        surname: info?.surname,
        programmeName,
        programmeDuration: info?.programme_duration,
        programmeStartDate: info?.prog_start_date,
        programmeEndDate: info?.prog_end_date,
        programmeFee: info?.programme_fee,
        downPayment: info?.down_payment ?? 250,
        downPaymentDueDate: settings?.down_payment_due_date ?? '',
        totalFeesDueDate: settings?.total_fees_due_date ?? '',
        registrationStartDate: settings?.registration_start_date ?? '',
        registrationEndDate: settings?.registration_end_date ?? '',
        orientationStartDate: settings?.orientation_start_date ?? '',
        orientationEndDate: settings?.orientation_end_date ?? '',
        orientationTime: settings?.orientation_time ?? '',
        minApplicantsByDate: settings?.min_applicants_by_date ?? '',
        offerValidUntilDate: settings?.offer_valid_until_date ?? '',
        yearOfCommencement: info?.year_of_commencement,
        satelliteCampus: info?.satellite_campus,
        postalAddress: info?.postal_address,
        residentialAddress: info?.residential_address,
        signatureName: signature?.name ?? 'M. Chirongoma – Munyoro (Mrs)',
        signatureTitle: signature?.title ?? 'Deputy Registrar (Academic Affairs)',
        signatureFilePath,
        logoFilePath,
      });

      letterGenerated = true;
      letterPublicPath = letter.publicPath;
      letterFileName = letter.fileName;

      await pool.query(
        'UPDATE offer_letters SET latest = 0 WHERE application_id = ?',
        [application.id]
      );

      const [insertResult] = await pool.query<any>(
        `INSERT INTO offer_letters
         (application_id, reference_number, student_number, file_name, file_path, verification_code, generated_by, latest)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          application.id,
          referenceNumber,
          studentNumber,
          letterFileName,
          letterPublicPath,
          verificationCode,
          toNullableNumber(req.user?.id),
        ]
      );

      const offerLetterId = insertResult?.insertId;
      if (offerLetterId) {
        await logOfferLetterEvent({
          offerLetterId,
          applicationId: application.id,
          action: 'generated',
          userId: toNullableNumber(req.user?.id),
          req,
        });
      }
    } catch (letterError) {
      console.error('Offer letter generation failed:', letterError);
    }

    let emailSent = false;
    if (info?.email) {
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp-mail.outlook.com',
          port: 587,
          secure: false,
          auth: {
            user: config.email.user,
            pass: config.email.pass,
          },
          tls: { rejectUnauthorized: false },
        });

        const safeName = `${fullName || 'Student'}`.trim();
        const safeProgramme = `${programmeName}`.trim();
        const safeStudentNumber = `${studentNumber}`.trim();

        const htmlBody = `
          <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f4f4f4;padding:20px">
            <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.06);overflow:hidden">
              <div style="background:#208F74;padding:16px 20px;border-bottom:4px solid rgba(255,215,0,.7);color:#ffffff">
                <h2 style="margin:0;font-size:20px;">Women's University in Africa</h2>
                <div style="font-size:13px;opacity:.9">Admissions</div>
              </div>
              <div style="padding:20px 22px 16px 22px;color:#222">
                <p style="margin:0 0 10px 0;">Good day ${safeName},</p>
                <p style="margin:0 0 10px 0;">Congratulations! You have been accepted to study ${safeProgramme} at the Women's University in Africa.</p>
                <p style="margin:0 0 10px 0;">Your student number is:</p>
                <p style="margin:8px 0 16px 0;font-size:20px;font-weight:700;color:#292727;">${safeStudentNumber}</p>
                <p style="margin:0 0 10px 0;">We look forward to welcoming you. Your offer letter is attached as a PDF.</p>
                <p style="margin:18px 0 0 0;">Regards,<br/>Women's University in Africa</p>
              </div>
            </div>
          </div>
        `.trim();

        const mailOptions: any = {
          from: config.email.user,
          to: info.email,
          subject: 'WUA Admission Offer and Student Number',
          text:
            `Good day ${safeName},\n\n` +
            `Congratulations! You have been accepted to study ${safeProgramme} at the Women's University in Africa.\n\n` +
            `Your student number is: ${safeStudentNumber}\n\n` +
            `We look forward to welcoming you. Your offer letter is attached as a PDF.\n\n` +
            `Regards,\nWomen's University in Africa`,
          html: htmlBody,
        };

        if (letterGenerated && letterPublicPath) {
          const diskPath = path.join(process.cwd(), letterPublicPath.replace(/^\//, ''));
          mailOptions.attachments = [
            {
              filename: letterFileName || `offer-letter-${studentNumber}.pdf`,
              path: diskPath,
            },
          ];
        }

        await transporter.sendMail(mailOptions);
        emailSent = true;
      } catch (emailError) {
        console.error('Error sending student number email:', emailError);
      }
    }

    return res.status(200).json({
      message: 'Student number assigned successfully',
      studentNumber,
      emailSent,
      letterGenerated,
      offerLetterPath: letterPublicPath,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}
    console.error('Error assigning student number:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

/**
 * @swagger
 * /api/v1/student-numbers/offer-letter/{referenceNumber}:
 *   get:
 *     summary: Download the latest offer letter for a reference number
 *     tags: [StudentNumbers]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer letter PDF
 *       404:
 *         description: Offer letter not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/offer-letter/:referenceNumber', authenticateToken, async (req: Request, res: Response) => {
  const { referenceNumber } = req.params;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, application_id, file_path, file_name
       FROM offer_letters
       WHERE reference_number = ? AND latest = 1
       ORDER BY created_at DESC
       LIMIT 1`,
      [referenceNumber]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    const row = rows[0] as any;
    await logOfferLetterEvent({
      offerLetterId: row.id,
      applicationId: row.application_id,
      action: 'downloaded',
      userId: toNullableNumber((req as AuthenticatedRequest).user?.id),
      req,
    });
    const diskPath = path.join(process.cwd(), String(row.file_path).replace(/^\//, ''));
    return res.download(diskPath, row.file_name || undefined);
  } catch (error) {
    console.error('Offer letter download error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/student-numbers/offer-letter/student/{studentNumber}:
 *   get:
 *     summary: Download the latest offer letter by student number
 *     tags: [StudentNumbers]
 *     parameters:
 *       - in: path
 *         name: studentNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer letter PDF
 *       404:
 *         description: Offer letter not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/offer-letter/student/:studentNumber', authenticateToken, async (req: Request, res: Response) => {
  const { studentNumber } = req.params;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, application_id, file_path, file_name
       FROM offer_letters
       WHERE student_number = ? AND latest = 1
       ORDER BY created_at DESC
       LIMIT 1`,
      [studentNumber]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    const row = rows[0] as any;
    await logOfferLetterEvent({
      offerLetterId: row.id,
      applicationId: row.application_id,
      action: 'downloaded',
      userId: toNullableNumber((req as AuthenticatedRequest).user?.id),
      req,
    });
    const diskPath = path.join(process.cwd(), String(row.file_path).replace(/^\//, ''));
    return res.download(diskPath, row.file_name || undefined);
  } catch (error) {
    console.error('Offer letter download error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/student-numbers/offer-letter/verify:
 *   get:
 *     summary: Verify an offer letter by verification code
 *     tags: [StudentNumbers]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer letter is valid
 *       404:
 *         description: Offer letter not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/offer-letter/verify', async (req: Request, res: Response) => {
  const code = String(req.query.code || '').trim();
  if (!code) {
    return res.status(400).json({ message: 'Verification code is required' });
  }
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         ol.reference_number,
         ol.student_number,
         ol.created_at,
         a.programme,
         a.starting_semester,
         a.satellite_campus
       FROM offer_letters ol
       LEFT JOIN applications a ON a.id = ol.application_id
       WHERE ol.verification_code = ?
       ORDER BY ol.created_at DESC
       LIMIT 1`,
      [code]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    return res.status(200).json({
      valid: true,
      offerLetter: rows[0],
    });
  } catch (error) {
    console.error('Offer letter verify error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/student-numbers/offer-letter/{referenceNumber}/print:
 *   post:
 *     summary: Log a print event for the latest offer letter
 *     tags: [StudentNumbers]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Print event logged
 *       404:
 *         description: Offer letter not found
 *       500:
 *         description: Internal Server Error
 */
router.post('/offer-letter/:referenceNumber/print', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { referenceNumber } = req.params;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, application_id
       FROM offer_letters
       WHERE reference_number = ? AND latest = 1
       ORDER BY created_at DESC
       LIMIT 1`,
      [referenceNumber]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    const row = rows[0] as any;
    await logOfferLetterEvent({
      offerLetterId: row.id,
      applicationId: row.application_id,
      action: 'printed',
      userId: toNullableNumber(req.user?.id),
      req,
    });

    return res.status(200).json({ message: 'Print event logged' });
  } catch (error) {
    console.error('Offer letter print log error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/v1/student-numbers/offer-letter/{referenceNumber}/regenerate:
 *   post:
 *     summary: Regenerate the offer letter using current programme data
 *     tags: [StudentNumbers]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer letter regenerated
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */
router.post('/offer-letter/:referenceNumber/regenerate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { referenceNumber } = req.params;
  try {
    const [appRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, reference_number, student_number FROM applications WHERE reference_number = ?',
      [referenceNumber]
    );

    if (!appRows.length) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const application = appRows[0] as any;
    if (!application.student_number) {
      return res.status(400).json({ message: 'Student number not assigned yet' });
    }

    const [infoRows] = await pool.query<any[]>(
      `SELECT 
         a.reference_number,
         a.student_number,
         a.programme AS programme_code,
         a.year_of_commencement,
         a.starting_semester,
         a.satellite_campus,
         pd.title,
         pd.first_names,
         pd.surname,
         pd.email,
         pd.postal_address,
         pd.residential_address,
         dp.name AS programme_name,
         dp.programme_duration,
         dp.prog_start_date,
         dp.prog_end_date,
         dp.programme_fee,
         dp.down_payment
       FROM applications a
       LEFT JOIN personal_details pd ON pd.application_id = a.id
       LEFT JOIN department_programme dp ON dp.code = a.programme
       WHERE a.reference_number = ?`,
      [referenceNumber]
    );

    const info = infoRows[0];
    const programmeName = info?.programme_name || info?.programme_code || 'your programme';

    const [signatureRows] = await pool.query<RowDataPacket[]>(
      `SELECT name, title, file_path 
       FROM signatures 
       WHERE role = ? AND is_active = 1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      ['Deputy Registrar (Academic Affairs)']
    );

    const [settingsRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         down_payment_due_date,
         total_fees_due_date,
         registration_start_date,
         registration_end_date,
         orientation_start_date,
         orientation_end_date,
         orientation_time,
         min_applicants_by_date,
         offer_valid_until_date
       FROM offer_letter_settings
       WHERE is_active = 1
       ORDER BY created_at DESC
       LIMIT 1`
    );

    const settings = settingsRows[0] as any;

    const signature = signatureRows[0] as any;
    const signatureFilePath = signature?.file_path
      ? path.join(process.cwd(), signature.file_path.replace(/^\//, ''))
      : null;

    const logoFilePath = path.join(process.cwd(), 'src', 'uploads', 'wua-logo.png');

    const verificationCode = uuidv4();
    const letter = await generateOfferLetter({
      referenceNumber,
      studentNumber: application.student_number,
      verificationCode,
      title: info?.title,
      firstNames: info?.first_names,
      surname: info?.surname,
      programmeName,
      programmeDuration: info?.programme_duration,
      programmeStartDate: info?.prog_start_date,
      programmeEndDate: info?.prog_end_date,
      programmeFee: info?.programme_fee,
      downPayment: info?.down_payment ?? 250,
      downPaymentDueDate: settings?.down_payment_due_date ?? '',
      totalFeesDueDate: settings?.total_fees_due_date ?? '',
      registrationStartDate: settings?.registration_start_date ?? '',
      registrationEndDate: settings?.registration_end_date ?? '',
      orientationStartDate: settings?.orientation_start_date ?? '',
      orientationEndDate: settings?.orientation_end_date ?? '',
      orientationTime: settings?.orientation_time ?? '',
      minApplicantsByDate: settings?.min_applicants_by_date ?? '',
      offerValidUntilDate: settings?.offer_valid_until_date ?? '',
      yearOfCommencement: info?.year_of_commencement,
      satelliteCampus: info?.satellite_campus,
      postalAddress: info?.postal_address,
      residentialAddress: info?.residential_address,
      signatureName: signature?.name ?? 'M. Chirongoma – Munyoro (Mrs)',
      signatureTitle: signature?.title ?? 'Deputy Registrar (Academic Affairs)',
      signatureFilePath,
      logoFilePath,
    });

    await pool.query(
      'UPDATE offer_letters SET latest = 0 WHERE application_id = ?',
      [application.id]
    );

    const [insertResult] = await pool.query<any>(
      `INSERT INTO offer_letters
       (application_id, reference_number, student_number, file_name, file_path, verification_code, generated_by, latest)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        application.id,
        referenceNumber,
        application.student_number,
        letter.fileName,
        letter.publicPath,
        verificationCode,
        toNullableNumber(req.user?.id),
      ]
    );

    const offerLetterId = insertResult?.insertId;
    if (offerLetterId) {
      await logOfferLetterEvent({
        offerLetterId,
        applicationId: application.id,
        action: 'generated',
        userId: toNullableNumber(req.user?.id),
        req,
      });
    }

    return res.status(200).json({
      message: 'Offer letter regenerated',
      offerLetterPath: letter.publicPath,
    });
  } catch (error) {
    console.error('Offer letter regenerate error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export default router;
