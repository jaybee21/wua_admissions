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
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - username
 *         - firstName
 *         - lastName
 *         - email
 *         - mobileNumber
 *         - idNumber
 *         - department
 *         - role
 *       properties:
 *         username:
 *           type: string
 *           example: "johndoe"
 *         firstName:
 *           type: string
 *           example: "John"
 *         lastName:
 *           type: string
 *           example: "Doe"
 *         email:
 *           type: string
 *           example: "johndoe@example.com"
 *         mobileNumber:
 *           type: string
 *           example: "+123456789"
 *         idNumber:
 *           type: string
 *           example: "1234567890"
 *         department:
 *           type: string
 *           example: "IT"
 *         role:
 *           type: string
 *           example: "admin"
 *         isFirstLogin:
 *           type: boolean
 *           example: true
 */
/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User created successfully
 *       500:
 *         description: Internal Server Error
 */

router.post('/', async (req, res) => {
  console.log('POST request to /api/v1/users received');
  const { username, firstName, lastName, email, mobileNumber, idNumber, department, role } = req.body;

  try {
   
    const hashedPassword = await bcrypt.hash('initialPassword', 10);

    
    await pool.query(
      'INSERT INTO users (username, firstName, lastName, email, mobileNumber, idNumber, department, password, role, isFirstLogin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [username, firstName, lastName, email, mobileNumber, idNumber, department, hashedPassword, role, true]
    );
    
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
      subject: 'Your account has been created',
      text: `Hello ${firstName},\n\nYour account has been created with the username: ${username}. Your initial password is: initialPassword\n\nPlease change your password upon first login.\n\nBest regards,\nWomens University in Africa`,
    };
    
    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
  
/**
 * @swagger
 * /api/v1/users/reset-password:
 *   post:
 *     summary: Reset user password
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 */
router.post('/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user: User | undefined = (rows as User[])[0];

    if (user) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = ?, isFirstLogin = false WHERE username = ?', [hashedPassword, username]);
      res.status(200).json({ message: 'Password reset successfully' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
/**
 * @swagger
 * /api/v1/users/login:
 *   post:
 *     summary: Login user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User logged in successfully
 *       401:
 *         description: Invalid username or password
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user: User | undefined = (rows as User[])[0];

    if (!user) {
      return res.status(401).send('Invalid username or password');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).send('Invalid username or password');
    }

    // Update lastLogin timestamp
    await pool.query('UPDATE users SET lastLogin = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign({
      userId: user.id,
      username: user.username,
      role: user.role,
      department: user.department,
      email: user.email,
      isFirstLogin: user.isFirstLogin,
    }, process.env.SECRET_KEY ?? 'default-secret-key', {
      expiresIn: '10h',
    });

    return res.status(200).send({ token });
  } catch (error) {
    console.error('Error logging in user:', error);
    return res.status(500).send('Internal Server Error');
  }
});
  /**
 * @swagger
 * /api/v1/users/{username}:
 *   get:
 *     summary: Get a user by username
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
  router.get('/:username', authenticateToken, async (req, res) => {
    const username = req.params.username;
    console.log(`Received request to find user with username: ${username}`);
  
    try {
      const query = `
        SELECT 
          id, 
          username, 
          firstName, 
          lastName, 
          email, 
          mobileNumber, 
          idNumber, 
          department, 
          role, 
          isFirstLogin, 
          lastLogin 
        FROM users 
        WHERE username = ?`;
      const [rows] = await pool.query<RowDataPacket[]>(query, [username]);
  
      if (rows.length > 0) {
        const user = rows[0];
        console.log(`User found: ${JSON.stringify(user)}`);
        res.status(200).json({
          ...user,
          lastLogin: user.lastLogin.toLocaleString(), 
        });
      } else {
        console.log('User not found');
        res.status(404).send('User not found');
      }
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  /**
 * @swagger
 * /api/v1/users/id/{id}:
 *   get:
 *     summary: Get a user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User found
 *       404:
 *         description: User not found
 */
  router.get('/id/:id', authenticateToken, async (req, res) => {
    const id = req.params.id;
    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
      const user: User | undefined = (rows as User[])[0];
      if (user) {
        res.status(200).send(user);
      } else {
        res.status(404).send('User not found');
      }
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  /**
   * @swagger
   * /api/v1/users/{id}:
   *   patch:
   *     summary: Update a user
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/User'
   *     responses:
   *       200:
   *         description: User updated successfully
   *       404:
   *         description: User not found
   */
  router.patch('/:id',authenticateToken, async (req, res) => {
    const id = req.params.id;
    const { username, firstName, lastName, email, mobileNumber, idNumber, department, role } = req.body;
    try {
      await pool.query(
        'UPDATE users SET username = ?, firstName = ?, lastName = ?, email = ?, mobileNumber = ?, idNumber = ?, department = ?, role = ? WHERE id = ?',
        [username, firstName, lastName, email, mobileNumber, idNumber, department, role, id]
      );
      res.status(200).json({ message: 'User updated successfully' });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  /**
   * @swagger
   * /api/v1/users/{id}:
   *   delete:
   *     summary: Delete a user
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: User deleted successfully
   *       404:
   *         description: User not found
   */
  router.delete('/:id',authenticateToken, async (req, res) => {
    const id = req.params.id;
    try {
      await pool.query('DELETE FROM users WHERE id = ?', [id]);
      res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  /**
 * @swagger
 * /api/v1/users/all-users/all:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/all-users/all', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users');
    const users: User[] = rows as User[];
    res.status(200).send(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
