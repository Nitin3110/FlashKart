import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.routes';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Mount API endpoints
  app.use('/api', apiRoutes);

  // Mount direct endpoints matching assessment spec exactly:
  // POST /cart/reserve and POST /order/checkout
  app.use(apiRoutes);

  return app;
};
