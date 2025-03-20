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
//this is the api for beginning student applications 
router.post('/applications', async (req, res) => {
    const { startingSemester, programme, satelliteCampus, preferredSession, wuaDiscoveryMethod, previousRegistration } = req.body;
    
    try {
        const referenceNumber = Math.random().toString(36).substring(2, 10).toUpperCase(); 

        const [result] = await pool.query(
            'INSERT INTO applications (reference_number, starting_semester, programme, satellite_campus, preferred_session, wua_discovery_method, previous_registration) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [referenceNumber, startingSemester, programme, satelliteCampus, preferredSession, wuaDiscoveryMethod, previousRegistration]
        );

        res.status(201).json({ message: 'Application created', referenceNumber });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


export default router;