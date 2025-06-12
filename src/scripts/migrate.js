import database from '../config/database.js';
import logger from '../config/logger.js';

const migrations = [
  {
    version: 1,
    name: 'create_files_table',
    up: `
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL,
        upload_context VARCHAR(100) NOT NULL DEFAULT 'general',
        uploaded_by VARCHAR(100) NOT NULL DEFAULT 'system',
        upload_source VARCHAR(50) NOT NULL DEFAULT 'api',
        metadata JSONB DEFAULT '{}',
        access_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_accessed_at TIMESTAMP WITH TIME ZONE,
        deleted_at TIMESTAMP WITH TIME ZONE
      );
    `,
    down: `DROP TABLE IF EXISTS files;`
  },
  {
    version: 2,
    name: 'create_indexes',
    up: `
      CREATE INDEX IF NOT EXISTS idx_files_upload_context ON files(upload_context);
      CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
      CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);
      CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_files_mime_type ON files(mime_type);
    `,    down: `
      DROP INDEX IF EXISTS idx_files_upload_context;
      DROP INDEX IF EXISTS idx_files_uploaded_by;
      DROP INDEX IF EXISTS idx_files_created_at;
      DROP INDEX IF EXISTS idx_files_deleted_at;
      DROP INDEX IF EXISTS idx_files_mime_type;
    `
  },
  {
    version: 3,
    name: 'create_migration_table',
    up: `
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `,
    down: `DROP TABLE IF EXISTS migrations;`
  },  {
    version: 4,
    name: 'add_public_support',
    up: `
      ALTER TABLE files ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_files_is_public ON files(is_public);
      CREATE INDEX IF NOT EXISTS idx_files_context_filename ON files(upload_context, original_name) WHERE deleted_at IS NULL;
    `,
    down: `
      DROP INDEX IF EXISTS idx_files_is_public;
      DROP INDEX IF EXISTS idx_files_context_filename;
      ALTER TABLE files DROP COLUMN IF EXISTS is_public;
    `
  },
  {
    version: 5,
    name: 'add_file_hash_support',
    up: `
      ALTER TABLE files ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);
      CREATE INDEX IF NOT EXISTS idx_files_hash ON files(file_hash) WHERE file_hash IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_files_hash_size ON files(file_hash, file_size) WHERE file_hash IS NOT NULL;
    `,
    down: `
      DROP INDEX IF EXISTS idx_files_hash;
      DROP INDEX IF EXISTS idx_files_hash_size;
      ALTER TABLE files DROP COLUMN IF EXISTS file_hash;
    `
  }
];

class MigrationRunner {
  async getCurrentVersion() {
    try {
      const result = await database.query(
        'SELECT MAX(version) as version FROM migrations'
      );
      return result.rows[0]?.version || 0;
    } catch (error) {
      // Migration table doesn't exist yet
      return 0;
    }
  }

  async recordMigration(version, name) {
    await database.query(
      'INSERT INTO migrations (version, name) VALUES ($1, $2)',
      [version, name]
    );
  }
  async runMigrations() {
    logger.info('Starting database migrations...');

    try {
      const currentVersion = await this.getCurrentVersion();
      logger.info(`Current database version: ${currentVersion}`);

      const pendingMigrations = migrations.filter(m => m.version > currentVersion);
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(`Found ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        logger.info(`Running migration ${migration.version}: ${migration.name}`);
        
        await database.transaction(async (client) => {
          // Run the migration
          await client.query(migration.up);
          
          // Record this migration in the migrations table
          // First ensure the migrations table exists for version 3+
          if (migration.version >= 3) {
            await client.query(`
              CREATE TABLE IF NOT EXISTS migrations (
                version INTEGER PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
              );
            `);
          }
          
          await client.query(
            'INSERT INTO migrations (version, name) VALUES ($1, $2)',
            [migration.version, migration.name]
          );
        });

        logger.info(`Migration ${migration.version} completed`);
      }

      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed', { error: error.message });
      throw error;
    }
  }

  async rollback(targetVersion) {
    logger.info(`Rolling back to version ${targetVersion}`);

    try {
      const currentVersion = await this.getCurrentVersion();
      
      if (currentVersion <= targetVersion) {
        logger.info('No rollback needed');
        return;
      }

      const migrationsToRollback = migrations
        .filter(m => m.version > targetVersion && m.version <= currentVersion)
        .sort((a, b) => b.version - a.version); // Reverse order for rollback

      for (const migration of migrationsToRollback) {
        logger.info(`Rolling back migration ${migration.version}: ${migration.name}`);
        
        await database.transaction(async (client) => {
          // Run the rollback
          await client.query(migration.down);
          
          // Remove migration record
          await client.query(
            'DELETE FROM migrations WHERE version = $1',
            [migration.version]
          );
        });

        logger.info(`Migration ${migration.version} rolled back`);
      }

      logger.info('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed', { error: error.message });
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const runner = new MigrationRunner();

  try {
    switch (command) {
      case 'up':
        await runner.runMigrations();
        break;
      case 'down':
        const targetVersion = parseInt(args[1]) || 0;
        await runner.rollback(targetVersion);
        break;
      case 'status':
        const version = await runner.getCurrentVersion();
        logger.info(`Current database version: ${version}`);
        break;
      default:
        logger.info('Usage: node migrate.js [up|down|status] [target_version]');
        logger.info('  up: Run pending migrations');
        logger.info('  down <version>: Rollback to specified version');
        logger.info('  status: Show current version');
    }
  } catch (error) {
    logger.error('Migration command failed', { error: error.message });
    process.exit(1);
  } finally {
    await database.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default MigrationRunner;
