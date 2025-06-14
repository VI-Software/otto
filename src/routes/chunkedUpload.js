import express from 'express';
import ChunkedUploadController from '../controllers/ChunkedUploadController.js';
import { authenticate } from '../middleware/auth.js';
import { uploadLimiter, strictUploadLimiter } from '../middleware/rateLimiter.js';
import { 
  uploadSingleChunk, 
  handleChunkUploadError, 
  validateChunkParams,
  validateSessionInit 
} from '../middleware/chunkUpload.js';

const router = express.Router();

/**
 * GET /api/upload/chunk/config
 * Get chunked upload configuration
 * No authentication required for config endpoint
 */
router.get('/config', ChunkedUploadController.getConfig);

/**
 * POST /api/upload/chunk/init
 * Initialize a chunked upload session
 * Supports same authentication methods as regular upload
 */
router.post('/init', 
  uploadLimiter,
  authenticate,
  validateSessionInit,
  ChunkedUploadController.initializeUpload
);

/**
 * POST /api/upload/chunk/:sessionId/:chunkIndex
 * Upload a single chunk
 * Uses stricter rate limiting since chunks are uploaded frequently
 */
router.post('/:sessionId/:chunkIndex',
  strictUploadLimiter,
  authenticate,
  validateChunkParams,
  uploadSingleChunk,
  handleChunkUploadError,
  ChunkedUploadController.uploadChunk
);

/**
 * GET /api/upload/chunk/:sessionId/status
 * Get upload session status and missing chunks
 */
router.get('/:sessionId/status',
  uploadLimiter,
  authenticate,
  ChunkedUploadController.getSessionStatus
);

/**
 * POST /api/upload/chunk/:sessionId/complete
 * Complete chunked upload (assemble final file)
 */
router.post('/:sessionId/complete',
  uploadLimiter,
  authenticate,
  ChunkedUploadController.completeUpload
);

/**
 * DELETE /api/upload/chunk/:sessionId
 * Cancel upload session and cleanup
 */
router.delete('/:sessionId',
  uploadLimiter,
  authenticate,
  ChunkedUploadController.cancelUpload
);

export default router;
