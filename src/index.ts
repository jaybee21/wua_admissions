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


dotenv.config();

const app = express();
const port = process.env.PORT || 3000;


app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: 'Content-Type,Authorization'
}));


app.use(express.json());
app.use('/api', exampleRoutes);
app.use('/api/v1/users', userRoutes);



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
        url: 'http://localhost:${port}',
      },
    ],
  },
  apis: ['./src/routes/*.ts'], 
};

const swaggerDocs = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));


app.get('/', (req, res) => {
  res.send('Hello World!');
});


const server = http.createServer(app);


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


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Swagger documentation available at http://localhost:${port}/api-docs`);
});
