import express from 'express';
import UploadController from '../controllers/UploadController.js';
import { authenticate, authenticateService } from '../middleware/auth.js';
import { uploadMultiple, validateFileContents, handleUploadError } from '../middleware/upload.js';
import { uploadLimiter, authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * POST /api/upload/token
 * Generate upload token for frontend uploads
 * Requires service authentication
 */
router.post('/token', authLimiter, authenticateService, UploadController.generateUploadToken);

/**
 * POST /api/upload
 * Upload files (supports multiple authentication methods)
 * - Service token for backend-to-backend uploads
 * - Upload token for frontend uploads
 * - JWT token for user uploads
 */
router.post('/', 
  uploadLimiter,
  authenticate,
  uploadMultiple,
  handleUploadError,
  validateFileContents,
  UploadController.uploadFiles
);

/**
 * GET /api/upload/stats
 * Get upload statistics
 * Requires service authentication
 */
router.get('/stats', authenticateService, UploadController.getUploadStats);

/**
 * GET /api/upload/context/:context
 * Get files by upload context
 * Requires service authentication
 */
router.get('/context/:context', authenticateService, UploadController.getFilesByContext);

export default router;
