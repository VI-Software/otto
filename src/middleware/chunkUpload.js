import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure chunk temp directory exists
const chunkTempDir = process.env.CHUNK_TEMP_DIR || path.join(__dirname, '../../temp-chunks');
if (!fs.existsSync(chunkTempDir)) {
  fs.mkdirSync(chunkTempDir, { recursive: true });
}

// Chunk size limit (should be larger than expected chunk size to allow for overhead)
const maxChunkSize = parseInt(process.env.MAX_CHUNK_SIZE) || 30 * 1024 * 1024; // 30MB to allow 25MB chunks

// Create storage configuration for chunks
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use general temp directory for chunks - they'll be organized by session
    cb(null, chunkTempDir);
  },
  filename: (req, file, cb) => {
    // Generate temporary filename for chunk
    const tempId = crypto.randomUUID();
    const extension = path.extname(file.originalname).toLowerCase() || '.chunk';
    const filename = `temp-${tempId}${extension}`;
    cb(null, filename);
  }
});

// File filter for chunks - more permissive than regular uploads
const chunkFileFilter = async (req, file, cb) => {
  try {
    // For chunks, we're less strict about MIME types since it's partial data
    // The final assembled file will be validated properly
    
    // Just ensure it's not a dangerous executable
    const extension = path.extname(file.originalname).toLowerCase();
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
      '.sh', '.ps1', '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl'
    ];
    
    if (dangerousExtensions.includes(extension)) {
      logger.warn('Blocked dangerous file extension in chunk upload', { 
        filename: file.originalname,
        extension,
        ip: req.ip 
      });
      return cb(new Error(`File type ${extension} is not allowed for security reasons`));
    }

    cb(null, true);
  } catch (error) {
    logger.error('Chunk file filter error', { error: error.message });
    cb(error);
  }
};

// Create multer upload middleware for chunks
const chunkUpload = multer({
  storage: chunkStorage,
  fileFilter: chunkFileFilter,
  limits: {
    fileSize: maxChunkSize,
    files: 1, // Only one chunk per request
    fields: 5,
    fieldNameSize: 100,
    fieldSize: 1024 // 1KB for form fields
  }
});

// Middleware to handle chunk upload errors
export const handleChunkUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.warn('Multer chunk upload error', { 
      error: err.message, 
      code: err.code,
      ip: req.ip 
    });

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: `Chunk too large. Maximum chunk size is ${Math.round(maxChunkSize / 1024 / 1024)}MB`,
          code: 'CHUNK_TOO_LARGE'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Only one chunk per request allowed',
          code: 'TOO_MANY_CHUNKS'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected file field',
          code: 'UNEXPECTED_CHUNK_FIELD'
        });
      default:
        return res.status(400).json({
          error: err.message,
          code: 'CHUNK_UPLOAD_ERROR'
        });
    }
  }

  if (err.message.includes('not allowed')) {
    return res.status(400).json({
      error: err.message,
      code: 'CHUNK_FILE_TYPE_NOT_ALLOWED'
    });
  }

  next(err);
};

// Middleware to validate chunk parameters
export const validateChunkParams = (req, res, next) => {
  const { sessionId, chunkIndex } = req.params;
  
  if (!sessionId) {
    return res.status(400).json({
      error: 'Session ID is required',
      code: 'MISSING_SESSION_ID'
    });
  }

  const chunkIndexNum = parseInt(chunkIndex);
  if (isNaN(chunkIndexNum) || chunkIndexNum < 0) {
    return res.status(400).json({
      error: 'Valid chunk index is required',
      code: 'INVALID_CHUNK_INDEX'
    });
  }

  // Add parsed values to request
  req.sessionId = sessionId;
  req.chunkIndex = chunkIndexNum;
  
  next();
};

// Middleware to validate session initialization data
export const validateSessionInit = (req, res, next) => {
  const { originalFilename, totalSize, mimeType } = req.body;
  
  if (!originalFilename || typeof originalFilename !== 'string') {
    return res.status(400).json({
      error: 'originalFilename is required and must be a string',
      code: 'INVALID_FILENAME'
    });
  }

  const totalSizeNum = parseInt(totalSize);
  if (!totalSize || isNaN(totalSizeNum) || totalSizeNum <= 0) {
    return res.status(400).json({
      error: 'totalSize is required and must be a positive number',
      code: 'INVALID_TOTAL_SIZE'
    });
  }

  if (!mimeType || typeof mimeType !== 'string') {
    return res.status(400).json({
      error: 'mimeType is required and must be a string',
      code: 'INVALID_MIME_TYPE'
    });
  }

  // Validate filename extension
  const extension = path.extname(originalFilename).toLowerCase();
  const dangerousExtensions = [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
    '.sh', '.ps1', '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl'
  ];
  
  if (dangerousExtensions.includes(extension)) {
    return res.status(400).json({
      error: `File type ${extension} is not allowed for security reasons`,
      code: 'DANGEROUS_FILE_TYPE'
    });
  }

  // Add parsed values to request
  req.totalSize = totalSizeNum;
  
  next();
};

// Export configured upload middleware
export const uploadSingleChunk = chunkUpload.single('chunk');

// Export configuration
export { maxChunkSize, chunkTempDir };
