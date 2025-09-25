import logger from '../config/logger.js'

export const errorHandler = (err, req, res, next) => {
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    })

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development'

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: isDevelopment ? err.details : undefined
        })
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Unauthorized',
            code: 'UNAUTHORIZED'
        })
    }

    if (err.name === 'ForbiddenError') {
        return res.status(403).json({
            error: 'Forbidden',
            code: 'FORBIDDEN'
        })
    }

    if (err.name === 'NotFoundError') {
        return res.status(404).json({
            error: 'Resource not found',
            code: 'NOT_FOUND'
        })
    }

    // Database errors
    if (err.code === '23505') { // PostgreSQL unique constraint violation
        return res.status(409).json({
            error: 'Resource already exists',
            code: 'DUPLICATE_RESOURCE'
        })
    }

    if (err.code === '23503') { // PostgreSQL foreign key violation
        return res.status(400).json({
            error: 'Invalid reference',
            code: 'INVALID_REFERENCE'
        })
    }

    // Default error response
    res.status(500).json({
        error: isDevelopment ? err.message : 'Internal server error',
        code: 'INTERNAL_ERROR',
        stack: isDevelopment ? err.stack : undefined
    })
}

export const notFoundHandler = (req, res) => {
    logger.warn('Route not found', {
        url: req.url,
        method: req.method,
        ip: req.ip
    })

    res.status(404).json({
        error: 'Route not found',
        code: 'ROUTE_NOT_FOUND'
    })
}

// Async error wrapper
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}
