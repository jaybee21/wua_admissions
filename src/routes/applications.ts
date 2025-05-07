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
        const [result] = await pool.query(
            'SELECT * FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );

        const applications: RowDataPacket[] = result as RowDataPacket[];

        if (applications.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const applicationId = applications[0].id;

        const [personalDetailsResult] = await pool.query(
            'SELECT * FROM personal_details WHERE application_id = ? AND surname LIKE ? AND YEAR(date_of_birth) = ?',
            [applicationId, `${surname}%`, yearOfBirth]
        );

        const personalDetails: RowDataPacket[] = personalDetailsResult as RowDataPacket[];

        if (personalDetails.length === 0) {
            return res.status(404).json({ message: 'Personal details not found' });
        }

        const [declarationsResult] = await pool.query('SELECT * FROM declarations WHERE application_id = ?', [applicationId]);
        const declarations: RowDataPacket[] = declarationsResult as RowDataPacket[];

        const [disabilitiesResult] = await pool.query('SELECT * FROM disabilities WHERE application_id = ?', [applicationId]);
        const disabilities: RowDataPacket[] = disabilitiesResult as RowDataPacket[];

        const [documentsResult] = await pool.query('SELECT * FROM documents WHERE application_id = ?', [applicationId]);
        const documents: RowDataPacket[] = documentsResult as RowDataPacket[];

        const [educationResult] = await pool.query('SELECT * FROM education WHERE application_id = ?', [applicationId]);
        const education: RowDataPacket[] = educationResult as RowDataPacket[];

        const [educationDetailsResult] = await pool.query('SELECT * FROM education_details WHERE application_id = ?', [applicationId]);
        const educationDetails: RowDataPacket[] = educationDetailsResult as RowDataPacket[];

        const [nextOfKinResult] = await pool.query('SELECT * FROM next_of_kin WHERE application_id = ?', [applicationId]);
        const nextOfKin: RowDataPacket[] = nextOfKinResult as RowDataPacket[];

        const [tertiaryEducationResult] = await pool.query('SELECT * FROM tertiary_education WHERE application_id = ?', [applicationId]);
        const tertiaryEducation: RowDataPacket[] = tertiaryEducationResult as RowDataPacket[];

        const [workExperienceResult] = await pool.query('SELECT * FROM work_experience WHERE application_id = ?', [applicationId]);
        const workExperience: RowDataPacket[] = workExperienceResult as RowDataPacket[];

        // Updated query for subjects, linked through education_details
        const [subjectsResult] = await pool.query(
            'SELECT * FROM subjects WHERE education_id IN (SELECT id FROM education_details WHERE application_id = ?)',
            [applicationId]
        );
        const subjects: RowDataPacket[] = subjectsResult as RowDataPacket[];

        return res.status(200).json({
            message: 'Application found',
            application: applications[0],
            personalDetails: personalDetails[0],
            declarations,
            disabilities,
            documents,
            education,
            educationDetails,
            nextOfKin,
            subjects,
            tertiaryEducation,
            workExperience
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
        first_names,
        surname,
        marital_status,
        maiden_name,
        national_id,
        passport_number,
        date_of_birth,
        place_of_birth,
        gender,
        citizenship,
        nationality,
        residential_address,
        postal_address,
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
        `INSERT INTO personal_details 
         (application_id, title, first_names, surname, marital_status, maiden_name, national_id, passport_number, date_of_birth, place_of_birth, gender, citizenship, nationality, residential_address, postal_address, city, country, phone, email) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          applicationId,
          title,
          first_names,
          surname,
          marital_status,
          maiden_name,
          national_id,
          passport_number,
          date_of_birth,
          place_of_birth,
          gender,
          citizenship,
          nationality,
          residential_address,
          postal_address,
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
 * /api/v1/applications/{referenceNumber}/personal-details:
 *   put:
 *     summary: Update personal details
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
 *       200:
 *         description: Personal details updated successfully
 *       404:
 *         description: Application or personal details not found
 *       500:
 *         description: Internal Server Error
 */
router.put('/:referenceNumber/personal-details', async (req, res) => {
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
  
      const [existingDetails] = await pool.query('SELECT id FROM personal_details WHERE application_id = ?', [applicationId]);
  
      if ((existingDetails as RowDataPacket[]).length === 0) {
        return res.status(404).json({ message: 'Personal details not found' });
      }
  
      await pool.query(
        'UPDATE personal_details SET title = ?, first_names = ?, surname = ?, marital_status = ?, maiden_name = ?, national_id = ?, passport_number = ?, date_of_birth = ?, place_of_birth = ?, gender = ?, citizenship = ?, nationality = ?, residential_address = ?, postal_address = ?, city = ?, country = ?, phone = ?, email = ? WHERE application_id = ?',
        [
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
          applicationId,
        ]
      );
  
      return res.status(200).json({ message: 'Personal details updated' });
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
 * /api/v1/applications/{referenceNumber}/disabilities:
 *   post:
 *     summary: Submit disability information
 *     tags: [Disabilities]
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
 *               hasDisability:
 *                 type: string
 *                 enum: ["Yes", "No"]
 *               blindness:
 *                 type: boolean
 *               cerebralPalsy:
 *                 type: boolean
 *               deafness:
 *                 type: boolean
 *               speechImpairment:
 *                 type: boolean
 *               other:
 *                 type: string
 *               extraAdaptations:
 *                 type: string
 *     responses:
 *       201:
 *         description: Disability information submitted successfully
 *       404:
 *         description: Application not found
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Internal Server Error
 */

router.post('/:referenceNumber/disabilities', async (req, res) => {
    const { referenceNumber } = req.params;
    const { hasDisability, blindness, cerebralPalsy, deafness, speechImpairment, other, extraAdaptations } = req.body;

    if (!hasDisability) {
        return res.status(400).json({ message: 'Disability status is required' });
    }

    try {
        const [appResult] = await pool.query('SELECT id FROM applications WHERE reference_number = ?', [referenceNumber]);
        const rows = appResult as RowDataPacket[];

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const applicationId = rows[0].id;

        await pool.query(
            'INSERT INTO disabilities (application_id, has_disability, blindness, cerebral_palsy, deafness, speech_impairment, other, extra_adaptations) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [applicationId, hasDisability, blindness || 0, cerebralPalsy || 0, deafness || 0, speechImpairment || 0, other || null, extraAdaptations || null]
        );

        res.status(201).json({ message: 'Disability information submitted successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
    return;
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

/**
 * @swagger
 * /api/v1/applications/dashboard:
 *   get:
 *     summary: Get dashboard statistics and graphs
 *     description: >
 *       Returns application summary statistics, trends over the past 6 months, top 5 program distribution, and a program distribution graph.
 *       The `filter` query affects only the summary section and can be set to 'day', 'week', or 'month'.
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *         required: false
 *         description: Filter by time range (affects summary section)
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalApplications:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                         change:
 *                           type: string
 *                     accepted:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                         change:
 *                           type: string
 *                     pending:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                         change:
 *                           type: string
 *                     rejected:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                         change:
 *                           type: string
 *                 trends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       month:
 *                         type: string
 *                         example: "2024-12"
 *                       total:
 *                         type: integer
 *                       accepted:
 *                         type: integer
 *                       rejected:
 *                         type: integer
 *                 programDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       programme:
 *                         type: string
 *                       total:
 *                         type: integer
 *                 programDistributionGraph:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       month:
 *                         type: string
 *                         example: "2024-12"
 *                       programme:
 *                         type: string
 *                       count:
 *                         type: integer
 *       500:
 *         description: Internal Server Error
 */


router.get('/dashboard', async (req: Request, res: Response) => {
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'month';
  
    const getDateRange = (filter: string) => {
        const now = new Date();
        const current = new Date();
        const previous = new Date();
      
        let endOfCurrent: Date;
      
        if (filter === 'day') {
          current.setHours(0, 0, 0, 0);
          endOfCurrent = new Date(current);
          endOfCurrent.setHours(23, 59, 59, 999);
          previous.setDate(current.getDate() - 1);
          previous.setHours(0, 0, 0, 0);
        } else if (filter === 'week') {
          const day = current.getDay();
          current.setDate(current.getDate() - day);
          current.setHours(0, 0, 0, 0);
          endOfCurrent = new Date(current);
          endOfCurrent.setDate(endOfCurrent.getDate() + 6); // end of week
          endOfCurrent.setHours(23, 59, 59, 999);
          previous.setDate(current.getDate() - 7);
          previous.setHours(0, 0, 0, 0);
        } else {
          current.setDate(1);
          current.setHours(0, 0, 0, 0);
          endOfCurrent = new Date(current);
          endOfCurrent.setMonth(endOfCurrent.getMonth() + 1);
          endOfCurrent.setDate(0); // last day of the current month
          endOfCurrent.setHours(23, 59, 59, 999);
          previous.setMonth(current.getMonth() - 1);
          previous.setDate(1);
          previous.setHours(0, 0, 0, 0);
        }
      
        return {
          currentStart: current.toISOString().slice(0, 19).replace('T', ' '),
          currentEnd: endOfCurrent.toISOString().slice(0, 19).replace('T', ' '),
          previousStart: previous.toISOString().slice(0, 19).replace('T', ' '),
        };
      };
      
  
    const { currentStart, previousStart, currentEnd } = getDateRange(filter);
  
    try {
      // Current period
      const [currentRows] = await pool.query(
        `SELECT 
          COUNT(*) AS total,
          COALESCE(SUM(accepted_status = 'accepted'), 0) AS accepted,
          COALESCE(SUM(accepted_status = 'pending'), 0) AS pending,
          COALESCE(SUM(accepted_status = 'rejected'), 0) AS rejected
        FROM applications
        WHERE created_at BETWEEN ? AND ?`,
        [currentStart, currentEnd]
      );
  
      const currentTotal = (currentRows as any)[0];
  
      // Previous period
      const [previousRows] = await pool.query(
        `SELECT 
          COUNT(*) AS total,
          COALESCE(SUM(accepted_status = 'accepted'), 0) AS accepted,
          COALESCE(SUM(accepted_status = 'pending'), 0) AS pending,
          COALESCE(SUM(accepted_status = 'rejected'), 0) AS rejected
        FROM applications
        WHERE created_at BETWEEN ? AND ?`,
        [previousStart, currentStart]
      );
  
      const previousTotal = (previousRows as any)[0];
  
      const calculateChange = (current: number, previous: number) => {
        if (!previous) return 'N/A';
        const change = ((current - previous) / previous) * 100;
        return `${change.toFixed(1)}%`;
      };
  
      // Trends (past 6 months)
      const [trendsResult] = await pool.query(`
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') AS month,
          COUNT(*) AS total,
          COALESCE(SUM(accepted_status = 'accepted'), 0) AS accepted,
          COALESCE(SUM(accepted_status = 'rejected'), 0) AS rejected
        FROM applications
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY month
        ORDER BY month DESC
      `);
  
      // Top 5 program distribution
      const [distributionResult] = await pool.query(`
        SELECT programme, COUNT(*) AS total
        FROM applications
        GROUP BY programme
        ORDER BY total DESC
        LIMIT 5
      `);
  
      // Program distribution graph
      const [programGraphResult] = await pool.query(`
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') AS month,
          programme,
          COUNT(*) AS count
        FROM applications
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY month, programme
        ORDER BY month DESC
      `);
  
      return res.status(200).json({
        summary: {
          totalApplications: {
            count: currentTotal.total,
            change: calculateChange(currentTotal.total, previousTotal.total),
          },
          accepted: {
            count: currentTotal.accepted,
            change: calculateChange(currentTotal.accepted, previousTotal.accepted),
          },
          pending: {
            count: currentTotal.pending,
            change: calculateChange(currentTotal.pending, previousTotal.pending),
          },
          rejected: {
            count: currentTotal.rejected,
            change: calculateChange(currentTotal.rejected, previousTotal.rejected),
          },
        },
        trends: trendsResult,
        programDistribution: distributionResult,
        programDistributionGraph: programGraphResult,
      });
    } catch (error) {
      console.error('Dashboard API error:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
    return
  });



  /**
 * @swagger
 * /api/v1/applications/{referenceNumber}/full-details:
 *   get:
 *     summary: Get full application details including disabilities, education, work experience, etc.
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full application details retrieved successfully
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */
  router.get('/:referenceNumber/full-details', async (req, res) => {
    const { referenceNumber } = req.params;

    try {
        const [appResult] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );

        if (appResult.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const application = appResult[0];
        const applicationId = application.id;

        const [
            [disabilitiesResult],
            [personalDetailsResult],
            [nextOfKinResult],
            [tertiaryEducationResult],
            [workExperienceResult],
            [educationDetailsResult],
            [documentsResult]
        ] = await Promise.all([
            pool.query<RowDataPacket[]>('SELECT * FROM disabilities WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM personal_details WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM next_of_kin WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM tertiary_education WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM work_experience WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM education_details WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM documents WHERE application_id = ?', [applicationId])
        ]);

        // Attach subjects to each education record
        for (const edu of educationDetailsResult) {
            const [subjectsResult] = await pool.query<RowDataPacket[]>(
                'SELECT * FROM subjects WHERE education_id = ?',
                [edu.id]
            );
            edu.subjects = subjectsResult;
        }

        return res.status(200).json({
            referenceNumber: application.reference_number,
            startingSemester: application.starting_semester,
            satelliteCampus: application.satellite_campus,
            acceptedStatus: application.accepted_status,
            createdAt: application.created_at,
            fullApplication: {
                ...application,
                disabilities: disabilitiesResult,
                personalDetails: personalDetailsResult[0] || {},
                nextOfKin: nextOfKinResult[0] || {},
                tertiaryEducation: tertiaryEducationResult,
                workExperience: workExperienceResult,
                educationDetails: educationDetailsResult,
                documents: documentsResult
            }
        });
    } catch (error) {
        console.error('Error fetching application details:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * @swagger
 * /api/v1/applications:
 *   get:
 *     summary: Get all applications with optional filters
 *     tags: [Applications]
 *     parameters:
 *       - in: query
 *         name: reference_number
 *         schema:
 *           type: string
 *       - in: query
 *         name: starting_semester
 *         schema:
 *           type: string
 *       - in: query
 *         name: programme
 *         schema:
 *           type: string
 *       - in: query
 *         name: satellite_campus
 *         schema:
 *           type: string
 *       - in: query
 *         name: created_at
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: accepted_status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of applications
 *       500:
 *         description: Internal Server Error
 */

router.get('/', async (req, res) => {
    const {
        reference_number,
        starting_semester,
        programme,
        satellite_campus,
        created_at,
        accepted_status
    } = req.query;

    try {
        const filters: string[] = [];
        const values: any[] = [];

        if (reference_number) {
            filters.push('reference_number = ?');
            values.push(reference_number);
        }
        if (starting_semester) {
            filters.push('starting_semester = ?');
            values.push(starting_semester);
        }
        if (programme) {
            filters.push('programme = ?');
            values.push(programme);
        }
        if (satellite_campus) {
            filters.push('satellite_campus = ?');
            values.push(satellite_campus);
        }
        if (created_at) {
            filters.push('DATE(created_at) = ?');
            values.push(created_at);
        }
        if (accepted_status) {
            filters.push('accepted_status = ?');
            values.push(accepted_status);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
        const query = `SELECT * FROM applications ${whereClause} ORDER BY created_at DESC`;

        const [results] = await pool.query<RowDataPacket[]>(query, values);

        return res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching applications:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});


  

export default router;