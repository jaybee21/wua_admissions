import { commonConfig } from './common';
import { Config } from './types';

export const config: Config = {
  ...commonConfig,
  environment: 'uat',
  database: {
    host: process.env.DB_HOST || '10.0.0.43',
    user: process.env.DB_USER || 'wua_user',
    password: process.env.DB_PASSWORD || '#pass123',
    database: process.env.DB_NAME || 'wua_job_board_uat',
    port: parseInt(process.env.DB_PORT || '3306', 10),
  },
};

