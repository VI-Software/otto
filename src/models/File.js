import database from '../config/database.js';
import logger from '../config/logger.js';

class FileModel {  async create(fileData) {
    const query = `
      INSERT INTO files (
        id, filename, original_name, file_path, mime_type, 
        file_size, upload_context, uploaded_by, upload_source,
        metadata, is_public, file_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `;

    const values = [
      fileData.id,
      fileData.filename,
      fileData.originalName,
      fileData.filePath,
      fileData.mimeType,
      fileData.fileSize,
      fileData.uploadContext || 'general',
      fileData.uploadedBy || 'system',
      fileData.uploadSource || 'api',
      JSON.stringify(fileData.metadata || {}),
      fileData.isPublic || false,
      fileData.fileHash || null,
    ];

    try {
      const result = await database.query(query, values);
      logger.info('File record created', { fileId: fileData.id });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create file record', { 
        error: error.message, 
        fileId: fileData.id 
      });
      throw error;
    }
  }
  async findById(id) {
    const query = 'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL';
    
    try {
      const result = await database.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find file by ID', { error: error.message, id });
      throw error;
    }
  }

  async findByHash(hash) {
    const query = 'SELECT * FROM files WHERE file_hash = $1 AND deleted_at IS NULL';
    
    try {
      const result = await database.query(query, [hash]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find file by hash', { error: error.message, hash });
      throw error;
    }
  }

  async findDuplicatesByHash(hash) {
    const query = 'SELECT * FROM files WHERE file_hash = $1 AND deleted_at IS NULL ORDER BY created_at ASC';
    
    try {
      const result = await database.query(query, [hash]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find duplicates by hash', { error: error.message, hash });
      throw error;
    }
  }

  async findByContext(context, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM files 
      WHERE upload_context = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await database.query(query, [context, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find files by context', { 
        error: error.message, 
        context 
      });
      throw error;
    }
  }
  async findByUploadedBy(uploadedBy, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM files 
      WHERE uploaded_by = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await database.query(query, [uploadedBy, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find files by uploader', { 
        error: error.message, 
        uploadedBy 
      });
      throw error;
    }
  }

  async findByContextAndFilename(context, filename) {
    const query = `
      SELECT * FROM files 
      WHERE upload_context = $1 AND original_name = $2 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    try {
      const result = await database.query(query, [context, filename]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find file by context and filename', { 
        error: error.message, 
        context,
        filename 
      });
      throw error;
    }
  }

  async findPublicByContextAndFilename(context, filename) {
    const query = `
      SELECT * FROM files 
      WHERE upload_context = $1 AND original_name = $2 
      AND is_public = TRUE AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    try {
      const result = await database.query(query, [context, filename]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find public file by context and filename', { 
        error: error.message, 
        context,
        filename 
      });
      throw error;
    }
  }

  async findPublicById(id) {
    const query = 'SELECT * FROM files WHERE id = $1 AND is_public = TRUE AND deleted_at IS NULL';
    
    try {
      const result = await database.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find public file by ID', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Find public file by hash prefix, context, and filename
   * @param {string} hashPrefix - First 12 characters of file hash
   * @param {string} context - Upload context
   * @param {string} filename - Original filename
   * @returns {Object|null} File record
   */
  async findPublicByHashAndContext(hashPrefix, context, filename) {
    const query = `
      SELECT * FROM files 
      WHERE LEFT(file_hash, 12) = $1 
      AND upload_context = $2 
      AND original_name = $3 
      AND is_public = TRUE 
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    try {
      const result = await database.query(query, [hashPrefix, context, filename]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find public file by hash and context', { 
        error: error.message, 
        hashPrefix,
        context,
        filename 
      });
      throw error;
    }
  }

  async updateAccessCount(id) {
    const query = `
      UPDATE files 
      SET access_count = access_count + 1, last_accessed_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING access_count
    `;
    
    try {
      const result = await database.query(query, [id]);
      return result.rows[0]?.access_count || 0;
    } catch (error) {
      logger.error('Failed to update access count', { error: error.message, id });
      throw error;
    }
  }

  async softDelete(id) {
    const query = `
      UPDATE files 
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    
    try {
      const result = await database.query(query, [id]);
      if (result.rows.length > 0) {
        logger.info('File soft deleted', { fileId: id });
        return result.rows[0];
      }
      return null;
    } catch (error) {
      logger.error('Failed to soft delete file', { error: error.message, id });
      throw error;
    }
  }

  async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total_files,
        SUM(file_size) as total_size,
        AVG(file_size) as avg_size,
        COUNT(DISTINCT upload_context) as unique_contexts,
        COUNT(DISTINCT uploaded_by) as unique_uploaders
      FROM files 
      WHERE deleted_at IS NULL
    `;
    
    try {
      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get file stats', { error: error.message });
      throw error;
    }
  }

  async cleanupOldFiles(daysOld = 90) {
    const query = `
      DELETE FROM files 
      WHERE deleted_at IS NOT NULL 
      AND deleted_at < NOW() - INTERVAL '${daysOld} days'
      RETURNING id
    `;
    
    try {
      const result = await database.query(query);
      logger.info('Cleaned up old files', { count: result.rows.length });
      return result.rows;
    } catch (error) {
      logger.error('Failed to cleanup old files', { error: error.message });
      throw error;
    }
  }
}

export default new FileModel();
