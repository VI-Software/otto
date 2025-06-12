import express from 'express';
import FileController from '../controllers/FileController.js';

const router = express.Router();

/**
 * GET /public/:context/:hash/:filename
 * Serve public file by context, hash, and filename
 * Content-addressable URLs prevent collisions
 * No authentication required
 */
router.get('/:context/:hash/:filename', FileController.servePublicFileByHash);

/**
 * GET /p/:context/:hash/:filename
 * Short URL for public files
 * No authentication required
 */
router.get('/p/:context/:hash/:filename', FileController.servePublicFileByHash);

/**
 * LEGACY: GET /public/:context/:filename
 * Serve public file by context and filename (backward compatibility)
 * Will be deprecated - returns latest file with that name
 * No authentication required
 */
router.get('/:context/:filename', FileController.servePublicFileLegacy);

/**
 * LEGACY: GET /p/:context/:filename
 * Short URL for public files (backward compatibility)
 * No authentication required
 */
router.get('/p/:context/:filename', FileController.servePublicFileLegacy);

export default router;
