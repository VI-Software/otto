import FileService from '../services/FileService.js';
import TokenService from '../services/TokenService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';

class UploadController {  generateUploadToken = asyncHandler(async (req, res) => {
    const {
      context = 'general',
      uploadedBy,
      maxFiles = 5,
      maxSize,
      allowedTypes,
      expiresIn
    } = req.body;

    // Validate required fields
    if (!uploadedBy) {
      return res.status(400).json({
        error: 'uploadedBy is required',
        code: 'MISSING_UPLOADED_BY'
      });
    }

    const tokenData = TokenService.generateUploadToken({
      context,
      uploadedBy,
      maxFiles: parseInt(maxFiles) || 5,
      maxSize: parseInt(maxSize),
      allowedTypes: allowedTypes ? allowedTypes.split(',').map(t => t.trim()) : null,
      expiresIn
    });

    logger.info('Upload token generated for user', { 
      uploadedBy, 
      context,
      tokenId: tokenData.tokenId 
    });

    res.json({
      success: true,
      data: tokenData
    });
  });
  uploadFiles = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files provided',
        code: 'NO_FILES'
      });
    }

    // Determine upload context and user
    let context = req.body.context || 'general';
    let uploadedBy = 'system';
    let uploadSource = 'api';

    if (req.authenticationType === 'service') {
      uploadedBy = req.body.uploadedBy || 'service';
      uploadSource = 'service';
    } else if (req.authenticationType === 'upload_token') {
      context = req.uploadToken.context;
      uploadedBy = req.uploadToken.uploadedBy;
      uploadSource = 'frontend';

      // Validate token constraints
      if (req.files.length > req.uploadToken.maxFiles) {
        return res.status(400).json({
          error: `Too many files. Token allows maximum ${req.uploadToken.maxFiles} files`,
          code: 'TOKEN_FILE_LIMIT_EXCEEDED'
        });
      }

      // Check file sizes against token limit
      const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > req.uploadToken.maxSize) {
        return res.status(400).json({
          error: `Total file size exceeds token limit of ${req.uploadToken.maxSize} bytes`,
          code: 'TOKEN_SIZE_LIMIT_EXCEEDED'
        });
      }

      // Check allowed types if specified in token
      if (req.uploadToken.allowedTypes) {
        const invalidFiles = req.files.filter(file => 
          !req.uploadToken.allowedTypes.includes(file.mimetype)
        );
        
        if (invalidFiles.length > 0) {
          return res.status(400).json({
            error: 'Some files have types not allowed by this token',
            code: 'TOKEN_TYPE_NOT_ALLOWED',
            invalidFiles: invalidFiles.map(f => f.originalname)
          });
        }
      }
    } else if (req.authenticationType === 'jwt') {
      uploadedBy = req.user.sub || req.user.id;
      uploadSource = 'user';
    }

    // Parse additional metadata
    let metadata = {};
    if (req.body.metadata) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch (error) {
        logger.warn('Invalid metadata JSON', { metadata: req.body.metadata });
      }
    }

    // Process uploaded files
    const processedFiles = await FileService.processUploadedFiles(req.files, {
      context,
      uploadedBy,
      uploadSource,
      generateThumbnails: req.body.generateThumbnails === 'true',
      metadata
    });

    logger.info('Files uploaded successfully', {
      count: processedFiles.length,
      uploadedBy,
      context,
      fileIds: processedFiles.map(f => f.id)
    });        res.status(201).json({
      success: true,
      data: {
        files: processedFiles.map(file => ({
          id: file.id,
          filename: file.filename,
          originalName: file.original_name,
          mimeType: file.mime_type,
          fileSize: file.file_size,
          uploadContext: file.upload_context,
          uploadedAt: file.created_at,
          isPublic: file.is_public,
          url: `/files/${file.id}`,
          publicUrl: file.is_public ? `/public/${file.upload_context}/${file.file_hash.substring(0, 12)}` : null,
          shortPublicUrl: file.is_public ? `/p/${file.upload_context}/${file.file_hash.substring(0, 12)}` : null
        })),
        count: processedFiles.length,
        totalSize: processedFiles.reduce((sum, file) => sum + file.file_size, 0)
      }
    });
  });

  /**
   * Get upload statistics
   */
  getUploadStats = asyncHandler(async (req, res) => {
    const stats = await FileService.getStats();

    res.json({
      success: true,
      data: {
        totalFiles: parseInt(stats.total_files) || 0,
        totalSize: parseInt(stats.total_size) || 0,
        averageSize: parseFloat(stats.avg_size) || 0,
        uniqueContexts: parseInt(stats.unique_contexts) || 0,
        uniqueUploaders: parseInt(stats.unique_uploaders) || 0,
        formattedTotalSize: this.formatBytes(parseInt(stats.total_size) || 0)
      }
    });
  });

  /**
   * Get files by context
   */
  getFilesByContext = asyncHandler(async (req, res) => {
    const { context } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const files = await FileService.getFilesByContext(context, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {        files: files.map(file => ({
          id: file.id,
          filename: file.filename,
          originalName: file.original_name,
          mimeType: file.mime_type,
          fileSize: file.file_size,
          uploadContext: file.upload_context,
          uploadedBy: file.uploaded_by,
          uploadedAt: file.created_at,
          accessCount: file.access_count,
          url: `/files/${file.id}`,
          publicUrl: file.is_public ? `/public/${file.upload_context}/${file.file_hash.substring(0, 12)}/${file.original_name}` : null
        })),
        context,
        count: files.length,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: files.length === parseInt(limit)
        }
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
}

export default new UploadController();
