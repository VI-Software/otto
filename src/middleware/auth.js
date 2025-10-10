import jwt from 'jsonwebtoken'
import logger from '../config/logger.js'

// Service token authentication for backend-to-backend communication
export const authenticateService = (req, res, next) => {
    const authHeader = req.headers.authorization
    const serviceToken = process.env.SERVICE_TOKEN

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Missing or invalid authorization header',
            code: 'MISSING_AUTH_HEADER'
        })
    }

    const token = authHeader.substring(7)

    if (!serviceToken || token !== serviceToken) {
        logger.warn('Invalid service token attempt', { 
            ip: req.ip, 
            userAgent: req.get('User-Agent') 
        })
        return res.status(401).json({
            error: 'Invalid service token',
            code: 'INVALID_SERVICE_TOKEN'
        })
    }

    req.authenticationType = 'service'
    req.serviceAuthenticated = true
    logger.debug('Service authentication successful', { ip: req.ip })
    next()
}

// JWT token authentication for frontend uploads
export const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Missing or invalid authorization header',
            code: 'MISSING_AUTH_HEADER'
        })
    }

    const token = authHeader.substring(7)

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded
        req.authenticationType = 'jwt'
        logger.debug('JWT authentication successful', { 
            userId: decoded.sub || decoded.id,
            ip: req.ip 
        })
        next()
    } catch (error) {
        logger.warn('JWT authentication failed', { 
            error: error.message,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        })

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            })
        }

        return res.status(401).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        })
    }
}

// Upload token authentication for temporary upload permissions
export const authenticateUploadToken = (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Missing or invalid authorization header',
            code: 'MISSING_AUTH_HEADER'
        })
    }

    const token = authHeader.substring(7)

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
        // Check if this is specifically an upload token
        if (decoded.type !== 'upload') {
            return res.status(401).json({
                error: 'Invalid token type',
                code: 'INVALID_TOKEN_TYPE'
            })
        }

        req.uploadToken = decoded
        req.authenticationType = 'upload_token'
        logger.debug('Upload token authentication successful', { 
            tokenId: decoded.jti,
            context: decoded.context,
            ip: req.ip 
        })
        next()
    } catch (error) {
        logger.warn('Upload token authentication failed', { 
            error: error.message,
            ip: req.ip 
        })

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Upload token expired',
                code: 'UPLOAD_TOKEN_EXPIRED'
            })
        }

        return res.status(401).json({
            error: 'Invalid upload token',
            code: 'INVALID_UPLOAD_TOKEN'
        })
    }
}

// Flexible authentication - accepts service token, JWT, or upload token
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Missing or invalid authorization header',
            code: 'MISSING_AUTH_HEADER'
        })
    }

    const token = authHeader.substring(7)
    const serviceToken = process.env.SERVICE_TOKEN

    // Try service token first
    if (serviceToken && token === serviceToken) {
        req.authenticationType = 'service'
        req.serviceAuthenticated = true
        logger.debug('Service authentication successful', { ip: req.ip })
        return next()
    }

    // Try JWT tokens (regular or upload)
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
        if (decoded.type === 'upload') {
            req.uploadToken = decoded
            req.authenticationType = 'upload_token'
            logger.debug('Upload token authentication successful', { 
                tokenId: decoded.jti,
                ip: req.ip 
            })
        } else {
            req.user = decoded
            req.authenticationType = 'jwt'
            logger.debug('JWT authentication successful', { 
                userId: decoded.sub || decoded.id,
                ip: req.ip 
            })
        }
    
        next()
    } catch (error) {
        logger.warn('Authentication failed', { 
            error: error.message,
            ip: req.ip 
        })

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            })
        }

        return res.status(401).json({
            error: 'Invalid authentication credentials',
            code: 'INVALID_CREDENTIALS'
        })
    }
}

export const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Missing or invalid authorization header',
            code: 'MISSING_AUTH_HEADER'
        })
    }

    const token = authHeader.substring(7)
    const serviceToken = process.env.SERVICE_TOKEN

    if (serviceToken && token === serviceToken) {
        req.authenticationType = 'service'
        req.serviceAuthenticated = true
        req.adminAuthenticated = true
        logger.debug('Service authentication successful for admin action', { ip: req.ip })
        return next()
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        
        if (decoded.role === 'admin' || decoded.isAdmin === true) {
            req.user = decoded
            req.authenticationType = 'admin_jwt'
            req.adminAuthenticated = true
            logger.debug('Admin JWT authentication successful', { 
                userId: decoded.sub || decoded.id,
                ip: req.ip 
            })
            return next()
        } else {
            return res.status(403).json({
                error: 'Admin access required',
                code: 'ADMIN_ACCESS_REQUIRED'
            })
        }
    } catch (error) {
        logger.warn('Admin authentication failed', { 
            error: error.message,
            ip: req.ip 
        })

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            })
        }

        return res.status(401).json({
            error: 'Invalid admin authentication credentials',
            code: 'INVALID_ADMIN_CREDENTIALS'
        })
    }
}
