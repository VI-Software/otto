import winston from 'winston'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const logLevel = process.env.LOG_LEVEL || 'info'
const logFile = process.env.LOG_FILE || path.join(__dirname, '../../logs/otto.log')

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
)

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`
        }
        return log
    })
)

const logger = winston.createLogger({
    level: logLevel,
    format: logFormat,
    defaultMeta: { service: 'otto' },
    transports: [
        new winston.transports.File({
            filename: logFile,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: path.join(path.dirname(logFile), 'error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5,
        }),
    ],
})

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }))
}

export default logger
