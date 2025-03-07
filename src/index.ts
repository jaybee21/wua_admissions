import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import exampleRoutes from './routes';
import userRoutes from './routes/user';
import { WebSocketServer } from 'ws';
import http from 'http';
import config from './config'; 



// Load the appropriate .env file based on NODE_ENV
const envFile = `.env.${process.env.NODE_ENV}`;
dotenv.config({ path: envFile });

const app = express();
const port = config.port || 3000;

// Set up CORS
app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: 'Content-Type,Authorization',
}));

// Middleware for JSON parsing
app.use(express.json());

// Set up routes
app.use('/api', exampleRoutes);

// Add user routes with environment-specific paths
app.use(`${getEnvironmentPath(config.environment)}/api/v1/users`, userRoutes);




// Function to determine path based on environment
function getEnvironmentPath(environment: string): string {
  switch (environment) {
    case 'development':
      return '/dev';
    case 'uat':
      return '/uat';
    case 'production':
      return '/prod';
    default:
      return '';
  }
}

// Get the environment path for Swagger documentation
const environmentPath = getEnvironmentPath(config.environment);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WUA API Documentation',
      version: '1.0.0',
      description: 'API documentation for WUA admissions System',
    },
    servers: [
      {
        url: `http://localhost:${port}${environmentPath}`, 
      },
    ],
  },
  apis: ['./src/routes/*.ts'], 
};

// Generate Swagger docs
const swaggerDocs = swaggerJSDoc(swaggerOptions);
app.use(`${environmentPath}/api-docs`, swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server setup
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  ws.on('message', (message) => {
    console.log(`Received message: ${message}`);
  });
});

// Start server
server.listen(port, () => {
  console.log(`Server is running in ${config.environment} mode on port ${port}`);
  console.log(`Swagger documentation available at http://localhost:${port}${environmentPath}/api-docs`);
});
