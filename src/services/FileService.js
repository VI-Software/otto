import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import zlib from 'zlib';
import { v4 as uuidv4 } from 'uuid';
import FileModel from '../models/File.js';
import logger from '../config/logger.js';
import { isPublicContext } from '../config/publicContexts.js';

class FileService {
  async processUploadedFiles(files, options = {}) {
    const {
      context = 'general',
      uploadedBy = 'system',
      uploadSource = 'api',
      generateThumbnails = false,
      metadata = {},
      forcePublic = null
    } = options;

    const processedFiles = [];

    for (const file of files) {
      try {
        // Calculate file hash for deduplication
        const fileHash = await this.calculateFileHash(file.path);
        
        // Check if file already exists with same hash
        const existingFile = await FileModel.findByHash(fileHash);
        
        if (existingFile) {
          logger.info('File already exists, reusing', { 
            hash: fileHash,
            existingId: existingFile.id,
            originalName: file.originalname 
          });
          
          // Create new record pointing to same file but with current context
          const fileId = uuidv4();
          const shouldBePublic = forcePublic !== null ? forcePublic : isPublicContext(context);
          
          const fileData = {
            id: fileId,
            filename: existingFile.filename, // Reuse existing filename
            originalName: file.originalname,
            filePath: existingFile.file_path, // Point to existing file
            mimeType: file.mimetype,
            fileSize: file.size,
            uploadContext: context,
            uploadedBy,
            uploadSource,
            isPublic: shouldBePublic,
            fileHash,
            metadata: {
              ...metadata,
              encoding: file.encoding,
              fieldName: file.fieldname,
              deduplicated: true,
              originalFileId: existingFile.id
            }
          };

          const savedFile = await FileModel.create(fileData);
          processedFiles.push(savedFile);
          
          // Remove uploaded duplicate
          fs.unlinkSync(file.path);
          
          continue;
        }        const fileId = uuidv4();
        const shouldBePublic = forcePublic !== null ? forcePublic : isPublicContext(context);
        
        // Optimize images if enabled
        let optimizationResult = { optimized: false, originalPath: file.path };
        if (file.mimetype.startsWith('image/')) {
          optimizationResult = await this.optimizeImage(file.path, file.mimetype);
        }
        
        // Compress file if beneficial
        const compressionResult = await this.compressFile(
          optimizationResult.optimizedPath || file.path, 
          file.mimetype
        );
        
        const finalPath = compressionResult.compressedPath;
        const finalSize = compressionResult.compressed ? 
          compressionResult.compressedSize : file.size;
        
        const fileData = {
          id: fileId,
          filename: file.filename,
          originalName: file.originalname,
          filePath: finalPath,
          mimeType: file.mimetype,
          fileSize: finalSize,
          uploadContext: context,
          uploadedBy,
          uploadSource,
          isPublic: shouldBePublic,
          fileHash,
          metadata: {
            ...metadata,
            encoding: file.encoding,
            fieldName: file.fieldname,
            compressed: compressionResult.compressed,
            compressionType: compressionResult.compressionType,
            originalSize: compressionResult.originalSize,
            optimized: optimizationResult.optimized
          }
        };

        if (generateThumbnails && file.mimetype.startsWith('image/')) {
          await this.generateThumbnail(finalPath, fileId);
          fileData.metadata.hasThumbnail = true;
        }

        const savedFile = await FileModel.create(fileData);
        processedFiles.push(savedFile);

        logger.info('File processed successfully', { 
          fileId, 
          originalName: file.originalname,
          size: file.size,
          hash: fileHash
        });

      } catch (error) {
        logger.error('Failed to process file', { 
          filename: file.originalname,
          error: error.message 
        });

        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }

        throw error;
      }
    }

