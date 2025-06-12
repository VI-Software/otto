#!/usr/bin/env node

/**
 * Otto File Upload Script
 * 
 * A standalone command-line tool for uploading files to Otto server
 * Supports both service token (direct) and upload token (via backend) authentication
 * 
 * Usage:
 *   node otto-upload.js [options] <files...>
 * 
 * Examples:
 *   # Upload with service token
 *   node otto-upload.js --token SERVICE_TOKEN --context logos logo.png
 *   
 *   # Upload multiple files
 *   node otto-upload.js --token SERVICE_TOKEN --context documents *.pdf
 *   
 *   # Upload with metadata
 *   node otto-upload.js --token SERVICE_TOKEN --context images --metadata '{"department":"marketing"}' photo.jpg
 *   
 *   # Generate thumbnails for images
 *   node otto-upload.js --token SERVICE_TOKEN --context gallery --thumbnails *.jpg
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { Command } from 'commander';
import chalk from 'chalk';
import { fileTypeFromFile } from 'file-type';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OttoUploader {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.token = options.token;
    this.verbose = options.verbose || false;
  }

  log(message, type = 'info') {
    if (!this.verbose && type === 'debug') return;
    
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? chalk.red('ERROR') : 
                   type === 'success' ? chalk.green('SUCCESS') : 
                   type === 'debug' ? chalk.gray('DEBUG') : 
                   chalk.blue('INFO');
    
    console.log(`[${timestamp}] ${prefix}: ${message}`);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  async validateFiles(filePaths) {
    const validFiles = [];
    
    for (const filePath of filePaths) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          // Detect file type
          let mimeType = 'application/octet-stream';
          try {
            const fileType = await fileTypeFromFile(filePath);
            if (fileType) {
              mimeType = fileType.mime;
            } else {
              // Fallback to extension-based detection for common types
              const ext = path.extname(filePath).toLowerCase();
              const mimeMap = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              };
              mimeType = mimeMap[ext] || 'application/octet-stream';
            }
          } catch (error) {
            this.log(`Could not detect MIME type for ${filePath}, using fallback`, 'debug');
          }

          validFiles.push({
            path: filePath,
            name: path.basename(filePath),
            size: stats.size,
            mimeType: mimeType
          });
          this.log(`Found file: ${filePath} (${this.formatBytes(stats.size)}, ${mimeType})`, 'debug');
        } else {
          this.log(`Skipping non-file: ${filePath}`, 'debug');
        }
      } catch (error) {
        this.log(`Cannot access file: ${filePath} - ${error.message}`, 'error');
      }
    }

    if (validFiles.length === 0) {
      throw new Error('No valid files found to upload');
    }

    return validFiles;
  }

  async generateUploadToken(options = {}) {
    const {
      context = 'general',
      uploadedBy = 'script-user',
      maxFiles = 10,
      maxSize = 100 * 1024 * 1024, // 100MB
      allowedTypes = null,
      expiresIn = '15m'
    } = options;

    this.log('Generating upload token...', 'debug');    const response = await fetch(`${this.baseUrl}/upload/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context,
        uploadedBy,
        maxFiles,
        maxSize,
        allowedTypes,
        expiresIn
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate upload token: ${response.status} ${error}`);
    }

    const result = await response.json();
    this.log('Upload token generated successfully', 'debug');
    return result.data;
  }

  async uploadFiles(files, options = {}) {
    const {
      context = 'general',
      uploadedBy = 'script-user',
      generateThumbnails = false,
      metadata = null,
      useUploadToken = false
    } = options;

    let uploadToken = null;
    let authToken = this.token;

    // If using upload token flow, generate token first
    if (useUploadToken) {
      uploadToken = await this.generateUploadToken({
        context,
        uploadedBy,
        maxFiles: files.length,
        maxSize: files.reduce((sum, file) => sum + file.size, 0) + 1024 * 1024 // Add 1MB buffer
      });
      authToken = uploadToken.token;
    }

    this.log(`Uploading ${files.length} file(s) to context: ${context}`, 'info');

    const form = new FormData();    // Add files to form data
    for (const file of files) {
      form.append('files', fs.createReadStream(file.path), {
        filename: file.name,
        contentType: file.mimeType || 'application/octet-stream' // Use detected MIME type
      });
    }

    // Add additional fields
    if (!useUploadToken) {
      form.append('context', context);
      form.append('uploadedBy', uploadedBy);
    }
    
    if (generateThumbnails) {
      form.append('generateThumbnails', 'true');
    }

    if (metadata) {
      form.append('metadata', JSON.stringify(metadata));
    }

    try {      const response = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          ...form.getHeaders()
        },
        body: form
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        throw new Error(`Upload failed: ${response.status} - ${errorData.error || errorText}`);
      }

      const result = await response.json();
      return result.data;

    } catch (error) {
      this.log(`Upload error: ${error.message}`, 'error');
      throw error;
    }
  }
  async testConnection() {
    try {
      this.log('Testing connection to Otto server...', 'debug');
      
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Server health check failed: ${response.status}`);
      }

      const health = await response.json();
      this.log(`Connected to Otto server (${health.status})`, 'debug');
      return true;
    } catch (error) {
      this.log(`Connection test failed: ${error.message}`, 'error');
      return false;
    }
  }
  async getUploadStats() {
    try {
      const response = await fetch(`${this.baseUrl}/stats`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get stats: ${response.status}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      this.log(`Failed to get upload stats: ${error.message}`, 'error');
      return null;
    }
  }
}

// CLI Setup
const program = new Command();

program
  .name('otto-upload')
  .description('Upload files to Otto server')
  .version('1.0.0')
  .argument('<files...>', 'Files to upload (supports glob patterns)')
  .option('-u, --url <url>', 'Otto server URL', 'http://localhost:3000')
  .option('-t, --token <token>', 'Service token or upload token')
  .option('-c, --context <context>', 'Upload context', 'general')
  .option('-b, --uploaded-by <user>', 'User ID for upload attribution', 'script-user')
  .option('-m, --metadata <json>', 'Additional metadata as JSON string')
  .option('--thumbnails', 'Generate thumbnails for images', false)
  .option('--upload-token', 'Use upload token flow (requires service token)', false)
  .option('-v, --verbose', 'Verbose logging', false)
  .option('--stats', 'Show upload statistics after upload', false)
  .option('--test-only', 'Only test connection without uploading', false);

program.action(async (files, options) => {
  try {
    // Validate token
    if (!options.token) {
      console.error(chalk.red('Error: Token is required. Use --token option or set OTTO_TOKEN environment variable.'));
      process.exit(1);
    }

    // Parse metadata if provided
    let metadata = null;
    if (options.metadata) {
      try {
        metadata = JSON.parse(options.metadata);
      } catch (error) {
        console.error(chalk.red(`Error: Invalid metadata JSON - ${error.message}`));
        process.exit(1);
      }
    }

    // Create uploader instance
    const uploader = new OttoUploader({
      baseUrl: options.url,
      token: options.token,
      verbose: options.verbose
    });

    // Test connection
    const connected = await uploader.testConnection();
    if (!connected) {
      console.error(chalk.red('Error: Cannot connect to Otto server'));
      process.exit(1);
    }

    if (options.testOnly) {
      console.log(chalk.green('✓ Connection test successful'));
      return;
    }

    // Validate and prepare files
    const validFiles = await uploader.validateFiles(files);
    const totalSize = validFiles.reduce((sum, file) => sum + file.size, 0);
    
    uploader.log(`Preparing to upload ${validFiles.length} files (total: ${uploader.formatBytes(totalSize)})`, 'info');

    // Upload files
    const uploadResult = await uploader.uploadFiles(validFiles, {
      context: options.context,
      uploadedBy: options.uploadedBy,
      generateThumbnails: options.thumbnails,
      metadata,
      useUploadToken: options.uploadToken
    });

    // Display results
    console.log(chalk.green('\n✓ Upload completed successfully!'));
    console.log(chalk.cyan(`\nUploaded Files (${uploadResult.files.length}):`));
    
    uploadResult.files.forEach((file, index) => {
      console.log(chalk.white(`${index + 1}. ${file.originalName}`));
      console.log(chalk.gray(`   ID: ${file.id}`));
      console.log(chalk.gray(`   Size: ${uploader.formatBytes(file.fileSize)}`));
      console.log(chalk.gray(`   Type: ${file.mimeType}`));
      console.log(chalk.gray(`   URL: ${file.url}`));
      if (file.publicUrl) {
        console.log(chalk.gray(`   Public URL: ${file.publicUrl}`));
      }
      console.log('');
    });

    console.log(chalk.cyan(`Total uploaded: ${uploader.formatBytes(uploadResult.totalSize)}`));

    // Show stats if requested
    if (options.stats) {
      const stats = await uploader.getUploadStats();
      if (stats) {
        console.log(chalk.cyan('\nServer Statistics:'));
        console.log(chalk.white(`Total Files: ${stats.totalFiles}`));
        console.log(chalk.white(`Total Size: ${stats.formattedTotalSize}`));
        console.log(chalk.white(`Unique Contexts: ${stats.uniqueContexts}`));
        console.log(chalk.white(`Unique Uploaders: ${stats.uniqueUploaders}`));
      }
    }

  } catch (error) {
    console.error(chalk.red(`\nError: ${error.message}`));
    process.exit(1);
  }
});

// Handle environment variables
if (!process.argv.includes('--token') && !process.argv.includes('-t')) {
  const envToken = process.env.OTTO_TOKEN || process.env.OTTO_SERVICE_TOKEN;
  if (envToken) {
    process.argv.push('--token', envToken);
  }
}

if (!process.argv.includes('--url') && !process.argv.includes('-u')) {
  const envUrl = process.env.OTTO_URL || process.env.OTTO_BASE_URL;
  if (envUrl) {
    process.argv.push('--url', envUrl);
  }
}

// Parse and run
program.parse();
