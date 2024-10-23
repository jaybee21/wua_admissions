import { config as devConfig } from './config/dev';
import { config as uatConfig } from './config/uat';
import { config as prodConfig } from './config/prod';
import { Config } from './config/types';

const environment = process.env.NODE_ENV || 'development';

let config: Config;

switch (environment) {
  case 'production':
    config = prodConfig;
    break;
  case 'uat':
    config = uatConfig;
    break;
  default:
    config = devConfig;
    break;
}

export default config;