    return processedFiles;
  }

  async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  async generateThumbnail(filePath, fileId) {
    try {
      const thumbnailDir = path.join(path.dirname(filePath), 'thumbnails');
      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }

      const thumbnailPath = path.join(thumbnailDir, `${fileId}_thumb.webp`);

      await sharp(filePath)
        .resize(300, 300, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toFile(thumbnailPath);

      logger.debug('Thumbnail generated', { fileId, thumbnailPath });
      return thumbnailPath;
    } catch (error) {
      logger.error('Failed to generate thumbnail', { 
        fileId, 
        error: error.message 
      });
      // Don't throw - thumbnail generation is optional
    }
  }
  async compressFile(filePath, mimeType) {
    try {
      const originalSize = fs.statSync(filePath).size;
      
      // Only compress text-based files and larger files
      if (!this.shouldCompress(mimeType, originalSize)) {
        return {
          compressed: false,
          originalSize,
          compressedSize: originalSize,
          compressionType: null,
          compressedPath: filePath
        };
      }

      const compressedPath = `${filePath}.gz`;
      
      return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(filePath);
        const writeStream = fs.createWriteStream(compressedPath);
        const gzip = zlib.createGzip({ level: 6 });

        readStream
          .pipe(gzip)
          .pipe(writeStream)
          .on('finish', () => {
            const compressedSize = fs.statSync(compressedPath).size;
            const compressionRatio = compressedSize / originalSize;

            // If compression doesn't save significant space, use original
            if (compressionRatio > 0.9) {
              fs.unlinkSync(compressedPath);
              resolve({
                compressed: false,
                originalSize,
                compressedSize: originalSize,
                compressionType: null,
                compressedPath: filePath
              });
            } else {
              // Remove original, use compressed
              fs.unlinkSync(filePath);
              resolve({
                compressed: true,
                originalSize,
                compressedSize,
                compressionType: 'gzip',
                compressedPath
              });
            }
          })
          .on('error', reject);
      });
    } catch (error) {
      logger.error('File compression failed', { filePath, error: error.message });
      return {
        compressed: false,
        originalSize: fs.statSync(filePath).size,
        compressedSize: fs.statSync(filePath).size,
        compressionType: null,
        compressedPath: filePath
      };
    }
  }
  shouldCompress(mimeType, fileSize) {
    // Don't compress small files (< 1KB)
    if (fileSize < 1024) return false;
    
    // Don't compress already compressed formats
    const compressedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/', 'audio/', 'application/zip', 'application/gzip',
      'application/x-rar', 'application/x-7z-compressed'
    ];
    
    if (compressedTypes.some(type => mimeType.startsWith(type))) {
      return false;
    }
    
    // Compress text-based files
    const compressibleTypes = [
      'text/', 'application/json', 'application/xml',
      'application/javascript', 'application/css',
      'application/svg+xml'
    ];
    
    return compressibleTypes.some(type => mimeType.startsWith(type));
  }
  async optimizeImage(filePath, mimeType) {
    try {
      if (!mimeType.startsWith('image/') || mimeType === 'image/gif') {
        return { optimized: false, originalPath: filePath };
      }

      const optimizedPath = `${filePath}.optimized`;
      const originalSize = fs.statSync(filePath).size;

      let sharpInstance = sharp(filePath);
      
      // Apply format-specific optimizations
      if (mimeType === 'image/jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: 85, progressive: true });
      } else if (mimeType === 'image/png') {
        sharpInstance = sharpInstance.png({ quality: 85, progressive: true });
      } else if (mimeType === 'image/webp') {
        sharpInstance = sharpInstance.webp({ quality: 85 });
      }

      await sharpInstance.toFile(optimizedPath);

      const optimizedSize = fs.statSync(optimizedPath).size;
      
      // If optimization saves significant space, use it
      if (optimizedSize < originalSize * 0.9) {
        fs.unlinkSync(filePath);
        fs.renameSync(optimizedPath, filePath);
        
        logger.info('Image optimized', {
          originalSize,
          optimizedSize,
          savings: `${Math.round((1 - optimizedSize/originalSize) * 100)}%`
        });
        
        return {
          optimized: true,
          originalSize,
          optimizedSize,
          optimizedPath: filePath
        };
      } else {
        fs.unlinkSync(optimizedPath);
        return { optimized: false, originalPath: filePath };
      }
    } catch (error) {
      logger.error('Image optimization failed', { filePath, error: error.message });
      return { optimized: false, originalPath: filePath };
    }
  }

  /**
   * Get file by ID with access tracking
   * @param {string} fileId - File ID
   * @param {Object} options - Options
   * @returns {Object|null} File record
   */
  async getFile(fileId, options = {}) {
    const { trackAccess = true } = options;

    try {
      const file = await FileModel.findById(fileId);
      
      if (!file) {
        return null;
      }

      // Update access count if requested
      if (trackAccess) {
        await FileModel.updateAccessCount(fileId);
      }

      return file;
    } catch (error) {
      logger.error('Failed to get file', { fileId, error: error.message });
      throw error;
    }
  }

  /**
   * Get file stream for serving
   * @param {string} filePath - File path
   * @returns {ReadStream} File stream
   */
  getFileStream(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found on disk');
    }

    return fs.createReadStream(filePath);
  }

  /**
   * Delete file (soft delete in DB, actual file removal)
   * @param {string} fileId - File ID to delete
   * @returns {boolean} Success status
   */
  async deleteFile(fileId) {
    try {
      const file = await FileModel.findById(fileId);
      
      if (!file) {
        return false;
      }

      // Soft delete in database
      await FileModel.softDelete(fileId);

      // Remove actual file
      if (fs.existsSync(file.file_path)) {
        fs.unlinkSync(file.file_path);
        logger.info('File deleted from disk', { fileId, path: file.file_path });
      }

      // Remove thumbnail if exists
      const thumbnailPath = this.getThumbnailPath(file.file_path, fileId);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
        logger.debug('Thumbnail deleted', { fileId });
      }

      logger.info('File deleted successfully', { fileId });
      return true;
    } catch (error) {
      logger.error('Failed to delete file', { fileId, error: error.message });
      throw error;
    }
  }

  /**
   * Get thumbnail path for a file
   * @param {string} originalPath - Original file path
   * @param {string} fileId - File ID
   * @returns {string} Thumbnail path
   */
  getThumbnailPath(originalPath, fileId) {
    const thumbnailDir = path.join(path.dirname(originalPath), 'thumbnails');
    return path.join(thumbnailDir, `${fileId}_thumb.webp`);
  }
  /**
   * Get files by context with pagination
   * @param {string} context - Upload context
   * @param {Object} options - Query options
   * @returns {Array} File records
   */
  async getFilesByContext(context, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      return await FileModel.findByContext(context, limit, offset);
    } catch (error) {
      logger.error('Failed to get files by context', { 
        context, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get public file by context and filename
   * @param {string} context - Upload context
   * @param {string} filename - Original filename
   * @param {Object} options - Options
   * @returns {Object|null} File record
   */
  async getPublicFileByContextAndFilename(context, filename, options = {}) {
    try {
      const file = await FileModel.findPublicByContextAndFilename(context, filename);
      
      if (file && options.trackAccess !== false) {
        // Update access count asynchronously
        FileModel.updateAccessCount(file.id).catch(err => {
          logger.warn('Failed to update access count', { 
            fileId: file.id, 
            error: err.message 
          });
        });
      }
      
      return file;
    } catch (error) {
      logger.error('Failed to get public file by context and filename', { 
        context, 
        filename, 
        error: error.message 
      });
      throw error;
    }
  }
  /**
   * Get public file by ID
   * @param {string} fileId - File ID
   * @param {Object} options - Options
   * @returns {Object|null} File record
   */
  async getPublicFile(fileId, options = {}) {
    try {
      const file = await FileModel.findPublicById(fileId);
      
      if (file && options.trackAccess !== false) {
        // Update access count asynchronously
        FileModel.updateAccessCount(fileId).catch(err => {
          logger.warn('Failed to update access count', { 
            fileId, 
            error: err.message 
          });
        });
      }
      
      return file;
    } catch (error) {
      logger.error('Failed to get public file', { 
        fileId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get file by context and filename (authenticated)
   * @param {string} context - Upload context
   * @param {string} filename - Original filename
   * @param {Object} options - Options
   * @returns {Object|null} File record
   */
  async getFileByContextAndFilename(context, filename, options = {}) {
    try {
      const file = await FileModel.findByContextAndFilename(context, filename);
      
      if (file && options.trackAccess !== false) {
        // Update access count asynchronously
        FileModel.updateAccessCount(file.id).catch(err => {
          logger.warn('Failed to update access count', { 
            fileId: file.id, 
            error: err.message 
          });
        });
      }
      
      return file;
    } catch (error) {
      logger.error('Failed to get file by context and filename', { 
        context, 
        filename, 
        error: error.message 
      });
      throw error;
    }
  }/**
   * Get files by uploader with pagination
   * @param {string} uploadedBy - Uploader identifier
   * @param {Object} options - Query options
   * @returns {Array} File records
   */
  async getFilesByUploader(uploadedBy, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      return await FileModel.findByUploadedBy(uploadedBy, limit, offset);
    } catch (error) {
      logger.error('Failed to get files by uploader', { 
        uploadedBy, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Validate file access permissions
   * @param {Object} file - File record
   * @param {Object} req - Request object
   * @returns {boolean} Access allowed
   */
  validateFileAccess(file, req) {
    // Service requests have full access
    if (req.serviceAuthenticated) {
      return true;
    }

    // Public files are accessible to everyone
    if (file.is_public) {
      return true;
    }

    // Users can access their own files
    if (req.user && file.uploaded_by === req.user.id) {
      return true;
    }

    // Upload token holders can access files from their context
    if (req.uploadToken && file.upload_context === req.uploadToken.context) {
      return true;
    }

    return false;
  }
  /**
   * Get file statistics
   * @returns {Object} File statistics
   */
  async getStats() {
    try {
      return await FileModel.getStats();
    } catch (error) {
      logger.error('Failed to get file stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean up old deleted files
   * @param {number} daysOld - Days old threshold
   * @returns {Array} Cleaned file IDs
   */
  async cleanupOldFiles(daysOld = 90) {
    try {
      const deletedFiles = await FileModel.cleanupOldFiles(daysOld);
      logger.info('Old files cleaned up', { count: deletedFiles.length });
      return deletedFiles;
    } catch (error) {
      logger.error('Failed to cleanup old files', { error: error.message });
      throw error;
    }
  }
}

export default new FileService();
