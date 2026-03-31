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

const uuid = require('uuid');

router.post('/', async (req, res) => {
    console.log('Received POST request to create application');

    const {
        startingSemester,
        programme,
        satelliteCampus,
        preferredSession,
        wuaDiscoveryMethod,
        previousRegistration,
        yearOfCommencement,
        programType
    } = req.body;

    console.log('Request body:', req.body);

    try {
        let referenceNumber;
        let attempts = 0;

        console.log('Generating unique reference number...');
        do {
            referenceNumber = `APL${uuid.v4().slice(0, 8).toUpperCase()}`;
            console.log(`Attempt ${++attempts}: Trying reference number ${referenceNumber}`);
            
            const [existingApp] = await pool.query<RowDataPacket[]>(
                'SELECT 1 FROM applications WHERE reference_number = ?',
                [referenceNumber]
            );
            if (existingApp.length > 0) {
                console.log('Reference number already exists, generating a new one...');
                referenceNumber = null;
            } else {
                console.log('Reference number is unique.');
            }
        } while (!referenceNumber);

        console.log('Inserting application into database...');
        const [result] = await pool.query(
            `INSERT INTO applications 
            (reference_number, starting_semester, programme, satellite_campus, preferred_session, wua_discovery_method, previous_registration, program_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [referenceNumber, startingSemester, programme, satelliteCampus, preferredSession, wuaDiscoveryMethod, previousRegistration, programType]
        );

        console.log('Application inserted successfully:', result);
        res.status(201).json({ message: 'Application created', referenceNumber });
    } catch (error) {
        console.error('Error while creating application:', error);
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
 * /api/v1/applications/programmes:
 *   get:
 *     summary: Get all programme names with everything including the id
 *     tags: [Programmes]
 *     responses:
 *       200:
 *         description: List of programmes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   department_id:
 *                     type: integer
 *                   studycode:
 *                     type: string
 *                   programme_name:
 *                     type: string
 *       500:
 *         description: Internal Server Error
 */
router.get('/programmes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, department_id, studycode, programme_name FROM programme'
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching programmes:', error);
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
    { name: 'proposal', maxCount: 1 },
    { name: 'applicationFee', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'identityCard', maxCount: 1 }
]), async (req, res) => {
    const { referenceNumber } = req.params;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    try {
        // 1. Check if the application exists
        const [appResult] = await pool.query(
            'SELECT id, program_type FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );
        const rows = appResult as RowDataPacket[];
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }
        const applicationId = rows[0].id;
        const programType = rows[0].program_type;

        // 2. Check if all required documents are present
        const requiredDocs = [
            'academicCertificate',
            'professionalCertificate',
            'applicationFee',
            'birthCertificate',
            'identityCard'
        ];
        if (programType === 'PhD') requiredDocs.push('proposal');

        for (const doc of requiredDocs) {
            if (!files[doc]) {
                return res.status(400).json({ message: `Missing required document: ${doc}` });
            }
        }

        // 3. Insert documents into the database
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

        // 4. Fetch full name and email from personal_details
        const [userResult] = await pool.query<RowDataPacket[]>(
            'SELECT CONCAT(first_names, " ", surname) AS full_name, email FROM personal_details pd JOIN applications a ON pd.application_id = a.id WHERE a.reference_number = ?',
            [referenceNumber]
        );
        
        const userRows = userResult as RowDataPacket[];
        if (userRows.length > 0) {
            const { full_name, email } = userRows[0];

            // 5. Send Email
            const transporter = nodemailer.createTransport({
                host: 'smtp-mail.outlook.com',
                port: 587,
                secure: false,
                auth: {
                    user: config.email.user,
                    pass: config.email.pass
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            const mailOptions = {
                from: config.email.user,
                to: email,
                subject: 'Your Application Has Been Received',
                text: `Dear ${full_name},\n\nWe have received your application.\n\nThis is your reference number: ${referenceNumber}.\n\nYou can check your application status by visiting:\nhttps://apply.wua.ac.zw/apply-online/application-status\n\nAlso, check your email for our response.\n\nRegards,\nWomen's University in Africa`
            };

            await transporter.sendMail(mailOptions);
        }

        return res.status(201).json({ message: 'Documents uploaded and email sent successfully' });

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
          endOfCurrent.setDate(endOfCurrent.getDate() + 6); 
          endOfCurrent.setHours(23, 59, 59, 999);
          previous.setDate(current.getDate() - 7);
          previous.setHours(0, 0, 0, 0);
        } else {
          current.setDate(1);
          current.setHours(0, 0, 0, 0);
          endOfCurrent = new Date(current);
          endOfCurrent.setMonth(endOfCurrent.getMonth() + 1);
          endOfCurrent.setDate(0);
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
 * /api/v1/applications/drafts:
 *   get:
 *     summary: Get unsubmitted application drafts
 *     tags: [Applications]
 *     responses:
 *       200:
 *         description: List of unsubmitted drafts
 *       500:
 *         description: Internal Server Error
 */
router.get('/drafts', async (_req: Request, res: Response) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT
                id,
                reference_number,
                draft_json,
                email,
                surname,
                forenames,
                status,
                reference_email_sent_at,
                created_at,
                updated_at,
                submitted_at
             FROM application_drafts
             WHERE status = 'DRAFT' AND submitted_at IS NULL
             ORDER BY updated_at DESC`
        );

        const drafts = rows.map((row) => {
            let parsedDraftJson: unknown = null;
            try {
                parsedDraftJson = row.draft_json ? JSON.parse(String(row.draft_json)) : null;
            } catch {
                parsedDraftJson = row.draft_json;
            }

            return {
                id: row.id,
                referenceNumber: row.reference_number,
                email: row.email,
                surname: row.surname,
                forenames: row.forenames,
                status: row.status,
                referenceEmailSentAt: row.reference_email_sent_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                submittedAt: row.submitted_at,
                draftJson: parsedDraftJson,
            };
        });

        return res.status(200).json({
            count: drafts.length,
            drafts,
        });
    } catch (error) {
        console.error('Error fetching application drafts:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});


/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/reject:
 *   patch:
 *     summary: Reject an application
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application rejected successfully
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal Server Error
 */
const rejectApplication = async (req: Request, res: Response) => {
    const { referenceNumber } = req.params;

    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT id, accepted_status FROM applications WHERE reference_number = ?',
            [referenceNumber]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const application = rows[0];

        if (application.accepted_status === 'rejected') {
            return res.status(200).json({ message: 'Application already rejected' });
        }

        await pool.query(
            'UPDATE applications SET accepted_status = ? WHERE id = ?',
            ['rejected', application.id]
        );

        return res.status(200).json({
            message: 'Application rejected successfully',
            referenceNumber,
            acceptedStatus: 'rejected',
        });
    } catch (error) {
        console.error('Error rejecting application:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};

router.patch('/:referenceNumber/reject', rejectApplication);
router.post('/:referenceNumber/reject', rejectApplication);

type OfferLetterRow = RowDataPacket & {
    id: number;
    application_id: number;
    reference_number: string;
    student_number: string;
    file_name: string;
    file_path: string;
    created_at: string;
    latest: 0 | 1;
    verification_code: string | null;
};

type OfferLetterResponseRow = RowDataPacket & {
    id: number;
    offer_letter_id: number;
    application_id: number;
    reference_number: string;
    student_number: string;
    decision: 'accepted' | 'declined';
    decided_at: string;
};

type OfferLetterSignedUploadRow = RowDataPacket & {
    id: number;
    offer_letter_id: number;
    application_id: number;
    reference_number: string;
    student_number: string;
    file_name: string;
    file_path: string;
    mime_type: string;
    file_size: number | null;
    created_at: string;
};

const safeTableMissing = (error: any) => {
    // MySQL ER_NO_SUCH_TABLE = 1146
    return Number(error?.errno) === 1146 || String(error?.code || '') === 'ER_NO_SUCH_TABLE';
};

const resolveUploadsDiskPath = (publicOrStoredPath: string) => {
    const candidate = path.join(process.cwd(), String(publicOrStoredPath || '').replace(/^\//, ''));
    const resolved = path.resolve(candidate);
    const uploadsRoot = path.resolve(path.join(process.cwd(), 'uploads'));
    if (!resolved.startsWith(uploadsRoot)) return null;
    return resolved;
};

const getLatestOfferLetterForApplication = async (applicationId: number) => {
    const [rows] = await pool.query<OfferLetterRow[]>(
        `SELECT *
         FROM offer_letters
         WHERE application_id = ? AND latest = 1
         ORDER BY created_at DESC
         LIMIT 1`,
        [applicationId],
    );
    return rows[0] || null;
};

const getLatestOfferLetterForReferenceAndCode = async (referenceNumber: string, verificationCode: string) => {
    const [rows] = await pool.query<OfferLetterRow[]>(
        `SELECT *
         FROM offer_letters
         WHERE reference_number = ? AND latest = 1 AND verification_code = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [referenceNumber, verificationCode],
    );
    return rows[0] || null;
};

const OFFER_LETTER_RESPONSES_TABLE = 'offer_letter_responses';
const OFFER_LETTER_SIGNED_UPLOADS_TABLE = 'offer_letter_signed_uploads';

const getOfferLetterResponse = async (offerLetterId: number) => {
    try {
        const [rows] = await pool.query<OfferLetterResponseRow[]>(
            `SELECT *
             FROM ${OFFER_LETTER_RESPONSES_TABLE}
             WHERE offer_letter_id = ?
             ORDER BY decided_at DESC
             LIMIT 1`,
            [offerLetterId],
        );
        return rows[0] || null;
    } catch (error) {
        if (safeTableMissing(error)) return null;
        throw error;
    }
};

const getLatestSignedOfferLetterUpload = async (offerLetterId: number) => {
    try {
        const [rows] = await pool.query<OfferLetterSignedUploadRow[]>(
            `SELECT *
             FROM ${OFFER_LETTER_SIGNED_UPLOADS_TABLE}
             WHERE offer_letter_id = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [offerLetterId],
        );
        return rows[0] || null;
    } catch (error) {
        if (safeTableMissing(error)) return null;
        throw error;
    }
};


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
            [academicSummaryResult],
            [uploadsResult]
        ] = await Promise.all([
            pool.query<RowDataPacket[]>('SELECT * FROM disabilities WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM personal_details WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM next_of_kin WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM application_academic_summary WHERE application_id = ?', [applicationId]),
            pool.query<RowDataPacket[]>('SELECT * FROM application_uploads WHERE application_id = ?', [applicationId])
        ]);

        let offerLetter: OfferLetterRow | null = null;
        let offerLetterResponse: OfferLetterResponseRow | null = null;
        let signedOfferLetter: OfferLetterSignedUploadRow | null = null;

        if (String(application.accepted_status || '').toLowerCase() === 'accepted') {
            try {
                offerLetter = await getLatestOfferLetterForApplication(applicationId);
                if (offerLetter?.id) {
                    offerLetterResponse = await getOfferLetterResponse(offerLetter.id);
                    signedOfferLetter = await getLatestSignedOfferLetterUpload(offerLetter.id);
                }
            } catch (error) {
                console.warn('Offer letter lookup failed:', error);
            }
        }

        return res.status(200).json({
            referenceNumber: application.reference_number,
            starting_semester: application.starting_semester,
            startingSemester: application.starting_semester,
            satelliteCampus: application.satellite_campus,
            acceptedStatus: application.accepted_status,
            createdAt: application.created_at,
            fullApplication: {
                ...application,
                startingSemester: application.starting_semester,
                disabilities: disabilitiesResult,
                personalDetails: personalDetailsResult[0] || {},
                nextOfKin: nextOfKinResult[0] || {},
                academicSummary: academicSummaryResult[0] || {},
                uploads: uploadsResult,
                offerLetter: offerLetter
                    ? {
                          id: offerLetter.id,
                          studentNumber: offerLetter.student_number,
                          fileName: offerLetter.file_name,
                          filePath: offerLetter.file_path,
                          createdAt: offerLetter.created_at,
                          latest: offerLetter.latest === 1,
                          // For students (no login): use these endpoints with verificationCode
                          downloadUrl: `/api/v1/applications/${encodeURIComponent(
                              application.reference_number,
                          )}/offer-letter/download?code=${encodeURIComponent(
                              offerLetter.verification_code || '',
                          )}`,
                          respondUrl: `/api/v1/applications/${encodeURIComponent(
                              application.reference_number,
                          )}/offer-letter/respond`,
                          signedUploadUrl: `/api/v1/applications/${encodeURIComponent(
                              application.reference_number,
                          )}/offer-letter/signed-upload`,
                          response: offerLetterResponse
                              ? {
                                    decision: offerLetterResponse.decision,
                                    decidedAt: offerLetterResponse.decided_at,
                                }
                              : null,
                          signedUpload: signedOfferLetter
                              ? {
                                    fileName: signedOfferLetter.file_name,
                                    filePath: signedOfferLetter.file_path,
                                    mimeType: signedOfferLetter.mime_type,
                                    fileSize: signedOfferLetter.file_size,
                                    createdAt: signedOfferLetter.created_at,
                                    downloadUrl: `/api/v1/applications/${encodeURIComponent(
                                        application.reference_number,
                                    )}/offer-letter/signed-download?code=${encodeURIComponent(
                                        offerLetter.verification_code || '',
                                    )}`,
                                }
                              : null,
                      }
                    : null,
            }
        });
    } catch (error) {
        console.error('Error fetching application details:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/offer-letter/download:
 *   get:
 *     summary: Download the latest offer letter (student, via verification code)
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer letter PDF downloaded
 *       400:
 *         description: Missing code
 *       404:
 *         description: Offer letter not found
 */
router.get('/:referenceNumber/offer-letter/download', async (req: Request, res: Response) => {
    const { referenceNumber } = req.params;
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ message: 'Verification code is required' });

    try {
        const offerLetter = await getLatestOfferLetterForReferenceAndCode(referenceNumber, code);
        if (!offerLetter) return res.status(404).json({ message: 'Offer letter not found' });

        const diskPath = resolveUploadsDiskPath(offerLetter.file_path);
        if (!diskPath || !fs.existsSync(diskPath)) {
            return res.status(404).json({ message: 'Offer letter file missing on server' });
        }

        const fileName = typeof offerLetter.file_name === 'string' && offerLetter.file_name.trim() ? offerLetter.file_name : null;
        return fileName ? res.download(diskPath, fileName) : res.download(diskPath);
    } catch (error) {
        console.error('Offer letter student download error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/offer-letter/respond:
 *   post:
 *     summary: Accept or decline the latest offer letter (student, via verification code)
 *     tags: [Applications]
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
 *             required: [decision, verificationCode]
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [accepted, declined]
 *               verificationCode:
 *                 type: string
 *               skillsOfLifeChoice1:
 *                 type: string
 *                 description: First skills of life subject choice
 *               skillsOfLifeChoice2:
 *                 type: string
 *                 description: Second skills of life subject choice
 *     responses:
 *       201:
 *         description: Offer response stored
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Offer letter not found
 */
router.post('/:referenceNumber/offer-letter/respond', async (req: Request, res: Response) => {
    const { referenceNumber } = req.params;
    const decision = String(req.body?.decision || '').toLowerCase();
    const verificationCode = String(req.body?.verificationCode || req.body?.code || '').trim();
    const skillsOfLifeChoice1 = String(req.body?.skillsOfLifeChoice1 || '').trim() || null;
    const skillsOfLifeChoice2 = String(req.body?.skillsOfLifeChoice2 || '').trim() || null;

    if (!verificationCode) return res.status(400).json({ message: 'verificationCode is required' });
    if (decision !== 'accepted' && decision !== 'declined') {
        return res.status(400).json({ message: 'decision must be accepted or declined' });
    }

    // Only require skills of life choices when accepting
    if (decision === 'accepted') {
        if (!skillsOfLifeChoice1 || !skillsOfLifeChoice2) {
            return res.status(400).json({ message: 'Both skills of life choices are required when accepting' });
        }
        if (skillsOfLifeChoice1.toLowerCase() === skillsOfLifeChoice2.toLowerCase()) {
            return res.status(400).json({ message: 'Skills of life choices must be different' });
        }
    }

    try {
        const offerLetter = await getLatestOfferLetterForReferenceAndCode(referenceNumber, verificationCode);
        if (!offerLetter) return res.status(404).json({ message: 'Offer letter not found' });

        try {
            await pool.query(
                `INSERT INTO ${OFFER_LETTER_RESPONSES_TABLE}
                 (offer_letter_id, application_id, reference_number, student_number, decision,
                  skills_of_life_choice_1, skills_of_life_choice_2,
                  decided_at, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
                [
                    offerLetter.id,
                    offerLetter.application_id,
                    offerLetter.reference_number,
                    offerLetter.student_number,
                    decision,
                    skillsOfLifeChoice1,
                    skillsOfLifeChoice2,
                    req.ip ?? null,
                    req.headers['user-agent'] ?? null,
                ],
            );
        } catch (error) {
            if (safeTableMissing(error)) {
                return res.status(500).json({
                    message: `Missing DB table '${OFFER_LETTER_RESPONSES_TABLE}'. Create it to store accept/decline responses.`,
                });
            }
            throw error;
        }

        return res.status(201).json({
            message: 'Offer response saved',
            referenceNumber: offerLetter.reference_number,
            studentNumber: offerLetter.student_number,
            decision,
            skillsOfLifeChoice1,
            skillsOfLifeChoice2,
        });
    } catch (error) {
        console.error('Offer letter respond error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

// /**
//  * @swagger
//  * /api/v1/applications/{referenceNumber}/offer-letter/signed-upload:
//  *   post:
//  *     summary: Upload signed/scanned offer letter (student, via verification code)
//  *     tags: [Applications]
//  *     parameters:
//  *       - in: path
//  *         name: referenceNumber
//  *         required: true
//  *         schema:
//  *           type: string
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         multipart/form-data:
//  *           schema:
//  *             type: object
//  *             required: [verificationCode, signedOfferLetter]
//  *             properties:
//  *               verificationCode:
//  *                 type: string
//  *               signedOfferLetter:
//  *                 type: string
//  *                 format: binary
//  *     responses:
//  *       201:
//  *         description: Signed offer letter uploaded
//  *       400:
//  *         description: Invalid input
//  *       404:
//  *         description: Offer letter not found
//  */
// router.post(
//     '/:referenceNumber/offer-letter/signed-upload',
//     signedOfferLetterUpload.single('signedOfferLetter'),
//     async (req: Request, res: Response) => {
//         const { referenceNumber } = req.params;
//         const verificationCode = String(req.body?.verificationCode || req.body?.code || '').trim();

//         try {
//             if (!verificationCode) {
//                 if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
//                 return res.status(400).json({ message: 'verificationCode is required' });
//             }
//             if (!req.file) {
//                 return res
//                     .status(400)
//                     .json({ message: 'signedOfferLetter file is required (field name: signedOfferLetter)' });
//             }

//             const offerLetter = await getLatestOfferLetterForReferenceAndCode(referenceNumber, verificationCode);
//             if (!offerLetter) {
//                 if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
//                 return res.status(404).json({ message: 'Offer letter not found' });
//             }

//             const publicPath = `/uploads/signed-offer-letters/${req.file.filename}`;

//             try {
//                 await pool.query(
//                     `INSERT INTO ${OFFER_LETTER_SIGNED_UPLOADS_TABLE}
//                      (offer_letter_id, application_id, reference_number, student_number, file_name, file_path, mime_type, file_size, created_at)
//                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
//                     [
//                         offerLetter.id,
//                         offerLetter.application_id,
//                         offerLetter.reference_number,
//                         offerLetter.student_number,
//                         req.file.filename,
//                         publicPath,
//                         req.file.mimetype,
//                         req.file.size,
//                     ],
//                 );
//             } catch (error) {
//                 if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
//                 if (safeTableMissing(error)) {
//                     return res.status(500).json({
//                         message:
//                             `Missing DB table '${OFFER_LETTER_SIGNED_UPLOADS_TABLE}'. Create it to store signed offer letter uploads.`,
//                     });
//                 }
//                 throw error;
//             }

//             return res.status(201).json({
//                 message: 'Signed offer letter uploaded',
//                 referenceNumber: offerLetter.reference_number,
//                 studentNumber: offerLetter.student_number,
//                 filePath: publicPath,
//             });
//         } catch (error: any) {
//             if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
//             console.error('Signed offer letter upload error:', error);
//             return res.status(500).json({ message: error?.message || 'Internal Server Error' });
//         }
//     },
// );

/**
 * @swagger
 * /api/v1/applications/{referenceNumber}/offer-letter/signed-download:
 *   get:
 *     summary: Download latest uploaded signed offer letter
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: referenceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Signed offer letter file downloaded
 *       404:
 *         description: Not found
 */
router.get('/:referenceNumber/offer-letter/signed-download', async (req: Request, res: Response) => {
    const { referenceNumber } = req.params;

    try {
        const [rows]: any = await pool.query(
            `SELECT * FROM offer_letter_signed_uploads 
             WHERE reference_number = ? 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [referenceNumber]
        );

        const latestSigned = rows?.[0] ?? null;
        if (!latestSigned) return res.status(404).json({ message: 'Signed offer letter not uploaded yet' });

        const diskPath = resolveUploadsDiskPath(latestSigned.file_path);
        if (!diskPath || !fs.existsSync(diskPath)) {
            return res.status(404).json({ message: 'Signed offer letter file missing on server' });
        }

        const fileName = typeof latestSigned.file_name === 'string' && latestSigned.file_name.trim() ? latestSigned.file_name : null;
        return fileName ? res.download(diskPath, fileName) : res.download(diskPath);
    } catch (error) {
        console.error('Signed offer letter download error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});
/**
 * @swagger
 * /api/v1/applications/admin/offer-letter/responses:
 *   get:
 *     summary: Admin list of latest offer letter responses (accepted/declined)
 *     tags: [Applications]
 *     responses:
 *       200:
 *         description: Offer responses list
 */
router.get('/admin/offer-letter/responses', authenticateToken, async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT
                r.id,
                r.reference_number,
                r.student_number,
                r.decision,
                r.skills_of_life_choice_1,
                r.skills_of_life_choice_2,
                r.decided_at,
                pd.first_names,
                pd.surname,
                a.programme,
                a.starting_semester,
                a.satellite_campus
             FROM ${OFFER_LETTER_RESPONSES_TABLE} r
             LEFT JOIN applications a ON a.id = r.application_id
             LEFT JOIN personal_details pd ON pd.application_id = r.application_id
             ORDER BY r.decided_at DESC
             LIMIT 1000`,
        );
        return res.status(200).json(rows);
    } catch (error) {
        if (safeTableMissing(error)) {
            return res.status(500).json({
                message:
                    `Missing DB table '${OFFER_LETTER_RESPONSES_TABLE}'. Create it to view offer acceptances/declines.`,
            });
        }
        console.error('Admin offer responses error:', error);
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
 *         description: List of applications with paynow status and application fee amount
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   paynow_status:
 *                     type: string
 *                     enum: [yes, no]
 *                     nullable: true
 *                   application_fee_amount:
 *                     type: number
 *                     format: float
 *                     nullable: true
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
            filters.push('a.reference_number = ?');
            values.push(reference_number);
        }
        if (starting_semester) {
            filters.push('a.starting_semester = ?');
            values.push(starting_semester);
        }
        if (programme) {
            filters.push('a.programme = ?');
            values.push(programme);
        }
        if (satellite_campus) {
            filters.push('a.satellite_campus = ?');
            values.push(satellite_campus);
        }
        if (created_at) {
            filters.push('DATE(a.created_at) = ?');
            values.push(created_at);
        }
        if (accepted_status) {
            filters.push('a.accepted_status = ?');
            values.push(accepted_status);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

        const query = `
            SELECT 
                a.*, 
                a.starting_semester AS startingSemester,
                CASE 
                    WHEN p.paynow = 'Y' THEN 'yes' 
                    WHEN p.paynow = 'N' THEN 'no' 
                    ELSE NULL 
                END AS paynow_status,
                p.application_fee_amount
            FROM applications a
            LEFT JOIN personal_details p ON a.id = p.application_id
            ${whereClause}
            ORDER BY a.created_at DESC
        `;

        const [results] = await pool.query<RowDataPacket[]>(query, values);

        return res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching applications:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});



/**
 * @swagger
 * /api/v1/applications/download:
 *   get:
 *     summary: Download a document by filename
 *     tags: [Documents]
 *     parameters:
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The filename of the document to download
 *     responses:
 *       200:
 *         description: File downloaded
 *       400:
 *         description: Missing or invalid file path
 *       404:
 *         description: File not found
 *       500:
 *         description: Internal Server Error
 */
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'documents');
const UPLOADS_ROOT_DIR = path.join(process.cwd(), 'uploads');
const EXTRA_UPLOADS_ROOTS = (process.env.UPLOADS_ROOTS || '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

router.get('/download', async (req, res) => {
    const { path: requestedPath } = req.query;

    if (!requestedPath || typeof requestedPath !== 'string') {
        return res.status(400).json({ message: 'Missing or invalid file path' });
    }

    const fileName = path.basename(requestedPath);

    const resolveStoredPath = (storedPath: string) => {
        if (!storedPath) return null;
        const normalized = storedPath.replace(/\\/g, '/');
        const candidate = path.isAbsolute(storedPath)
            ? storedPath
            : path.join(process.cwd(), normalized.replace(/^\//, ''));
        const resolved = path.resolve(candidate);
        const allowedRoots = [UPLOADS_ROOT_DIR, ...EXTRA_UPLOADS_ROOTS.map((p) => path.resolve(p))];
        if (!allowedRoots.some((root) => resolved.startsWith(root))) return null;
        return resolved;
    };

    try {
        // 1) If caller passes a full stored_path (e.g., /uploads/...), try it
        let filePath = resolveStoredPath(requestedPath);

        // 2) If not found, try DB lookup by stored_name or stored_path ending with filename
        if (!filePath || !fs.existsSync(filePath)) {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT stored_path 
                 FROM application_uploads 
                 WHERE stored_name = ? OR stored_path LIKE ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [fileName, `%/${fileName}`]
            );
            if (rows.length > 0) {
                const storedPath = String(rows[0].stored_path || '');
                filePath = resolveStoredPath(storedPath);
            }
        }

        // 3) Backwards compatibility: uploads/documents
        if (!filePath || !fs.existsSync(filePath)) {
            const legacyPath = path.join(UPLOADS_DIR, fileName);
            if (fs.existsSync(legacyPath)) {
                filePath = legacyPath;
            }
        }

        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found' });
        }

        return res.download(filePath);
    } catch (error) {
        console.error('Error downloading file:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});




  

export default router;
