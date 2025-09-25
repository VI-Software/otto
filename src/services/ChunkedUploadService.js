import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import logger from '../config/logger.js'
import FileService from './FileService.js'

class ChunkedUploadService {
    constructor() {
    // Configuration from environment or defaults
        this.chunkSize = parseInt(process.env.CHUNK_SIZE) || 25 * 1024 * 1024 // 25MB default
        this.sessionTimeout = parseInt(process.env.CHUNK_SESSION_TIMEOUT) || 24 * 60 * 60 * 1000 // 24 hours
        this.maxConcurrentChunks = parseInt(process.env.MAX_CONCURRENT_CHUNKS) || 10
        this.tempDir = process.env.CHUNK_TEMP_DIR || path.join(process.cwd(), 'temp-chunks')
    
        // Ensure temp directory exists
        this.ensureTempDir()
    
        // In-memory session tracking (in production, use Redis or database)
        this.uploadSessions = new Map()
    
        // Cleanup expired sessions periodically
        this.startCleanupTimer()
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true })
            logger.info('Created temp directory for chunked uploads', { path: this.tempDir })
        }
    }

    /**
   * Initialize a new chunked upload session
   */
    async initializeSession(options) {
        const {
            originalFilename,
            totalSize,
            totalChunks,
            mimeType,
            context = 'general',
            uploadedBy = 'system',
            uploadSource = 'api',
            metadata = {}
        } = options

        const sessionId = uuidv4()
        const fileHash = crypto.createHash('sha256')
            .update(`${originalFilename}-${totalSize}-${Date.now()}`)
            .digest('hex')

        const session = {
            id: sessionId,
            originalFilename,
            totalSize,
            totalChunks,
            mimeType,
            context,
            uploadedBy,
            uploadSource,
            metadata,
            fileHash,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + this.sessionTimeout),
            chunks: new Map(), // chunkIndex -> { uploaded: boolean, path: string, size: number }
            completed: false,
            finalFilePath: null
        }

        this.uploadSessions.set(sessionId, session)

        logger.info('Chunked upload session initialized', {
            sessionId,
            originalFilename,
            totalSize,
            totalChunks,
            context,
            uploadedBy
        })

        return {
            sessionId,
            chunkSize: this.chunkSize,
            expiresAt: session.expiresAt
        }
    }

    /**
   * Upload a single chunk
   */
    async uploadChunk(sessionId, chunkIndex, chunkBuffer, chunkSize) {
        const session = this.uploadSessions.get(sessionId)
        if (!session) {
            throw new Error('Upload session not found or expired')
        }

        if (this.isSessionExpired(session)) {
            await this.cleanupSession(sessionId)
            throw new Error('Upload session has expired')
        }

        if (chunkIndex >= session.totalChunks || chunkIndex < 0) {
            throw new Error('Invalid chunk index')
        }

        // Create session-specific temp directory
        const sessionTempDir = path.join(this.tempDir, sessionId)
        if (!fs.existsSync(sessionTempDir)) {
            fs.mkdirSync(sessionTempDir, { recursive: true })
        }

        const chunkPath = path.join(sessionTempDir, `chunk-${chunkIndex}`)
    
        // Write chunk to disk
        fs.writeFileSync(chunkPath, chunkBuffer)

        // Update session
        session.chunks.set(chunkIndex, {
            uploaded: true,
            path: chunkPath,
            size: chunkSize,
            uploadedAt: new Date()
        })

        const uploadedChunks = Array.from(session.chunks.values()).filter(c => c.uploaded).length
        const progress = (uploadedChunks / session.totalChunks) * 100

        logger.info('Chunk uploaded', {
            sessionId,
            chunkIndex,
            chunkSize,
            progress: Math.round(progress),
            uploadedChunks,
            totalChunks: session.totalChunks
        })

        // Check if all chunks are uploaded
        if (uploadedChunks === session.totalChunks) {
            await this.assembleFile(sessionId)
        }

        return {
            chunkIndex,
            uploaded: true,
            progress,
            uploadedChunks,
            totalChunks: session.totalChunks,
            completed: session.completed
        }
    }

    /**
   * Get upload session status
   */
    getSessionStatus(sessionId) {
        const session = this.uploadSessions.get(sessionId)
        if (!session) {
            return null
        }

        if (this.isSessionExpired(session)) {
            this.cleanupSession(sessionId)
            return null
        }

        const uploadedChunks = Array.from(session.chunks.values()).filter(c => c.uploaded)
        const missingChunks = []
    
        for (let i = 0; i < session.totalChunks; i++) {
            if (!session.chunks.has(i) || !session.chunks.get(i).uploaded) {
                missingChunks.push(i)
            }
        }

        return {
            sessionId: session.id,
            originalFilename: session.originalFilename,
            totalSize: session.totalSize,
            totalChunks: session.totalChunks,
            uploadedChunks: uploadedChunks.length,
            missingChunks,
            progress: (uploadedChunks.length / session.totalChunks) * 100,
            completed: session.completed,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt
        }
    }
    /**
   * Assemble all chunks into final file
   */
    async assembleFile(sessionId) {
        const session = this.uploadSessions.get(sessionId)
        if (!session) {
            throw new Error('Upload session not found')
        }

        if (session.completed) {
            // Return the processed file object, not just the path
            if (session.processedFile) {
                return session.processedFile
            } else {
                throw new Error('Session completed but no processed file found')
            }
        }

        // Verify all chunks are present
        for (let i = 0; i < session.totalChunks; i++) {
            if (!session.chunks.has(i) || !session.chunks.get(i).uploaded) {
                throw new Error(`Missing chunk ${i}`)
            }
        }

        // Create temporary file for assembly
        const tempFileName = `${session.id}-${session.originalFilename}`
        const tempFilePath = path.join(this.tempDir, tempFileName)
        const writeStream = fs.createWriteStream(tempFilePath)

        try {
            // Assemble chunks in order
            for (let i = 0; i < session.totalChunks; i++) {
                const chunk = session.chunks.get(i)
                const chunkData = fs.readFileSync(chunk.path)
                writeStream.write(chunkData)
            }

            writeStream.end()

            // Wait for write to complete
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve)
                writeStream.on('error', reject)
            })

            // Verify file size
            const stats = fs.statSync(tempFilePath)
            if (stats.size !== session.totalSize) {
                throw new Error(`Assembled file size (${stats.size}) doesn't match expected size (${session.totalSize})`)
            }

            // Process the assembled file through the regular upload pipeline
            const processedFile = await this.processAssembledFile(session, tempFilePath)

            if (!processedFile) {
                throw new Error('No file was returned from processAssembledFile')
            }

            session.completed = true
            session.finalFilePath = processedFile.file_path
            session.processedFile = processedFile

            logger.info('Chunked upload completed and assembled', {
                sessionId,
                originalFilename: session.originalFilename,
                finalSize: stats.size,
                fileId: processedFile.id
            })

            // Cleanup chunks (but keep session for a while for status queries)
            await this.cleanupChunks(sessionId)

            return processedFile

        } catch (error) {
            // Cleanup on error
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath)
            }
            throw error
        }
    }  /**
   * Process assembled file through regular FileService
   */
    async processAssembledFile(session, tempFilePath) {
        try {
            // Get proper upload directory (same as regular upload middleware)
            const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
            const contextDir = path.join(uploadDir, session.context)
      
            // Ensure context directory exists
            if (!fs.existsSync(contextDir)) {
                fs.mkdirSync(contextDir, { recursive: true })
            }

            // Generate proper filename (similar to regular upload middleware)
            const fileId = crypto.randomUUID()
            const extension = path.extname(session.originalFilename).toLowerCase()
            const finalFilename = `${fileId}${extension}`
            const finalFilePath = path.join(contextDir, finalFilename)

            // Move assembled file to proper location
            fs.renameSync(tempFilePath, finalFilePath)

            logger.info('Moved assembled file to final location', {
                sessionId: session.id,
                from: tempFilePath,
                to: finalFilePath
            })

            // Create a file object similar to multer format
            const fileObj = {
                path: finalFilePath,
                originalname: session.originalFilename,
                filename: finalFilename,
                mimetype: session.mimeType,
                size: session.totalSize,
                encoding: '7bit',
                fieldname: 'file'
            }

            // Process through FileService
            const processedFiles = await FileService.processUploadedFiles([fileObj], {
                context: session.context,
                uploadedBy: session.uploadedBy,
                uploadSource: session.uploadSource,
                generateThumbnails: false, // Can be added as option later
                metadata: {
                    ...session.metadata,
                    chunkedUpload: true,
                    sessionId: session.id,
                    originalTotalSize: session.totalSize,
                    totalChunks: session.totalChunks
                }
            })

            if (!processedFiles || processedFiles.length === 0) {
                throw new Error('FileService did not return any processed files')
            }

            const processedFile = processedFiles[0]
            if (!processedFile || !processedFile.id) {
                throw new Error('FileService returned invalid file object')
            }

            return processedFile
        } catch (error) {
            logger.error('Failed to process assembled file', {
                sessionId: session.id,
                error: error.message,
                tempFilePath
            })
            throw error
        }
    }

    /**
   * Cleanup chunks for a session
   */
    async cleanupChunks(sessionId) {
        const session = this.uploadSessions.get(sessionId)
        if (!session) return

        const sessionTempDir = path.join(this.tempDir, sessionId)
        if (fs.existsSync(sessionTempDir)) {
            try {
                // Remove all chunk files
                const files = fs.readdirSync(sessionTempDir)
                for (const file of files) {
                    const filePath = path.join(sessionTempDir, file)
                    fs.unlinkSync(filePath)
                }
                fs.rmdirSync(sessionTempDir)
        
                logger.debug('Cleaned up chunks for session', { sessionId })
            } catch (error) {
                logger.warn('Failed to cleanup chunks', { sessionId, error: error.message })
            }
        }
    }

    /**
   * Cleanup entire session
   */
    async cleanupSession(sessionId) {
        await this.cleanupChunks(sessionId)
        this.uploadSessions.delete(sessionId)
        logger.debug('Cleaned up session', { sessionId })
    }

    /**
   * Check if session is expired
   */
    isSessionExpired(session) {
        return new Date() > session.expiresAt
    }

    /**
   * Start periodic cleanup of expired sessions
   */
    startCleanupTimer() {
        setInterval(async () => {
            const now = new Date()
            const expiredSessions = []

            for (const [sessionId, session] of this.uploadSessions) {
                if (now > session.expiresAt) {
                    expiredSessions.push(sessionId)
                }
            }

            for (const sessionId of expiredSessions) {
                logger.info('Cleaning up expired session', { sessionId })
                await this.cleanupSession(sessionId)
            }

            if (expiredSessions.length > 0) {
                logger.info('Cleaned up expired sessions', { count: expiredSessions.length })
            }
        }, 60 * 60 * 1000) // Run every hour
    }

    /**
   * Resume upload - get missing chunks for a session
   */
    getMissingChunks(sessionId) {
        const status = this.getSessionStatus(sessionId)
        if (!status) {
            return null
        }
        return status.missingChunks
    }

    /**
   * Cancel upload session
   */
    async cancelSession(sessionId) {
        const session = this.uploadSessions.get(sessionId)
        if (session) {
            await this.cleanupSession(sessionId)
            logger.info('Upload session cancelled', { sessionId })
            return true
        }
        return false
    }

    /**
   * Get current configuration
   */
    getConfig() {
        return {
            chunkSize: this.chunkSize,
            sessionTimeout: this.sessionTimeout,
            maxConcurrentChunks: this.maxConcurrentChunks,
            tempDir: this.tempDir
        }
    }
}

export default new ChunkedUploadService()
