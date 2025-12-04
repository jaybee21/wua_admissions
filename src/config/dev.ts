import { commonConfig } from './common';
import { Config } from './types';

export const config: Config = {
  ...commonConfig,
  environment: 'development',
  database: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '@99!4@dm!n',
    database: process.env.DB_NAME || 'wua_admissions',
    port: parseInt(process.env.DB_PORT || '3306', 10),
  },
};


