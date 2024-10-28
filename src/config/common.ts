export const commonConfig = {
    port: process.env.PORT || 3000,
    email: {
      user: process.env.EMAIL_USER || 'noreply@wua.ac.zw',
      pass: process.env.EMAIL_PASS || '#pass123',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACb600edb852e9f28720745a3d61dbebed',
      authToken: process.env.TWILIO_AUTH_TOKEN || '12c53724759589c8e03f2f82d58647f6',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+16075233987',
    },
  };
  