import nodemailer from 'nodemailer';
import { WebSocketServer, WebSocket } from 'ws';
import config from '../config'; // Import the environment-specific config

// Define the custom type for WebSocket clients
interface CustomWebSocket extends WebSocket {
  userRole: string;
}

// Send an email notification to multiple recipients
export const sendEmailNotification = async (emails: string[], subject: string, text: string) => {
  const { user: emailUser, pass: emailPass } = config.email;

  if (!emailUser || !emailPass) {
    throw new Error('Email user and password must be set in the configuration');
  }

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  const mailOptions = {
    from: emailUser,
    to: emails.join(','),
    subject,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to: ${emails.join(', ')}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

// Send a WebSocket message to clients with a specific role
export const sendAppNotification = (wss: WebSocketServer, message: string, role: string) => {
  wss.clients.forEach((client) => {
    if (isCustomWebSocket(client) && client.readyState === WebSocket.OPEN && client.userRole === role) {
      client.send(message);
      console.log(`Message sent to role ${role}: ${message}`);
    }
  });
};

// Type guard to check if a WebSocket is a CustomWebSocket
function isCustomWebSocket(client: WebSocket): client is CustomWebSocket {
  return 'userRole' in client;
}
