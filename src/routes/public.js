import express from 'express';
import FileController from '../controllers/FileController.js';

const router = express.Router();

/**
 * GET /public/:context/:filename
 * Serve public file by context and filename
 * No authentication required
 */
router.get('/:context/:filename', FileController.servePublicFile);

/**
 * GET /p/:context/:filename
 * Short URL for public files
 * No authentication required
 */
router.get('/p/:context/:filename', FileController.servePublicFile);

export default router;
