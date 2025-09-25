import express from 'express'
import FileController from '../controllers/FileController.js'

const router = express.Router()

/**
 * GET /public/:context/:hash.:ext
 * Serve public file by context and hash with extension
 * Content-addressable URLs prevent collisions
 * No authentication required
 */
router.get('/:context/:hash.:ext', FileController.servePublicFileByHashWithExt)

/**
 * GET /public/:context/:hash
 * Serve public file by context and hash
 * Content-addressable URLs prevent collisions
 * No authentication required
 */
router.get('/:context/:hash', FileController.servePublicFileByHash)

/**
 * GET /p/:context/:hash.:ext
 * Short URL for public files with extension
 * No authentication required
 */
router.get('/p/:context/:hash.:ext', FileController.servePublicFileByHashWithExt)

/**
 * GET /p/:context/:hash
 * Short URL for public files
 * No authentication required
 */
router.get('/p/:context/:hash', FileController.servePublicFileByHash)

/**
 * LEGACY: GET /public/:context/:filename
 * Serve public file by context and filename (backward compatibility)
 * Will be deprecated - returns latest file with that name
 * No authentication required
 */
router.get('/:context/:filename', FileController.servePublicFileLegacy)

/**
 * LEGACY: GET /p/:context/:filename
 * Short URL for public files (backward compatibility)
 * No authentication required
 */
router.get('/p/:context/:filename', FileController.servePublicFileLegacy)

export default router
