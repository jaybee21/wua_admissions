import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import exampleRoutes from './routes';
import userRoutes from './routes/user';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import http from 'http';
import config from './config'; 

dotenv.config();

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
app.use('/api/v1/users', userRoutes);

// Swagger configuration
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'WUA API Documentation',
      version: '1.0.0',
      description: 'API documentation for WUA Hr System',
    },
    servers: [
      {
        url: `http://localhost:${port}`, // Local server URL, will vary based on the environment
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // Adjust path if necessary
};

const swaggerDocs = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server setup
interface CustomWebSocket extends WebSocket {
  userRole?: string;
}

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  const customWs = ws as CustomWebSocket;
  const userRole = req.headers['user-role'] as string;
  customWs.userRole = userRole;

  ws.on('message', (message: WebSocket.Data) => {
    console.log(`Received message: ${message}`);
  });
});

// Start server
server.listen(port, () => {
  console.log(`Server is running in ${config.environment} mode on port ${port}`);
  console.log(`Swagger documentation available at http://localhost:${port}/api-docs`);
});
