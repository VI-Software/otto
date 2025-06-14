import fs from 'fs';
import ChunkedUploadService from '../services/ChunkedUploadService.js';
import TokenService from '../services/TokenService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';

class ChunkedUploadController {
  /**
   * Initialize a chunked upload session
   * POST /api/upload/chunk/init
   */
  initializeUpload = asyncHandler(async (req, res) => {
    const {
      originalFilename,
      totalSize,
      mimeType,
      context = 'general',
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!originalFilename || !totalSize || !mimeType) {
      return res.status(400).json({
        error: 'originalFilename, totalSize, and mimeType are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Validate file size
    const maxFileSize = parseInt(process.env.MAX_TOTAL_FILE_SIZE) || 1024 * 1024 * 1024; // 1GB default
    if (totalSize > maxFileSize) {
      return res.status(400).json({
        error: `File too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`,
        code: 'FILE_TOO_LARGE'
      });
    }

    // Calculate total chunks needed
    const chunkSize = ChunkedUploadService.chunkSize;
    const totalChunks = Math.ceil(totalSize / chunkSize);

    // Determine upload context and user from authentication
    let uploadContext = context;
    let uploadedBy = 'system';
    let uploadSource = 'api';

    if (req.authenticationType === 'service') {
      uploadedBy = req.body.uploadedBy || 'service';
      uploadSource = 'service';
    } else if (req.authenticationType === 'upload_token') {
      uploadContext = req.uploadToken.context;
      uploadedBy = req.uploadToken.uploadedBy;
      uploadSource = 'frontend';

      // Validate token constraints
      if (totalSize > req.uploadToken.maxSize) {
        return res.status(400).json({
          error: `File size exceeds token limit of ${req.uploadToken.maxSize} bytes`,
          code: 'TOKEN_SIZE_LIMIT_EXCEEDED'
        });
      }

      // Check allowed types if specified in token
      if (req.uploadToken.allowedTypes && !req.uploadToken.allowedTypes.includes(mimeType)) {
        return res.status(400).json({
          error: 'File type not allowed by this token',
          code: 'TOKEN_TYPE_NOT_ALLOWED'
        });
      }
    } else if (req.authenticationType === 'jwt') {
      uploadedBy = req.user.sub || req.user.id;
      uploadSource = 'user';
    }

    try {
      const session = await ChunkedUploadService.initializeSession({
        originalFilename,
        totalSize,
        totalChunks,
        mimeType,
        context: uploadContext,
        uploadedBy,
        uploadSource,
        metadata
      });

      logger.info('Chunked upload session initialized', {
        sessionId: session.sessionId,
        originalFilename,
        totalSize,
        totalChunks,
        uploadedBy
      });

      res.status(201).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          chunkSize: session.chunkSize,
          totalChunks,
          expiresAt: session.expiresAt
        }
      });

    } catch (error) {
      logger.error('Failed to initialize chunked upload', {
        error: error.message,
        originalFilename,
        totalSize
      });

      res.status(500).json({
        error: 'Failed to initialize chunked upload',
        code: 'INITIALIZATION_FAILED'
      });
    }
  });

