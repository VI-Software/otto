import express from 'express';
import database from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/health
 * Basic health check endpoint
 */
router.get('/', asyncHandler(async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'otto',
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  };

  // Test database connection
  try {
    await database.testConnection();
    health.database = 'connected';
  } catch (error) {
    health.status = 'warning';
    health.database = 'disconnected';
    health.databaseError = error.message;
  }

  // Check disk space for uploads directory
  try {
    const fs = await import('fs');
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const stats = fs.statSync(uploadDir);
    health.uploadsDirectory = 'accessible';
  } catch (error) {
    health.status = 'warning';
    health.uploadsDirectory = 'inaccessible';
    health.uploadsError = error.message;
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
}));

/**
 * GET /api/health/detailed
 * Detailed health check with system information
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'otto',
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      cpu: process.cpuUsage()
    }
  };

  // Test database connection with timing
  try {
    const start = Date.now();
    await database.testConnection();
    const duration = Date.now() - start;
    health.database = {
      status: 'connected',
      responseTime: `${duration}ms`
    };
  } catch (error) {
    health.status = 'warning';
    health.database = {
      status: 'disconnected',
      error: error.message
    };
  }

  // Check uploads directory with details
  try {
    const fs = await import('fs');
    const path = await import('path');
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const stats = fs.statSync(uploadDir);
    
    // Count files in upload directory
    const countFiles = (dir) => {
      let count = 0;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const itemStats = fs.statSync(itemPath);
        if (itemStats.isDirectory()) {
          count += countFiles(itemPath);
        } else {
          count++;
        }
      }
      return count;
    };

    health.uploadsDirectory = {
      status: 'accessible',
      path: uploadDir,
      fileCount: countFiles(uploadDir),
      created: stats.birthtime
    };
  } catch (error) {
    health.status = 'warning';
    health.uploadsDirectory = {
      status: 'inaccessible',
      error: error.message
    };
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
}));

export default router;
