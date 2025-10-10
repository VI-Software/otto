import express from 'express'
import FileController from '../controllers/FileController.js'
// eslint-disable-next-line no-unused-vars
import { authenticate, authenticateService, authenticateAdmin } from '../middleware/auth.js'

const router = express.Router()

/**
 * GET /files/uploader/:uploaderId
 * Get files by uploader ID
 * Users can only see their own files unless service authenticated
 */
router.get('/uploader/:uploaderId', authenticate, FileController.getFilesByUploader)

/**
 * GET /files/:fileId/info
 * Get file information and metadata
 */
router.get('/:fileId/info', authenticate, FileController.getFileInfo)

/**
 * DELETE /files/:fileId
 * Delete file (soft delete in DB, removes from disk)
 */
router.delete('/:fileId', authenticate, FileController.deleteFile)

/**
 * POST /files/:fileId/signed-url
 * Generate signed URL for temporary file access
 */
router.post('/:fileId/signed-url', authenticate, FileController.generateSignedUrl)

/**
 * GET /files/:context/:filename
 * Serve file by context and filename (authenticated)
 * This route handles context/filename access
 */
router.get('/:context/:filename', authenticate, FileController.serveFileByContextAndFilename)

/**
 * GET /files/:fileId
 * Serve file by ID
 * Supports token-based access via query parameter or authentication headers
 * This route is last to avoid conflicts with other patterns
 */
router.get('/:fileId', authenticate, FileController.serveFile)

/**
 * POST /files/:fileId/suspend
 * Suspend file access due to copyright complaint (admin/service only)
 */
router.post('/:fileId/suspend', authenticateAdmin, FileController.suspendFile)

/**
 * POST /files/:fileId/unsuspend
 * Unsuspend file access (admin/service only)
 */
router.post('/:fileId/unsuspend', authenticateAdmin, FileController.unsuspendFile)

/**
 * DELETE /files/:fileId/copyright
 * Delete file permanently due to copyright violation (admin/service only)
 */
router.delete('/:fileId/copyright', authenticateAdmin, FileController.deleteFileForCopyright)

export default router
