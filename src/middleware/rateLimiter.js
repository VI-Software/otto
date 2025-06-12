import rateLimit from 'express-rate-limit';
import logger from '../config/logger.js';

// Custom key generator for Cloudflare environments
const generateKey = (req) => {
  // In production with Cloudflare, prioritize CF-Connecting-IP
  if (process.env.NODE_ENV === 'production') {
    return req.headers['cf-connecting-ip'] || req.ip;
  }
  return req.ip;
};

// Get the real client IP for logging
const getClientIp = (req) => {
  return req.headers['cf-connecting-ip'] || req.ip;
};

// General rate limiter for all routes
export const globalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300,
    message: 'Too many requests, please try again after 15 minutes',
    keyGenerator: generateKey,
    trustProxy: true,
    validate: {
        xForwardedForHeader: false
    },
    standardHeaders: true,
    legacyHeaders: false,    handler: (req, res) => {
        const retryAfter = Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000);
        logger.warn('Rate limit exceeded', {
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'],
            path: req.path,
            retryAfter
        });
        
        res.status(429).json({
            error: 'Too many requests',
            message: 'Too many requests, please try again after 15 minutes',
            retryAfter: retryAfter,
            limitType: 'general'
        });
    }
});

// Stricter rate limiter for authentication routes
export const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many login attempts, please try again after an hour',
    skipSuccessfulRequests: true,
    keyGenerator: generateKey,
    trustProxy: true,
    validate: {
        xForwardedForHeader: false
    },
    standardHeaders: true,
    legacyHeaders: false,    handler: (req, res) => {
        const retryAfter = Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000);
        logger.warn('Auth rate limit exceeded', {
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'],
            path: req.path,
            retryAfter
        });
        
        res.status(429).json({
            error: 'Too many login attempts',
            message: 'Too many login attempts, please try again after an hour',
            retryAfter: retryAfter,
            limitType: 'authentication'
        });
    }
});

// API rate limiter
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 150,
    message: 'Too many API requests, please try again after 15 minutes',
    keyGenerator: generateKey,
    trustProxy: true,
    validate: {
        xForwardedForHeader: false
    },
    standardHeaders: true,
    legacyHeaders: false,    handler: (req, res) => {
        const retryAfter = Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000);
        logger.warn('API rate limit exceeded', {
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'],
            path: req.path,
            retryAfter
        });
        
        res.status(429).json({
            error: 'Too many requests',
            message: 'Too many API requests, please try again after 15 minutes',
            retryAfter: retryAfter,
            limitType: 'API'
        });
    }
});

// Upload rate limiter (stricter for file uploads)
export const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Stricter limit for uploads
    message: 'Too many upload requests, please try again after 15 minutes',
    keyGenerator: generateKey,
    trustProxy: true,
    validate: {
        xForwardedForHeader: false
    },
    standardHeaders: true,
    legacyHeaders: false,    handler: (req, res) => {
        const retryAfter = Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000);
        logger.warn('Upload rate limit exceeded', {
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'],
            path: req.path,
            retryAfter
        });
        
        res.status(429).json({
            error: 'Too many upload requests',
            message: 'Too many upload requests, please try again after 15 minutes',
            retryAfter: retryAfter,
            limitType: 'upload'
        });
    }
});

// File access rate limiter
export const fileLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 200, // Allow more file requests
    message: 'Too many file requests, please try again after 5 minutes',
    keyGenerator: generateKey,
    trustProxy: true,
    validate: {
        xForwardedForHeader: false
    },
    standardHeaders: true,
    legacyHeaders: false,    handler: (req, res) => {
        const retryAfter = Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000);
        logger.warn('File access rate limit exceeded', {
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'],
            path: req.path,
            retryAfter
        });
        
        res.status(429).json({
            error: 'Too many file requests',
            message: 'Too many file requests, please try again after 5 minutes',
            retryAfter: retryAfter,
            limitType: 'file'
        });
    }
});
