import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

import logger from './config/logger.js'
import database from './config/database.js'
import uploadRoutes from './routes/upload.js'
import chunkedUploadRoutes from './routes/chunkedUpload.js'
import fileRoutes from './routes/files.js'
import publicRoutes from './routes/public.js'
import healthRoutes from './routes/health.js'
import HomeController from './controllers/HomeController.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { requestLogger } from './middleware/requestLogger.js'
import { globalLimiter, apiLimiter, fileLimiter } from './middleware/rateLimiter.js'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
// eslint-disable-next-line no-unused-vars
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// Set powered by header to otto
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'otto')
    next()
})

// Trust proxy for Cloudflare
app.set('trust proxy', true)

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ['\'self\'', '*'],
            styleSrc: ['\'self\'', '\'unsafe-inline\'', '*'],
            scriptSrc: ['\'self\'', '*'],
            imgSrc: ['\'self\'', 'data:', 'blob:', '*'],
            mediaSrc: ['\'self\'', '*'],
            connectSrc: ['\'self\'', '*'],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}))

// CORS configuration - More permissive for CDN compatibility
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
    maxAge: 86400, // 24 hours
    credentials: false
}))

// Apply global rate limiting
app.use(globalLimiter)
app.use(compression())
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

app.use(requestLogger)

// Homepage
app.get('/', HomeController.home)
app.get('/stats', HomeController.stats)

// Core routes with specific rate limiting
app.use('/upload', apiLimiter, uploadRoutes)
app.use('/upload/chunk', chunkedUploadRoutes)
app.use('/files', fileLimiter, fileRoutes)
app.use('/f', fileLimiter, fileRoutes)
app.use('/public', fileLimiter, publicRoutes)
app.use('/p', fileLimiter, publicRoutes)
app.use('/health', healthRoutes)

// Error handling middleware
app.use(notFoundHandler)
app.use(errorHandler)

// Initialize database and start server
async function startServer() {
    try {
    // Test database connection (but don't fail if it's not available)
        try {
            await database.testConnection()
            logger.info('Database connection established')
        } catch (dbError) {
            logger.warn('Database connection failed - server will start but database features will be unavailable', {
                error: dbError.message
            })    }

        const server = app.listen(PORT, () => {
            logger.info(`Otto file server running on port ${PORT}`)
            logger.info(`Homepage: http://localhost:${PORT}`)
            logger.info('Endpoints:')
            logger.info('  POST /upload - Upload files')
            logger.info('  GET  /files/{id} - Get file by ID')
            logger.info('  GET  /f/{id} - Short URL for files')
            logger.info('  GET  /public/{context}/{filename} - Public files')
            logger.info('  GET  /p/{context}/{filename} - Short URL for public files')
            logger.info('  GET  /stats - Server statistics')
            logger.info('  GET  /health - Health check')
        })

        return server
    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully')
    await database.close()
    process.exit(0)
})

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully')
    await database.close()
    process.exit(0)
})

// Only start the HTTP server when not running tests. This allows importing
// the Express `app` in tests without starting a listening socket.
if (process.env.NODE_ENV !== 'test') {
    startServer()
}

export default app
