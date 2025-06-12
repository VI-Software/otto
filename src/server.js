import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import logger from './config/logger.js';
import database from './config/database.js';
import uploadRoutes from './routes/upload.js';
import fileRoutes from './routes/files.js';
import publicRoutes from './routes/public.js';
import healthRoutes from './routes/health.js';
import HomeController from './controllers/HomeController.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
}));

// CORS configuration for internal services only
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or server-to-server)
    if (!origin) return callback(null, true);
    
    // Define allowed origins for internal services
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4000',
      // Add your internal service URLs here
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(requestLogger);

// Homepage
app.get('/', HomeController.home);
app.get('/stats', HomeController.stats);

// Core routes (no /api prefix)
app.use('/upload', uploadRoutes);
app.use('/files', fileRoutes);
app.use('/f', fileRoutes);
app.use('/public', publicRoutes);
app.use('/p', publicRoutes);
app.use('/health', healthRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection (but don't fail if it's not available)
    try {
      await database.testConnection();
      logger.info('Database connection established');
    } catch (dbError) {
      logger.warn('Database connection failed - server will start but database features will be unavailable', {
        error: dbError.message
      });    }

    const server = app.listen(PORT, () => {
      logger.info(`Otto file server running on port ${PORT}`);
      logger.info(`Homepage: http://localhost:${PORT}`);
      logger.info('Endpoints:');
      logger.info('  POST /upload - Upload files');
      logger.info('  GET  /files/{id} - Get file by ID');
      logger.info('  GET  /f/{id} - Short URL for files');
      logger.info('  GET  /public/{context}/{filename} - Public files');
      logger.info('  GET  /p/{context}/{filename} - Short URL for public files');
      logger.info('  GET  /stats - Server statistics');
      logger.info('  GET  /health - Health check');
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await database.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await database.close();
  process.exit(0);
});

startServer();

export default app;
