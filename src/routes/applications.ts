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


dotenv.config();

const router = Router();
/**
 * @swagger
 * /api/v1/applications:
 *   post:
 *     summary: Create a new application
 *     tags: [Applications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startingSemester:
 *                 type: string
 *               programme:
 *                 type: string
 *               satelliteCampus:
 *                 type: string
 *               preferredSession:
 *                 type: string
 *               wuaDiscoveryMethod:
 *                 type: string
 *               previousRegistration:
 *                 type: string
 *               yearOfCommencement:
 *                 type: string
 *                 example: "2025"
 *               programType:
 *                 type: string
 *                 description: Type of program (e.g., Undergraduate, Postgraduate, PhD)
 *     responses:
 *       201:
 *         description: Application created successfully
 *       500:
 *         description: Internal Server Error
 */

router.post('/', async (req, res) => {
    const { startingSemester, programme, satelliteCampus, preferredSession, wuaDiscoveryMethod, previousRegistration, yearOfCommencement, programType } = req.body;
    
    try {
        const referenceNumber = Math.random().toString(36).substring(2, 10).toUpperCase(); 

        const [result] = await pool.query(
            'INSERT INTO applications (reference_number, starting_semester, programme, satellite_campus, preferred_session, wua_discovery_method, previous_registration, year_of_commencement, program_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [referenceNumber, startingSemester, programme, satelliteCampus, preferredSession, wuaDiscoveryMethod, previousRegistration, yearOfCommencement, programType]
        );

        res.status(201).json({ message: 'Application created', referenceNumber });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


/**
 * @swagger
 * /api/v1/applications/resume:
 *   post:
 *     summary: Resume an incomplete application
 *     tags: [Applications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               referenceNumber:
 *                 type: string
 *               surname:
 *                 type: string
 *               yearOfBirth:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Application found
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */
router.post('/resume', async (req, res) => {
    const { referenceNumber, surname, yearOfBirth } = req.body;

    try {
        const [result, fields] = await pool.query(
            'SELECT * FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );

        const applications: RowDataPacket[] = result as RowDataPacket[];

        if (applications.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const applicationId = applications[0].id;

        const [personalDetailsResult, personalDetailsFields] = await pool.query(
            'SELECT * FROM personal_details WHERE application_id = ? AND surname LIKE ? AND YEAR(date_of_birth) = ?',
            [applicationId, `${surname}%`, yearOfBirth]
        );

        const personalDetails: RowDataPacket[] = personalDetailsResult as RowDataPacket[];

        if (personalDetails.length === 0) {
            return res.status(404).json({ message: 'Personal details not found' });
        }

        const [declarationsResult, declarationsFields] = await pool.query('SELECT * FROM declarations WHERE application_id = ?', [applicationId]);
        const declarations: RowDataPacket[] = declarationsResult as RowDataPacket[];

        const [disabilitiesResult, disabilitiesFields] = await pool.query('SELECT * FROM disabilities WHERE application_id = ?', [applicationId]);
        const disabilities: RowDataPacket[] = disabilitiesResult as RowDataPacket[];

        const [documentsResult, documentsFields] = await pool.query('SELECT * FROM documents WHERE application_id = ?', [applicationId]);
        const documents: RowDataPacket[] = documentsResult as RowDataPacket[];

        const [educationResult, educationFields] = await pool.query('SELECT * FROM education WHERE application_id = ?', [applicationId]);
        const education: RowDataPacket[] = educationResult as RowDataPacket[];

        const [educationDetailsResult, educationDetailsFields] = await pool.query('SELECT * FROM education_details WHERE application_id = ?', [applicationId]);
        const educationDetails: RowDataPacket[] = educationDetailsResult as RowDataPacket[];

        const [nextOfKinResult, nextOfKinFields] = await pool.query('SELECT * FROM next_of_kin WHERE application_id = ?', [applicationId]);
        const nextOfKin: RowDataPacket[] = nextOfKinResult as RowDataPacket[];

        const [subjectsResult, subjectsFields] = await pool.query('SELECT * FROM subjects WHERE education_id IN (SELECT id FROM education WHERE application_id = ?)', [applicationId]);
        const subjects: RowDataPacket[] = subjectsResult as RowDataPacket[];

        const [tertiaryEducationResult, tertiaryEducationFields] = await pool.query('SELECT * FROM tertiary_education WHERE application_id = ?', [applicationId]);
        const tertiaryEducation: RowDataPacket[] = tertiaryEducationResult as RowDataPacket[];

        const [workExperienceResult, workExperienceFields] = await pool.query('SELECT * FROM work_experience WHERE application_id = ?', [applicationId]);
        const workExperience: RowDataPacket[] = workExperienceResult as RowDataPacket[];

        return res.status(200).json({
            message: 'Application found',
            application: applications[0],
            personalDetails: personalDetails[0],
            declarations: declarations,
            disabilities: disabilities,
            documents: documents,
            education: education,
            educationDetails: educationDetails,
            nextOfKin: nextOfKin,
            subjects: subjects,
            tertiaryEducation: tertiaryEducation,
            workExperience: workExperience
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' }); 
    }
});
/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/personal-details:
 *   post:
 *     summary: Save personal details
 *     tags: [Personal Details]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               firstNames:
 *                 type: string
 *               surname:
 *                 type: string
 *               maritalStatus:
 *                 type: string
 *               maidenName:
 *                 type: string
 *               nationalId:
 *                 type: string
 *               passportNumber:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               placeOfBirth:
 *                 type: string
 *               gender:
 *                 type: string
 *               citizenship:
 *                 type: string
 *               nationality:
 *                 type: string
 *               residentialAddress:
 *                 type: string
 *               postalAddress:
 *                 type: string
 *               city:
 *                 type: string
 *               country:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Personal details saved successfully
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */

router.post('/:referenceNumber/personal-details', async (req, res) => {
    const { referenceNumber } = req.params;
    const {
      title,
      firstNames,
      surname,
      maritalStatus,
      maidenName,
      nationalId,
      passportNumber,
      dateOfBirth,
      placeOfBirth,
      gender,
      citizenship,
      nationality,
      residentialAddress,
      postalAddress,
      city,
      country,
      phone,
      email,
    } = req.body;
  
    try {
      const [appResult] = await pool.query('SELECT id FROM applications WHERE reference_number = ?', [referenceNumber]);
  
      const rows = appResult as RowDataPacket[];
  
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Application not found' });
      }
  
      const applicationId = rows[0].id;
  
      await pool.query(
        'INSERT INTO personal_details (application_id, title, first_names, surname, marital_status, maiden_name, national_id, passport_number, date_of_birth, place_of_birth, gender, citizenship, nationality, residential_address, postal_address, city, country, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?, ?, ?, ?)',
        [
          applicationId,
          title,
          firstNames,
          surname,
          maritalStatus,
          maidenName,
          nationalId,
          passportNumber,
          dateOfBirth,
          placeOfBirth,
          gender,
          citizenship,
          nationality,
          residentialAddress,
          postalAddress,
          city,
          country,
          phone,
          email,
        ]
      );
  
      return res.status(201).json({ message: 'Personal details saved' });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  });





/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/next-of-kin:
 *   post:
 *     summary: Save next of kin details
 *     tags: [Next of Kin]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               relationship:
 *                 type: string
 *               contactAddress:
 *                 type: string
 *               contactTel:
 *                 type: string
 *     responses:
 *       201:
 *         description: Next of kin details saved successfully
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */
router.post('/:referenceNumber/next-of-kin', async (req, res) => {
    const { referenceNumber } = req.params;
    const { firstName, lastName, relationship, contactAddress, contactTel } = req.body;

    try {
        // Check if the application exists
        const [appResult] = await pool.query(
            'SELECT id FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );

        const rows = appResult as RowDataPacket[];

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const applicationId = rows[0].id;

        // Insert next of kin details
        await pool.query(
            'INSERT INTO next_of_kin (application_id, first_name, last_name, relationship, contact_address, contact_tel) VALUES (?, ?, ?, ?, ?, ?)',
            [applicationId, firstName, lastName, relationship, contactAddress, contactTel]
        );

        return res.status(201).json({ message: 'Next of kin details saved' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/education-details:
 *   post:
 *     summary: Save education details
 *     tags: [Education Details]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               qualifications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     qualificationType:
 *                       type: string
 *                       enum: [Ordinary Level, Other Secondary School Qualification, Advanced Level, Tertiary Education]
 *                     examinationBoard:
 *                       type: string
 *                     subjects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           subjectName:
 *                             type: string
 *                           grade:
 *                             type: string
 *                           yearWritten:
 *                             type: integer
 *               tertiaryEducation:
 *                 type: object
 *                 properties:
 *                   institutionName:
 *                     type: string
 *                   qualificationObtained:
 *                     type: string
 *                   fieldOfStudy:
 *                     type: string
 *                   yearCompleted:
 *                     type: integer
 *     responses:
 *       201:
 *         description: Education details saved successfully
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */

router.post('/:referenceNumber/education-details', async (req, res) => {
    const { referenceNumber } = req.params;
    const { qualifications, tertiaryEducation } = req.body;

    try {
        // Check if the application exists
        const [appResult] = await pool.query(
            'SELECT id FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );

        const rows = appResult as RowDataPacket[];

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const applicationId = rows[0].id;

        for (const qualification of qualifications) {
            const { qualificationType, examinationBoard, subjects } = qualification;

            // Insert education details
            const [educationResult] = await pool.query(
                'INSERT INTO education_details (application_id, qualification_type, examination_board) VALUES (?, ?, ?)',
                [applicationId, qualificationType, examinationBoard]
            );

            const educationId = (educationResult as OkPacket).insertId;

            // Insert subjects (if provided)
            if (subjects && Array.isArray(subjects)) {
                for (const subject of subjects) {
                    await pool.query(
                        'INSERT INTO subjects (education_id, subject_name, grade, year_written) VALUES (?, ?, ?, ?)',
                        [educationId, subject.subjectName, subject.grade, subject.yearWritten]
                    );
                }
            }
        }

        // Insert tertiary education (if provided)
        if (tertiaryEducation) {
            await pool.query(
                'INSERT INTO tertiary_education (application_id, institution_name, qualification_obtained, field_of_study, year_completed) VALUES (?, ?, ?, ?, ?)',
                [
                    applicationId,
                    tertiaryEducation.institutionName,
                    tertiaryEducation.qualificationObtained,
                    tertiaryEducation.fieldOfStudy,
                    tertiaryEducation.yearCompleted,
                ]
            );
        }

        return res.status(201).json({ message: 'Education details saved' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/work-experience:
 *   post:
 *     summary: Save work experience details
 *     tags: [Work Experience]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workExperience:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     organisationName:
 *                       type: string
 *                     position:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                       nullable: true
 *                     duties:
 *                       type: string
 *     responses:
 *       201:
 *         description: Work experience saved successfully
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */
router.post('/:referenceNumber/work-experience', async (req, res) => {
    const { referenceNumber } = req.params;
    const { workExperience } = req.body;

    try {
        // Check if the application exists
        const [appResult] = await pool.query(
            'SELECT id FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );

        const rows = appResult as RowDataPacket[];

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const applicationId = rows[0].id;

        // If no work experience provided, just return success
        if (!workExperience || !Array.isArray(workExperience) || workExperience.length === 0) {
            return res.status(201).json({ message: 'No work experience provided, but application exists' });
        }

        // Insert work experience entries
        for (const experience of workExperience) {
            await pool.query(
                'INSERT INTO work_experience (application_id, organisation_name, position, start_date, end_date, duties) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    applicationId,
                    experience.organisationName,
                    experience.position,
                    experience.startDate,
                    experience.endDate || null, // Handle nullable end date
                    experience.duties
                ]
            );
        }

        return res.status(201).json({ message: 'Work experience saved successfully' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/documents:
 *   post:
 *     summary: Upload required documents for an application
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               academicCertificate:
 *                 type: string
 *                 format: binary
 *               professionalCertificate:
 *                 type: string
 *                 format: binary
 *               proposal:
 *                 type: string
 *                 format: binary
 *                 nullable: true
 *               applicationFee:
 *                 type: string
 *                 format: binary
 *               birthCertificate:
 *                 type: string
 *                 format: binary
 *               identityCard:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Documents uploaded successfully
 *       400:
 *         description: Missing required documents
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */

// Ensure Uploads Directory Exists
// Ensure Uploads Directory Exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

router.post('/:referenceNumber/documents', upload.fields([
    { name: 'academicCertificate', maxCount: 1 },
    { name: 'professionalCertificate', maxCount: 1 },
    { name: 'proposal', maxCount: 1 }, // Required only for PhD students
    { name: 'applicationFee', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'identityCard', maxCount: 1 }
]), async (req, res) => {
    const { referenceNumber } = req.params;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    try {
        // Check if the application exists
        const [appResult] = await pool.query(
            'SELECT id, program_type FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );

        const rows = appResult as RowDataPacket[];

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const applicationId = rows[0].id;
        const programType = rows[0].program_type; // Check if it's PhD

        // Required documents based on program type
        const requiredDocs = [
            'academicCertificate',
            'professionalCertificate',
            'applicationFee',
            'birthCertificate',
            'identityCard'
        ];

        if (programType === 'PhD') {
            requiredDocs.push('proposal'); // PhD applicants must upload a proposal
        }

        // Validate that all required documents are provided
        for (const doc of requiredDocs) {
            if (!files[doc]) {
                return res.status(400).json({ message: `Missing required document: ${doc}` });
            }
        }

        // Insert each document into the database
        for (const doc of requiredDocs) {
            await pool.query(
                'INSERT INTO documents (application_id, document_type, file_path) VALUES (?, ?, ?)',
                [
                    applicationId,
                    doc.replace(/([A-Z])/g, '_$1').toLowerCase(),
                    files[doc][0].path
                ]
            );
        }

        return res.status(201).json({ message: 'Documents uploaded successfully' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});


export default router;