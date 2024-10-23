import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();


const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306;
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: port, 
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000
});

// Handle connection errors
pool.getConnection()
  .then(connection => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(error => {
    console.error('Database connection error:', error);
  });

export default pool;
