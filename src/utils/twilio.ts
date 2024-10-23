import twilio from 'twilio';
import nodemailer from 'nodemailer';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

export const sendSMS = async (to: string, body: string) => {
    try {
        const message = await client.messages.create({
            body,
            from: twilioPhoneNumber,
            to,
        });
        console.log(`SMS sent successfully: ${message.sid}`);
    } catch (error) {
        console.error('Failed to send SMS:', error);
        throw new Error('Failed to send SMS');
    }
};

async function sendEmail(recipient: string, subject: string, message: string) {
    const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipient,
        subject: subject,
        text: message
    };

    await transporter.sendMail(mailOptions);
}
