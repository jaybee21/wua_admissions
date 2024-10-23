import nodemailer from 'nodemailer';
import { WebSocketServer, WebSocket } from 'ws';

// Define the custom type for WebSocket clients
interface CustomWebSocket extends WebSocket {
  userRole: string;
}

export const sendEmailNotification = async (emails: string[], subject: string, text: string) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email user and password must be set');
  }

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: emails.join(','),
    subject,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

export const sendAppNotification = (wss: WebSocketServer, message: string, role: string) => {
  wss.clients.forEach((client) => {
    if (isCustomWebSocket(client) && client.readyState === WebSocket.OPEN && client.userRole === role) {
      client.send(message);
    }
  });
};

function isCustomWebSocket(client: WebSocket): client is CustomWebSocket {
  return 'userRole' in client;
}