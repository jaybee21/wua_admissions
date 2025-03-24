import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db';
import { User } from '../models/user';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { authenticateToken } from '../middleware/authenticateToken';
import { RowDataPacket } from 'mysql2';
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


export default router;