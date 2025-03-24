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
 *     responses:
 *       201:
 *         description: Application created successfully
 *       500:
 *         description: Internal Server Error
 */

router.post('/', async (req, res) => {
    const { startingSemester, programme, satelliteCampus, preferredSession, wuaDiscoveryMethod, previousRegistration, yearOfCommencement } = req.body;
    
    try {
        const referenceNumber = Math.random().toString(36).substring(2, 10).toUpperCase(); 

        const [result] = await pool.query(
            'INSERT INTO applications (reference_number, starting_semester, programme, satellite_campus, preferred_session, wua_discovery_method, previous_registration, year_of_commencement) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [referenceNumber, startingSemester, programme, satelliteCampus, preferredSession, wuaDiscoveryMethod, previousRegistration, yearOfCommencement]
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
        'SELECT * FROM personal_details WHERE application_id = (SELECT id FROM applications WHERE reference_number = ?) AND surname LIKE ? AND YEAR(date_of_birth) = ?',
        [referenceNumber, `${surname}%`, yearOfBirth]
      );
  
      const rows = result as RowDataPacket[]; // Cast to RowDataPacket[]
  
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Application not found' });
      }
  
      return res.status(200).json({ message: 'Application found', data: rows[0] });
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
  
      const rows = appResult as RowDataPacket[]; // Cast to RowDataPacket[]
  
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
 *               qualificationType:
 *                 type: string
 *                 enum: [Ordinary Level, Other Secondary School Qualification, Advanced Level, Tertiary Education]
 *               examinationBoard:
 *                 type: string
 *               subjects:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     subjectName:
 *                       type: string
 *                     grade:
 *                       type: string
 *                     yearWritten:
 *                       type: integer
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
    const { qualificationType, examinationBoard, subjects, tertiaryEducation } = req.body;

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

        // Insert tertiary education (if provided)
        if (qualificationType === 'Tertiary Education' && tertiaryEducation) {
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




export default router;