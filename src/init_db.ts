import pool from './db';

const createTables = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        firstName VARCHAR(50) NOT NULL,
        lastName VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL,
        mobileNumber VARCHAR(15) NOT NULL,
        idNumber VARCHAR(20) NOT NULL,
        department VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'accountant', 'sales') NOT NULL,
        isFirstLogin BOOLEAN NOT NULL DEFAULT true,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    connection.release();
  }
};

createTables();
