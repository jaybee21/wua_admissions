export interface DatabaseConfig {
    host: string;
    user: string;
    password: string;
    database: string;
    port: number;
  }
  
  export interface CommonConfig {
    port: number | string;
    email: {
      user: string;
      pass: string;
    };
    twilio: {
      accountSid: string;
      authToken: string;
      phoneNumber: string;
    };
  }
  
  export interface Config extends CommonConfig {
    environment: string;
    database: DatabaseConfig;
  }
  