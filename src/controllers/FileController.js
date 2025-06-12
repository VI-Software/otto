import path from 'path';
import fs from 'fs';
import FileService from '../services/FileService.js';
import TokenService from '../services/TokenService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';

class FileController {
  serveFile = asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const { token, download, thumbnail } = req.query;

    // Check for token-based access
    if (token) {
      try {
        const decoded = TokenService.verifyToken(token);
        if (decoded.type !== 'file_access' || decoded.fileId !== fileId) {
          return res.status(401).json({
            error: 'Invalid file access token',
            code: 'INVALID_FILE_TOKEN'
          });
        }
      } catch (error) {
        return res.status(401).json({
          error: 'Invalid or expired file access token',
          code: 'INVALID_FILE_TOKEN'
        });
      }
    } else {
      // Require authentication for non-token access
      if (!req.serviceAuthenticated && !req.user && !req.uploadToken) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED'
        });
      }
    }

    // Get file record
    const file = await FileService.getFile(fileId, { trackAccess: !token });
    
    if (!file) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Check access permissions (skip for token-based access)
    if (!token && !FileService.validateFileAccess(file, req)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    try {
      let filePath = file.file_path;
      let mimeType = file.mime_type;      // Serve thumbnail if requested
      if (thumbnail === 'true') {
        const thumbnailPath = FileService.getThumbnailPath(file.file_path, fileId);
        const fs = await import('fs');
        if (fs.existsSync(thumbnailPath)) {
          filePath = thumbnailPath;
          mimeType = 'image/webp';
        }
      }

      const fileStream = FileService.getFileStream(filePath);
      const fs = await import('fs');
      
      // Set appropriate headers
      res.set({
        'Content-Type': mimeType,
        'Content-Length': fs.statSync(filePath).size,
        'Cache-Control': 'private, max-age=3600',
        'X-File-ID': fileId
      });

      // Force download if requested
      if (download === 'true') {
        res.set('Content-Disposition', `attachment; filename="${file.original_name}"`);
      } else {
        res.set('Content-Disposition', `inline; filename="${file.original_name}"`);
      }

      // Pipe file stream to response
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        logger.error('File stream error', { fileId, error: error.message });
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to serve file',
            code: 'FILE_STREAM_ERROR'
          });
        }
      });

    } catch (error) {
      logger.error('Failed to serve file', { fileId, error: error.message });
      
      if (error.message === 'File not found on disk') {
        return res.status(404).json({
          error: 'File not found on disk',
          code: 'FILE_NOT_FOUND_ON_DISK'
        });
      }

      throw error;
    }
  });

  /**
   * Get file information
   */
  getFileInfo = asyncHandler(async (req, res) => {
    const { fileId } = req.params;

    const file = await FileService.getFile(fileId, { trackAccess: false });
    
    if (!file) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Check access permissions
    if (!FileService.validateFileAccess(file, req)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }    res.json({
      success: true,
      data: {
        id: file.id,
        filename: file.filename,
        originalName: file.original_name,
        mimeType: file.mime_type,
        fileSize: file.file_size,
        uploadContext: file.upload_context,
        uploadedBy: file.uploaded_by,
        uploadSource: file.upload_source,
        uploadedAt: file.created_at,
        lastAccessedAt: file.last_accessed_at,
        accessCount: file.access_count,
        metadata: file.metadata,
        url: `/files/${file.id}`,
        downloadUrl: `/files/${file.id}?download=true`,
        thumbnailUrl: file.metadata?.hasThumbnail ? `/files/${file.id}?thumbnail=true` : null,
        publicUrl: file.is_public ? `/public/${file.upload_context}/${file.file_hash.substring(0, 12)}` : null,
        publicUrlWithExt: file.is_public ? (() => {
          const hashPrefix = file.file_hash.substring(0, 12);
          const fileExt = file.original_name.split('.').pop().toLowerCase();
          return `/public/${file.upload_context}/${hashPrefix}.${fileExt}`;
        })() : null,
        shortPublicUrl: file.is_public ? `/p/${file.upload_context}/${file.file_hash.substring(0, 12)}` : null,
        shortPublicUrlWithExt: file.is_public ? (() => {
          const hashPrefix = file.file_hash.substring(0, 12);
          const fileExt = file.original_name.split('.').pop().toLowerCase();
          return `/p/${file.upload_context}/${hashPrefix}.${fileExt}`;
        })() : null,
        legacyPublicUrl: file.is_public ? `/public/${file.upload_context}/${file.original_name}` : null
      }
    });
  });

  /**
   * Delete file
   */
  deleteFile = asyncHandler(async (req, res) => {
    const { fileId } = req.params;

    const file = await FileService.getFile(fileId, { trackAccess: false });
    
    if (!file) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Check permissions - only allow deletion by uploader or service
    if (!req.serviceAuthenticated && 
        (!req.user || file.uploaded_by !== req.user.id)) {
      return res.status(403).json({
        error: 'Access denied - can only delete own files',
        code: 'DELETE_ACCESS_DENIED'
      });
    }

    const deleted = await FileService.deleteFile(fileId);
    
    if (!deleted) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    logger.info('File deleted via API', { 
      fileId, 
      deletedBy: req.user?.id || 'service' 
    });

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  });

  /**
   * Generate signed URL for temporary file access
   */
  generateSignedUrl = asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const { expiresIn = 3600 } = req.body;

    const file = await FileService.getFile(fileId, { trackAccess: false });
    
    if (!file) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Check access permissions
    if (!FileService.validateFileAccess(file, req)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const signedUrl = TokenService.generateSignedUrl(fileId, parseInt(expiresIn));

    logger.info('Signed URL generated', { 
      fileId, 
      expiresIn,
      requestedBy: req.user?.id || 'service' 
    });

    res.json({
      success: true,
      data: {
        fileId,
        signedUrl: `${req.protocol}://${req.get('host')}${signedUrl}`,
        expiresIn: parseInt(expiresIn),
        expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString()
      }
    });
  });
  /**
   * Get files by uploader
   */
  getFilesByUploader = asyncHandler(async (req, res) => {
    const { uploaderId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Only allow users to see their own files unless it's a service request
    if (!req.serviceAuthenticated && req.user?.id !== uploaderId) {
      return res.status(403).json({
        error: 'Access denied - can only view own files',
        code: 'ACCESS_DENIED'
      });
    }

    const files = await FileService.getFilesByUploader(uploaderId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });    res.json({
      success: true,
      data: {        files: files.map(file => {
          const hashPrefix = file.file_hash.substring(0, 12);
          const fileExt = file.original_name.split('.').pop().toLowerCase();
          
          return {
            id: file.id,
            filename: file.filename,
            originalName: file.original_name,
            mimeType: file.mime_type,
            fileSize: file.file_size,
            uploadContext: file.upload_context,
            uploadedAt: file.created_at,
            accessCount: file.access_count,
            url: `/files/${file.id}`,
            publicUrl: file.is_public ? `/public/${file.upload_context}/${hashPrefix}` : null,
            publicUrlWithExt: file.is_public ? `/public/${file.upload_context}/${hashPrefix}.${fileExt}` : null,
            shortPublicUrl: file.is_public ? `/p/${file.upload_context}/${hashPrefix}` : null,
            shortPublicUrlWithExt: file.is_public ? `/p/${file.upload_context}/${hashPrefix}.${fileExt}` : null,
            legacyPublicUrl: file.is_public ? `/public/${file.upload_context}/${file.original_name}` : null
          };
        }),
        uploaderId,
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
   * Serve public file by context and filename
   * No authentication required for public files
   */
  servePublicFile = asyncHandler(async (req, res) => {
    const { context, filename } = req.params;
    const { download, thumbnail } = req.query;

    // Get public file record
    const file = await FileService.getPublicFileByContextAndFilename(context, filename);
    
    if (!file) {
      return res.status(404).json({
        error: 'Public file not found',
        code: 'PUBLIC_FILE_NOT_FOUND'
      });
    }

    try {
      let filePath = file.file_path;
      let mimeType = file.mime_type;

      // Serve thumbnail if requested
      if (thumbnail === 'true') {
        const thumbnailPath = FileService.getThumbnailPath(file.file_path, file.id);
        if (fs.existsSync(thumbnailPath)) {
          filePath = thumbnailPath;
          mimeType = 'image/webp';
        }
      }

      const fileStream = FileService.getFileStream(filePath);
      
      // Set appropriate headers for public files
      res.set({
        'Content-Type': mimeType,
        'Content-Length': fs.statSync(filePath).size,
        'Cache-Control': 'public, max-age=86400', // 24 hours cache for public files
        'X-File-ID': file.id,
        'X-Public-File': 'true'
      });

      // Force download if requested
      if (download === 'true') {
        res.set('Content-Disposition', `attachment; filename="${file.original_name}"`);
      } else {
        res.set('Content-Disposition', `inline; filename="${file.original_name}"`);
      }

      // Pipe file stream to response
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        logger.error('Public file stream error', { 
          fileId: file.id, 
          context, 
          filename, 
          error: error.message 
        });
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to serve public file',
            code: 'PUBLIC_FILE_STREAM_ERROR'
          });
        }
      });

    } catch (error) {
      logger.error('Failed to serve public file', { 
        context, 
        filename, 
        error: error.message 
      });
      
      if (error.message === 'File not found on disk') {
        return res.status(404).json({
          error: 'Public file not found on disk',
          code: 'PUBLIC_FILE_NOT_FOUND_ON_DISK'
        });
      }

      throw error;
    }
  });  /**
   * Serve public file by context and hash (without extension)
   * Content-addressable URLs prevent collisions
   * No authentication required for public files
   */
  servePublicFileByHash = asyncHandler(async (req, res) => {
    const { context, hash } = req.params;
    const { download, thumbnail } = req.query;

    // Get public file record by hash (without filename)
    const file = await FileService.getPublicFileByHash(hash, context);
    
    if (!file) {
      return res.status(404).json({
        error: 'Public file not found',
        code: 'PUBLIC_FILE_NOT_FOUND'
      });
    }

    this.servePublicFileResponse(file, req, res, { context, hash });
  });

  /**
   * Serve public file by context and hash with extension
   * Content-addressable URLs prevent collisions
   * No authentication required for public files
   */
  servePublicFileByHashWithExt = asyncHandler(async (req, res) => {
    const { context, hash, ext } = req.params;
    const { download, thumbnail } = req.query;

    // Get public file record by hash and verify extension matches
    const file = await FileService.getPublicFileByHash(hash, context);
    
    if (!file) {
      return res.status(404).json({
        error: 'Public file not found',
        code: 'PUBLIC_FILE_NOT_FOUND'
      });
    }

    // Verify the extension matches the file's actual extension
    const actualExt = path.extname(file.original_name).substring(1).toLowerCase();
    if (ext.toLowerCase() !== actualExt) {
      return res.status(404).json({
        error: 'File extension does not match',
        code: 'EXTENSION_MISMATCH'
      });
    }

    this.servePublicFileResponse(file, req, res, { context, hash, ext });
  });

  /**
   * Common response handler for public files
   */
  servePublicFileResponse = (file, req, res, routeParams) => {
    const { download, thumbnail } = req.query;

    try {
      let filePath = file.file_path;
      let mimeType = file.mime_type;

      // Serve thumbnail if requested
      if (thumbnail === 'true') {
        const thumbnailPath = FileService.getThumbnailPath(file.file_path, file.id);
        if (fs.existsSync(thumbnailPath)) {
          filePath = thumbnailPath;
          mimeType = 'image/webp';
        }
      }

      const fileStream = FileService.getFileStream(filePath);
      
      // Set appropriate headers for public files
      res.set({
        'Content-Type': mimeType,
        'Content-Length': fs.statSync(filePath).size,
        'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache (content-addressable)
        'X-File-ID': file.id,
        'X-File-Hash': file.file_hash,
        'X-Public-File': 'true',
        'ETag': `"${file.file_hash}"` // Use file hash as ETag for better caching
      });

      // Force download if requested
      if (download === 'true') {
        res.set('Content-Disposition', `attachment; filename="${file.original_name}"`);
      } else {
        res.set('Content-Disposition', `inline; filename="${file.original_name}"`);
      }

      // Pipe file stream to response
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        logger.error('Public file stream error', { 
          fileId: file.id, 
          ...routeParams,
          error: error.message 
        });
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to serve public file',
            code: 'PUBLIC_FILE_STREAM_ERROR'
          });
        }
      });

    } catch (error) {
      logger.error('Failed to serve public file', { 
        ...routeParams,
        error: error.message 
      });
      
      if (error.message === 'File not found on disk') {
        return res.status(404).json({
          error: 'Public file not found on disk',
          code: 'PUBLIC_FILE_NOT_FOUND_ON_DISK'
        });
      }

      throw error;
    }
  };

  /**
   * Serve public file by context and filename (LEGACY - backward compatibility)
   * Returns the most recent file with that name
   * No authentication required for public files
   */
  servePublicFileLegacy = asyncHandler(async (req, res) => {
    const { context, filename } = req.params;
    const { download, thumbnail } = req.query;

    // Get public file record (latest)
    const file = await FileService.getPublicFileByContextAndFilename(context, filename);
    
    if (!file) {
      return res.status(404).json({
        error: 'Public file not found',
        code: 'PUBLIC_FILE_NOT_FOUND'
      });
    }

    // Log legacy access for monitoring
    logger.warn('Legacy public file access - consider using hash-based URLs', {
      context,
      filename,
      fileId: file.id,
      newUrl: `/public/${context}/${file.file_hash.substring(0, 12)}/${filename}`
    });

    try {
      let filePath = file.file_path;
      let mimeType = file.mime_type;

      // Serve thumbnail if requested
      if (thumbnail === 'true') {
        const thumbnailPath = FileService.getThumbnailPath(file.file_path, file.id);
        if (fs.existsSync(thumbnailPath)) {
          filePath = thumbnailPath;
          mimeType = 'image/webp';
        }
      }

      const fileStream = FileService.getFileStream(filePath);
      
      // Set appropriate headers for public files
      res.set({
        'Content-Type': mimeType,
        'Content-Length': fs.statSync(filePath).size,
        'Cache-Control': 'public, max-age=86400', // 24 hours cache (filename-based, not immutable)
        'X-File-ID': file.id,
        'X-Legacy-Access': 'true',
        'X-Recommended-URL': `/public/${context}/${file.file_hash.substring(0, 12)}/${filename}`,
        'X-Public-File': 'true'
      });

      // Force download if requested
      if (download === 'true') {
        res.set('Content-Disposition', `attachment; filename="${file.original_name}"`);
      } else {
        res.set('Content-Disposition', `inline; filename="${file.original_name}"`);
      }

      // Pipe file stream to response
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        logger.error('Legacy public file stream error', { 
          fileId: file.id, 
          context, 
          filename, 
          error: error.message 
        });
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to serve public file',
            code: 'PUBLIC_FILE_STREAM_ERROR'
          });
        }
      });

    } catch (error) {
      logger.error('Failed to serve legacy public file', { 
        context, 
        filename, 
        error: error.message 
      });
      
      if (error.message === 'File not found on disk') {
        return res.status(404).json({
          error: 'Public file not found on disk',
          code: 'PUBLIC_FILE_NOT_FOUND_ON_DISK'
        });
      }

      throw error;
    }
  });

  /**
   * Serve file by context and filename (authenticated)
   * Falls back to ID-based lookup if context/filename not found
   */
  serveFileByContextAndFilename = asyncHandler(async (req, res) => {
    const { context, filename } = req.params;
    const { download, thumbnail } = req.query;

    // First try to find by context and filename
    let file = await FileService.getFileByContextAndFilename(context, filename);
    
    // If not found, try treating context as fileId for backward compatibility
    if (!file) {
      file = await FileService.getFile(context, { trackAccess: false });
      
      if (!file) {
        return res.status(404).json({
          error: 'File not found',
          code: 'FILE_NOT_FOUND'
        });
      }
    }

    // Check access permissions
    if (!FileService.validateFileAccess(file, req)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Update access count if we found a file
    if (file) {
      FileService.updateAccessCount(file.id).catch(err => {
        logger.warn('Failed to update access count', { 
          fileId: file.id, 
          error: err.message 
        });
      });
    }

    try {
      let filePath = file.file_path;
      let mimeType = file.mime_type;

      // Serve thumbnail if requested
      if (thumbnail === 'true') {
        const thumbnailPath = FileService.getThumbnailPath(file.file_path, file.id);
        if (fs.existsSync(thumbnailPath)) {
          filePath = thumbnailPath;
          mimeType = 'image/webp';
        }
      }

      const fileStream = FileService.getFileStream(filePath);
      
      // Set appropriate headers
      res.set({
        'Content-Type': mimeType,
        'Content-Length': fs.statSync(filePath).size,
        'Cache-Control': file.is_public ? 'public, max-age=86400' : 'private, max-age=3600',
        'X-File-ID': file.id
      });

      // Force download if requested
      if (download === 'true') {
        res.set('Content-Disposition', `attachment; filename="${file.original_name}"`);
      } else {
        res.set('Content-Disposition', `inline; filename="${file.original_name}"`);
      }

      // Pipe file stream to response
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        logger.error('File stream error', { 
          fileId: file.id, 
          context, 
          filename, 
          error: error.message 
        });
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to serve file',
            code: 'FILE_STREAM_ERROR'
          });
        }
      });

    } catch (error) {
      logger.error('Failed to serve file by context and filename', { 
        context, 
        filename, 
        error: error.message 
      });
      
      if (error.message === 'File not found on disk') {
        return res.status(404).json({
          error: 'File not found on disk',
          code: 'FILE_NOT_FOUND_ON_DISK'
        });
      }

      throw error;
    }
  });
}

export default new FileController();
