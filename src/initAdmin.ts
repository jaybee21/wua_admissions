import bcrypt from 'bcrypt';
import { User , UserRole } from './models/user';

// Example user repository
const users: User[] = [];

const createInitialAdmin = async () => {
  const adminExists = users.some(user => user.role === 'admin');

  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('initialAdminPassword', 10);
    const initialAdmin: User = {
      username: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      email: 'hillarysimanga@gmail.com',
      mobileNumber: '1234567890',
      idNumber: '0000',
      department: 'admin',
      password: hashedPassword,
      role: 'admin',
      isFirstLogin: true,
    };
    users.push(initialAdmin);
    console.log('Initial admin user created');
  } else {
    console.log('Admin user already exists');
  }
};

createInitialAdmin();