  /**
   * Upload a single chunk
   * POST /api/upload/chunk/:sessionId/:chunkIndex
   */
  uploadChunk = asyncHandler(async (req, res) => {
    const { sessionId, chunkIndex } = req.params;
    const chunkIndexNum = parseInt(chunkIndex);

    if (!req.file) {
      return res.status(400).json({
        error: 'No chunk data provided',
        code: 'NO_CHUNK_DATA'
      });
    }

    if (isNaN(chunkIndexNum) || chunkIndexNum < 0) {
      return res.status(400).json({
        error: 'Invalid chunk index',
        code: 'INVALID_CHUNK_INDEX'
      });
    }    try {
      // Read chunk data
      const chunkBuffer = fs.readFileSync(req.file.path);
      const chunkSize = req.file.size;

      // Upload chunk
      const result = await ChunkedUploadService.uploadChunk(
        sessionId,
        chunkIndexNum,
        chunkBuffer,
        chunkSize
      );

      // Clean up temporary file
      fs.unlinkSync(req.file.path);

      logger.info('Chunk uploaded successfully', {
        sessionId,
        chunkIndex: chunkIndexNum,
        chunkSize,
        progress: result.progress
      });

      res.json({
        success: true,
        data: result
      });    } catch (error) {
      // Clean up temporary file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      logger.error('Chunk upload failed', {
        sessionId,
        chunkIndex: chunkIndexNum,
        error: error.message
      });

      if (error.message.includes('not found') || error.message.includes('expired')) {
        return res.status(404).json({
          error: error.message,
          code: 'SESSION_NOT_FOUND'
        });
      }

      res.status(500).json({
        error: 'Chunk upload failed',
        code: 'CHUNK_UPLOAD_FAILED',
        details: error.message
      });
    }
  });

  /**
   * Get upload session status
   * GET /api/upload/chunk/:sessionId/status
   */
  getSessionStatus = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    try {
      const status = ChunkedUploadService.getSessionStatus(sessionId);

      if (!status) {
        return res.status(404).json({
          error: 'Upload session not found or expired',
          code: 'SESSION_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Failed to get session status', {
        sessionId,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get session status',
        code: 'STATUS_ERROR'
      });
    }
  });

  /**
   * Complete chunked upload (assemble file)
   * POST /api/upload/chunk/:sessionId/complete
   */  completeUpload = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    try {
      const processedFile = await ChunkedUploadService.assembleFile(sessionId);

      // Debug logging to see what we got back
      logger.debug('Assembled file object:', {
        sessionId,
        processedFile: processedFile ? {
          id: processedFile.id,
          file_hash: processedFile.file_hash,
          original_name: processedFile.original_name,
          hasFileHash: !!processedFile.file_hash,
          keys: Object.keys(processedFile || {})
        } : 'null'
      });

      if (!processedFile) {
        throw new Error('No file was returned from assembleFile');
      }

      if (!processedFile.file_hash) {
        throw new Error('Assembled file is missing file_hash property');
      }

      // Format response similar to regular upload
      const hashPrefix = processedFile.file_hash.substring(0, 12);
      const fileExt = processedFile.original_name.split('.').pop().toLowerCase();

      const fileResponse = {
        id: processedFile.id,
        filename: processedFile.filename,
        originalName: processedFile.original_name,
        mimeType: processedFile.mime_type,
        fileSize: processedFile.file_size,
        uploadContext: processedFile.upload_context,
        uploadedAt: processedFile.created_at,
        isPublic: processedFile.is_public,
        url: `/files/${processedFile.id}`,
        publicUrl: processedFile.is_public ? `/public/${processedFile.upload_context}/${hashPrefix}` : null,
        publicUrlWithExt: processedFile.is_public ? `/public/${processedFile.upload_context}/${hashPrefix}.${fileExt}` : null,
        shortPublicUrl: processedFile.is_public ? `/p/${processedFile.upload_context}/${hashPrefix}` : null,
        shortPublicUrlWithExt: processedFile.is_public ? `/p/${processedFile.upload_context}/${hashPrefix}.${fileExt}` : null,
        legacyPublicUrl: processedFile.is_public ? `/public/${processedFile.upload_context}/${processedFile.original_name}` : null
      };

      logger.info('Chunked upload completed successfully', {
        sessionId,
        fileId: processedFile.id,
        originalName: processedFile.original_name,
        fileSize: processedFile.file_size
      });

      res.json({
        success: true,
        data: {
          file: fileResponse,
          sessionId,
          chunkedUpload: true
        }
      });

    } catch (error) {
      logger.error('Failed to complete chunked upload', {
        sessionId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Upload session not found',
          code: 'SESSION_NOT_FOUND'
        });
      }

      if (error.message.includes('Missing chunk')) {
        return res.status(400).json({
          error: error.message,
          code: 'MISSING_CHUNKS'
        });
      }

      res.status(500).json({
        error: 'Failed to complete upload',
        code: 'COMPLETION_FAILED',
        details: error.message
      });
    }
  });

  /**
   * Cancel upload session
   * DELETE /api/upload/chunk/:sessionId
   */
  cancelUpload = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    try {
      const cancelled = await ChunkedUploadService.cancelSession(sessionId);

      if (!cancelled) {
        return res.status(404).json({
          error: 'Upload session not found',
          code: 'SESSION_NOT_FOUND'
        });
      }

      logger.info('Upload session cancelled', { sessionId });

      res.json({
        success: true,
        data: {
          sessionId,
          cancelled: true
        }
      });

    } catch (error) {
      logger.error('Failed to cancel upload session', {
        sessionId,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to cancel upload session',
        code: 'CANCELLATION_FAILED'
      });
    }
  });

  /**
   * Get chunked upload configuration
   * GET /api/upload/chunk/config
   */
  getConfig = asyncHandler(async (req, res) => {
    const config = ChunkedUploadService.getConfig();

    res.json({
      success: true,
      data: {
        chunkSize: config.chunkSize,
        maxConcurrentChunks: config.maxConcurrentChunks,
        sessionTimeout: config.sessionTimeout,
        formattedChunkSize: this.formatBytes(config.chunkSize),
        formattedSessionTimeout: this.formatDuration(config.sessionTimeout)
      }
    });
  });

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration to human readable format
   */
  formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}

export default new ChunkedUploadController();
