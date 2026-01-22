import mysql from 'mysql2/promise';
import config from './config';

const pool = mysql.createPool({
  host: config.database.host,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  port: config.database.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 1000000,
});

pool.getConnection()
  .then((connection) => {
    console.log(`Database connected successfully to ${config.database.database} in ${config.environment} mode`);
    connection.release();
  })
  .catch((error) => {
    console.error('Database connection error:', error);
  });

export default pool;
