import express, { Request, Response } from 'express';
import mysql from 'mysql2';
import axios from 'axios';

const app = express();
const port = 3000;

// MySQL connection pool
const db = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '@99!4@dm!n',
  database: 'mabharani',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Route to sync latest student from personal_details
app.get('/sync-latest-student', async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.promise().query<any[]>(
      `SELECT id, application_id, 
              CONCAT(first_names, ' ', surname) AS fullname, 
              LOWER(email) AS email, phone AS mobileno 
       FROM personal_details 
       WHERE paynow = 'N' 
       ORDER BY id DESC 
       LIMIT 1`
    );

    if (rows.length === 0) return res.send('No records to sync');

    const { id, application_id, fullname, email, mobileno } = rows[0];
    const studentnumber = String(application_id).toUpperCase();

    const auth = Buffer.from('wkashumba@wua.ac.zw:Common007!').toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
      'Accept': 'application/json'
    };

    // Check if student exists on Paynow
    const checkUrl = `https://billpay.paynow.co.zw/api/member/single/${studentnumber}`;
    const checkRes = await axios.get(checkUrl, { headers });
    const member = checkRes.data;

    const postData = new URLSearchParams({
      MemberNumber: studentnumber,
      FullName: fullname,
      EmailAddress: email,
      MobileNo: mobileno,
      AccountDetails: '',
      PostalAddress: ''
    });

    const isExisting = member.MemberNumber === studentnumber;
    const apiUrl = isExisting
      ? 'https://billpay.paynow.co.zw/api/Member/Update'
      : 'https://billpay.paynow.co.zw/api/Member/Create';

    const postRes = await axios.post(apiUrl, postData, {
      auth: { username: 'wkashumba@wua.ac.zw', password: 'Common007!' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    await db.promise().query(
      'UPDATE personal_details SET paynow = ? WHERE id = ?',
      ['Y', id]
    );

    return res.send({
      message: 'Student synced successfully',
      response: postRes.data
    });

  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error('Axios error:', error.response?.data || error.message);
    } else if (error instanceof Error) {
      console.error('Unexpected error:', error.message);
    } else {
      console.error('Unknown error:', error);
    }

    return res.status(500).send('An error occurred while syncing student.');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
