import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';

class TokenService {
  /**
   * Generate a short-lived upload token for frontend uploads
   * @param {Object} options - Token options
   * @param {string} options.context - Upload context (e.g., 'profile-pictures', 'logos')
   * @param {string} options.uploadedBy - User identifier
   * @param {number} options.maxFiles - Maximum files allowed with this token
   * @param {number} options.maxSize - Maximum file size allowed
   * @param {string[]} options.allowedTypes - Allowed MIME types for this token
   * @returns {string} JWT token
   */
  generateUploadToken(options = {}) {
    const {
      context = 'general',
      uploadedBy = 'anonymous',
      maxFiles = 5,
      maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760,
      allowedTypes = null,
      expiresIn = process.env.UPLOAD_TOKEN_EXPIRES_IN || '15m'
    } = options;

    const tokenId = uuidv4();
    const payload = {
      jti: tokenId, // JWT ID
      type: 'upload',
      context,
      uploadedBy,
      maxFiles,
      maxSize,
      allowedTypes,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn,
      issuer: 'otto-server',
      audience: 'otto-upload'
    });

    logger.info('Upload token generated', {
      tokenId,
      context,
      uploadedBy,
      expiresIn
    });

    return {
      token,
      tokenId,
      expiresIn,
      context,
      maxFiles,
      maxSize,
      allowedTypes
    };
  }

  /**
   * Generate a service access token for file access
   * @param {Object} options - Token options
   * @returns {string} JWT token
   */
  generateAccessToken(options = {}) {
    const {
      userId,
      roles = ['user'],
      permissions = [],
      expiresIn = process.env.JWT_EXPIRES_IN || '1h'
    } = options;

    const payload = {
      sub: userId,
      type: 'access',
      roles,
      permissions,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn,
      issuer: 'otto-server',
      audience: 'otto-api'
    });

    logger.info('Access token generated', { userId, roles, expiresIn });

    return {
      token,
      expiresIn,
      userId,
      roles,
      permissions
    };
  }

  /**
   * Verify and decode a token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded;
    } catch (error) {
      logger.warn('Token verification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate a signed URL for temporary file access
   * @param {string} fileId - File ID
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {string} Signed URL
   */
  generateSignedUrl(fileId, expiresIn = 3600) {
    const payload = {
      fileId,
      type: 'file_access',
      exp: Math.floor(Date.now() / 1000) + expiresIn
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET);
    return `/api/files/${fileId}?token=${token}`;
  }
}

export default new TokenService();
