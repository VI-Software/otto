import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fileTypeFromBuffer } from 'file-type';
import crypto from 'crypto';
import logger from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File size limit from environment or default to 10MB
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;

// Allowed MIME types from environment
const allowedMimeTypes = process.env.ALLOWED_MIME_TYPES 
  ? process.env.ALLOWED_MIME_TYPES.split(',').map(type => type.trim())
  : [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

// Dangerous file extensions to block
const dangerousExtensions = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.sh', '.ps1', '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl'
];

// Create storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create context-specific subdirectories
    const context = req.body.context || req.uploadToken?.context || 'general';
    const contextDir = path.join(uploadDir, context);
    
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }
    
    cb(null, contextDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp and random string
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(file.originalname).toLowerCase();
    const basename = path.basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50);
    
    const filename = `${timestamp}_${randomString}_${basename}${extension}`;
    cb(null, filename);
  }
});

// File filter function
const fileFilter = async (req, file, cb) => {
  try {
    // Check file extension
    const extension = path.extname(file.originalname).toLowerCase();
    
    if (dangerousExtensions.includes(extension)) {
      logger.warn('Blocked dangerous file extension', { 
        filename: file.originalname,
        extension,
        ip: req.ip 
      });
      return cb(new Error(`File type ${extension} is not allowed for security reasons`));
    }

    // Check MIME type
    if (!allowedMimeTypes.includes(file.mimetype)) {
      logger.warn('Blocked disallowed MIME type', { 
        filename: file.originalname,
        mimetype: file.mimetype,
        ip: req.ip 
      });
      return cb(new Error(`File type ${file.mimetype} is not allowed`));
    }

    cb(null, true);
  } catch (error) {
    logger.error('File filter error', { error: error.message });
    cb(error);
  }
};

// Create multer upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize,
    files: 5, // Maximum 5 files per request
    fields: 10,
    fieldNameSize: 100,
    fieldSize: 1024 * 1024 // 1MB for form fields
  }
});

// File validation middleware to verify file contents
export const validateFileContents = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    for (const file of req.files) {
      // Read first few bytes to detect actual file type
      const buffer = fs.readFileSync(file.path, { start: 0, end: 4095 });
      const detectedType = await fileTypeFromBuffer(buffer);

      if (detectedType) {
        // Check if detected MIME type matches declared MIME type
        if (detectedType.mime !== file.mimetype) {
          logger.warn('MIME type mismatch detected', {
            filename: file.originalname,
            declared: file.mimetype,
            detected: detectedType.mime,
            ip: req.ip
          });

          // For security, we'll be strict about MIME type matching
          if (!allowedMimeTypes.includes(detectedType.mime)) {
            // Clean up uploaded file
            fs.unlinkSync(file.path);
            return res.status(400).json({
              error: `File appears to be ${detectedType.mime} but was declared as ${file.mimetype}`,
              code: 'MIME_TYPE_MISMATCH'
            });
          }

          // Update the MIME type to the detected one
          file.mimetype = detectedType.mime;
        }
      }

      // Additional checks for images
      if (file.mimetype.startsWith('image/')) {
        // Basic image validation - check for valid image headers
        const isValidImage = await validateImageFile(file.path);
        if (!isValidImage) {
          fs.unlinkSync(file.path);
          return res.status(400).json({
            error: 'Invalid or corrupted image file',
            code: 'INVALID_IMAGE'
          });
        }
      }
    }

    next();
  } catch (error) {
    logger.error('File content validation error', { error: error.message });
    
    // Clean up any uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    res.status(500).json({
      error: 'File validation failed',
      code: 'VALIDATION_ERROR'
    });
  }
};

// Basic image validation
async function validateImageFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath, { start: 0, end: 1023 });
    
    // Check for common image file signatures
    const signatures = {
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47],
      gif: [0x47, 0x49, 0x46],
      webp: [0x52, 0x49, 0x46, 0x46] // RIFF header for WebP
    };

    for (const [format, signature] of Object.entries(signatures)) {
      if (signature.every((byte, index) => buffer[index] === byte)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error('Image validation error', { error: error.message, filePath });
    return false;
  }
}

// Error handler for multer
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.warn('Multer upload error', { 
      error: err.message, 
      code: err.code,
      ip: req.ip 
    });

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: `File too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`,
          code: 'FILE_TOO_LARGE'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files. Maximum 5 files per request',
          code: 'TOO_MANY_FILES'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected file field',
          code: 'UNEXPECTED_FILE'
        });
      default:
        return res.status(400).json({
          error: err.message,
          code: 'UPLOAD_ERROR'
        });
    }
  }

  if (err.message.includes('not allowed')) {
    return res.status(400).json({
      error: err.message,
      code: 'FILE_TYPE_NOT_ALLOWED'
    });
  }

  next(err);
};

// Export configured upload middleware
export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files', 5);
export const uploadFields = upload.fields([
  { name: 'files', maxCount: 5 },
  { name: 'file', maxCount: 1 }
]);

export { allowedMimeTypes, maxFileSize, uploadDir };
