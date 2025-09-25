import pg from 'pg'
import logger from './logger.js'

const { Pool } = pg

class Database {
    constructor() {
        this.pool = null
    }

    getPool() {
        if (!this.pool) {
            const config = {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                database: process.env.DB_NAME || 'otto',
                user: process.env.DB_USER || 'otto_user',
                password: process.env.DB_PASSWORD,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
                ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
            }

            logger.info('Database connection config:', {
                host: config.host,
                port: config.port,
                database: config.database,
                user: config.user,
                password: config.password ? '[SET]' : '[NOT SET]',
                ssl: config.ssl ? 'enabled' : 'disabled'
            })

            this.pool = new Pool(config)

            this.pool.on('error', (err) => {
                logger.error('Unexpected error on idle client', err)
            })
        }
        return this.pool
    }

    async query(text, params) {
        const start = Date.now()
        const pool = this.getPool()
        const client = await pool.connect()
    
        try {
            const res = await client.query(text, params)
            const duration = Date.now() - start
            logger.debug('Executed query', { text, duration, rows: res.rowCount })
            return res
        } catch (error) {
            logger.error('Database query error', { error: error.message, text })
            throw error
        } finally {
            client.release()
        }
    }

    async transaction(callback) {
        const pool = this.getPool()
        const client = await pool.connect()
    
        try {
            await client.query('BEGIN')
            const result = await callback(client)
            await client.query('COMMIT')
            return result
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally {
            client.release()
        }
    }

    async testConnection() {
        try {
            const result = await this.query('SELECT NOW() as current_time')
            logger.info('Database connection test successful', { 
                time: result.rows[0].current_time 
            })
            return true
        } catch (error) {
            logger.error('Database connection test failed', error)
            throw error
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end()
            logger.info('Database connection pool closed')
        }
    }
}

const database = new Database()
export default database
