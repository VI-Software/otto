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
import { spawn } from 'child_process';
import { promisify } from 'util';

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

  formatDuration(ms) {
    if (ms < 0 || !isFinite(ms)) return 'calculating...';
    
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
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
      useUploadToken = false,
      forceChunked = false,
      chunkThreshold = 100 * 1024 * 1024 // 100MB default
    } = options;

    // Determine if we should use chunked upload
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const hasLargeFiles = files.some(file => file.size > chunkThreshold);
    const shouldUseChunked = forceChunked || hasLargeFiles;

    if (shouldUseChunked) {
      this.log('Using chunked upload for large files', 'info');
      return await this.uploadFilesChunked(files, options);
    }

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

    // Try curl first for better Cloudflare compatibility
    if (this.shouldUseCurl()) {
      return await this.uploadWithCurl(files, {
        context,
        uploadedBy,
        generateThumbnails,
        metadata,
        authToken,
        useUploadToken
      });
    }

    // Fallback to node-fetch
    return await this.uploadWithNodeFetch(files, {
      context,
      uploadedBy,
      generateThumbnails,
      metadata,
      authToken,
      useUploadToken
    });
  }

  shouldUseCurl() {
    // Use curl for remote URLs Cloudflare compatibility)
    return !this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1');
  }

  async uploadWithCurl(files, options) {
    const { context, uploadedBy, generateThumbnails, metadata, authToken, useUploadToken } = options;

    try {
      // Build curl command
      const curlArgs = [
        '-X', 'POST',
        '-H', `Authorization: Bearer ${authToken}`,
        '-s', // Silent mode
        '--fail-with-body' // Return error body on failure
      ];

      // Add files
      for (const file of files) {
        curlArgs.push('-F', `files=@${file.path}`);
      }

      // Add form fields
      if (!useUploadToken) {
        curlArgs.push('-F', `context=${context}`);
        curlArgs.push('-F', `uploadedBy=${uploadedBy}`);
      }

      if (generateThumbnails) {
        curlArgs.push('-F', 'generateThumbnails=true');
      }

      if (metadata) {
        curlArgs.push('-F', `metadata=${JSON.stringify(metadata)}`);
      }

      curlArgs.push(`${this.baseUrl}/upload`);

      this.log('Using curl for upload (better tunnel compatibility)', 'debug');
      
      const result = await this.executeCurl(curlArgs);
      const response = JSON.parse(result);
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || 'Upload failed');
      }

    } catch (error) {
      this.log(`Curl upload failed: ${error.message}`, 'error');
      this.log('Falling back to node-fetch...', 'debug');
      
      // Fallback to node-fetch
      return await this.uploadWithNodeFetch(files, options);
    }
  }

  async executeCurl(args) {
    return new Promise((resolve, reject) => {
      const curl = spawn('curl', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      curl.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      curl.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      curl.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`curl failed with code ${code}: ${stderr}`));
        }
      });

      curl.on('error', (error) => {
        reject(new Error(`curl execution failed: ${error.message}`));
      });
    });
  }

  async uploadWithNodeFetch(files, options) {
    const { context, uploadedBy, generateThumbnails, metadata, authToken, useUploadToken } = options;

    const form = new FormData();
    
    // Add files to form data
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

    try {
      const response = await fetch(`${this.baseUrl}/upload`, {
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

  /**
   * Upload files using chunked upload API
   */
  async uploadFilesChunked(files, options = {}) {
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

    const results = [];

    for (const file of files) {
      this.log(`Starting chunked upload for: ${file.name} (${this.formatBytes(file.size)})`, 'info');
      
      try {        const result = await this.uploadSingleFileChunked(file, {
          context,
          uploadedBy,
          generateThumbnails,
          metadata,
          authToken,
          useUploadToken,
          maxRetries: options.maxRetries,
          chunkTimeout: options.chunkTimeout,
          maxConcurrent: options.maxConcurrent
        });
        
        results.push(result);
        this.log(`✓ Completed: ${file.name}`, 'success');
        
      } catch (error) {
        this.log(`✗ Failed: ${file.name} - ${error.message}`, 'error');
        throw error;
      }
    }

    return {
      files: results,
      count: results.length,
      totalSize: results.reduce((sum, file) => sum + file.fileSize, 0)
    };
  }
  /**
   * Upload a single file using chunked upload
   */
  async uploadSingleFileChunked(file, options) {
    const { 
      context, 
      uploadedBy, 
      generateThumbnails, 
      metadata, 
      authToken, 
      useUploadToken,
      maxRetries = 3,
      chunkTimeout = 120,
      maxConcurrent = 2
    } = options;

    // Step 1: Initialize upload session
    const sessionData = await this.initializeChunkedUpload(file, {
      context,
      uploadedBy,
      metadata,
      authToken,
      useUploadToken
    });

    const { sessionId, chunkSize, totalChunks } = sessionData;

    this.log(`Initialized session ${sessionId} with ${totalChunks} chunks of ${this.formatBytes(chunkSize)}`, 'debug');

    // Step 2: Upload chunks
    await this.uploadChunks(file, sessionId, chunkSize, totalChunks, authToken, {
      maxRetries,
      chunkTimeout,
      maxConcurrent
    });

    // Step 3: Complete upload
    const result = await this.completeChunkedUpload(sessionId, authToken);

    return result.file;
  }
  /**
   * Initialize chunked upload session
   */
  async initializeChunkedUpload(file, options) {
    const { context, uploadedBy, metadata, authToken, useUploadToken } = options;

    this.log(`Initializing chunked upload for: ${file.name} (${this.formatBytes(file.size)})`, 'debug');

    const payload = {
      originalFilename: file.name,
      totalSize: file.size,
      mimeType: file.mimeType
    };

    if (!useUploadToken) {
      payload.context = context;
      payload.uploadedBy = uploadedBy;
    }

    if (metadata) {
      payload.metadata = metadata;
    }

    this.log(`Sending init request to: ${this.baseUrl}/upload/chunk/init`, 'debug');

    const response = await fetch(`${this.baseUrl}/upload/chunk/init`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      this.log(`Init failed with status ${response.status}: ${error}`, 'error');
      throw new Error(`Failed to initialize chunked upload: ${response.status} ${error}`);
    }

    const result = await response.json();
    this.log(`Session initialized successfully: ${result.data.sessionId}`, 'debug');
    return result.data;
  }/**
   * Upload all chunks for a file
   */
  async uploadChunks(file, sessionId, chunkSize, totalChunks, authToken, options = {}) {
    const { maxRetries = 3, chunkTimeout = 120, maxConcurrent = 2 } = options;
    const filePath = file.path;
    const fileHandle = fs.openSync(filePath, 'r');

    try {
      // Upload chunks with controlled concurrency for better Cloudflare compatibility
      let currentChunk = 0;
      const activeUploads = new Set();
      
      // ETA tracking
      const startTime = Date.now();
      let completedChunks = 0;
      let totalBytesUploaded = 0;

      while (currentChunk < totalChunks) {
        // Start uploads up to maxConcurrent
        while (activeUploads.size < maxConcurrent && currentChunk < totalChunks) {
          const chunkIndex = currentChunk++;
          const uploadPromise = this.uploadSingleChunk(
            fileHandle, 
            sessionId, 
            chunkIndex, 
            chunkSize, 
            authToken,
            maxRetries,
            chunkTimeout * 1000 // Convert to milliseconds
          );
          
          activeUploads.add(uploadPromise);
          
          uploadPromise
            .then((result) => {
              activeUploads.delete(uploadPromise);
              completedChunks++;
              totalBytesUploaded += result.chunkSize || chunkSize;
              
              // Calculate ETA
              const elapsed = Date.now() - startTime;
              const progress = completedChunks / totalChunks;
              const eta = progress > 0 ? (elapsed / progress) - elapsed : 0;
              const etaFormatted = this.formatDuration(eta);
              const speed = this.formatBytes(totalBytesUploaded / (elapsed / 1000)) + '/s';
              
              const progressPercent = Math.round(progress * 100);
              this.log(`Chunk ${chunkIndex + 1}/${totalChunks} uploaded (${progressPercent}%) - Speed: ${speed} - ETA: ${etaFormatted}`, 'debug');
            })
            .catch(error => {
              activeUploads.delete(uploadPromise);
              throw error;
            });
        }

        // Wait for at least one upload to complete before starting more
        if (activeUploads.size > 0) {
          await Promise.race(activeUploads);
        }
      }

      // Wait for all remaining uploads to complete
      await Promise.all(activeUploads);

    } finally {
      fs.closeSync(fileHandle);
    }
  }  /**
   * Upload a single chunk with retry logic
   */
  async uploadSingleChunk(fileHandle, sessionId, chunkIndex, chunkSize, authToken, maxRetries = 3, timeoutMs = 120000) {
    const buffer = Buffer.alloc(chunkSize);
    const position = chunkIndex * chunkSize;
    const bytesRead = fs.readSync(fileHandle, buffer, 0, chunkSize, position);
    
    // Trim buffer to actual bytes read for last chunk
    const chunkData = bytesRead < chunkSize ? buffer.slice(0, bytesRead) : buffer;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const form = new FormData();
        form.append('chunk', chunkData, {
          filename: `chunk-${chunkIndex}`,
          contentType: 'application/octet-stream'
        });        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        this.log(`Uploading chunk ${chunkIndex} to: ${this.baseUrl}/upload/chunk/${sessionId}/${chunkIndex}`, 'debug');

        const response = await fetch(`${this.baseUrl}/upload/chunk/${sessionId}/${chunkIndex}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            ...form.getHeaders()
          },
          body: form,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.text().catch(() => 'Unknown error');
          
          // Log the specific error
          if (response.status === 524) {
            this.log(`Chunk ${chunkIndex} timeout (524) - attempt ${attempt}/${maxRetries}`, 'error');
          } else {
            this.log(`Chunk ${chunkIndex} failed with ${response.status} - attempt ${attempt}/${maxRetries}`, 'error');
          }
          
          if (attempt === maxRetries) {
            throw new Error(`Failed to upload chunk ${chunkIndex}: ${response.status} ${error}`);
          }
          
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          this.log(`Retrying chunk ${chunkIndex} in ${delay}ms...`, 'debug');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        const result = await response.json();
        return { ...result.data, chunkSize: bytesRead };

      } catch (error) {
        if (error.name === 'AbortError') {
          this.log(`Chunk ${chunkIndex} upload timed out - attempt ${attempt}/${maxRetries}`, 'error');
        } else {
          this.log(`Chunk ${chunkIndex} upload error: ${error.message} - attempt ${attempt}/${maxRetries}`, 'error');
        }
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        this.log(`Retrying chunk ${chunkIndex} in ${delay}ms...`, 'debug');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  /**
   * Complete chunked upload
   */
  async completeChunkedUpload(sessionId, authToken) {
    this.log(`Completing chunked upload for session: ${sessionId}`, 'debug');
    
    const response = await fetch(`${this.baseUrl}/upload/chunk/${sessionId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      this.log(`Complete upload failed with status ${response.status}: ${error}`, 'error');
      throw new Error(`Failed to complete chunked upload: ${response.status} ${error}`);
    }

    const result = await response.json();
    this.log(`Chunked upload completed successfully for session: ${sessionId}`, 'debug');
    return result.data;
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
  .option('--chunked', 'Force chunked upload for all files', false)
  .option('--chunk-threshold <size>', 'File size threshold for auto chunked upload (MB)', '100')
  .option('--max-retries <count>', 'Maximum retry attempts for failed chunks', '3')
  .option('--chunk-timeout <seconds>', 'Timeout for individual chunk uploads (seconds)', '120')
  .option('--max-concurrent <count>', 'Maximum concurrent chunk uploads', '2')
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
    
    uploader.log(`Preparing to upload ${validFiles.length} files (total: ${uploader.formatBytes(totalSize)})`, 'info');    // Upload files
    const uploadResult = await uploader.uploadFiles(validFiles, {
      context: options.context,
      uploadedBy: options.uploadedBy,
      generateThumbnails: options.thumbnails,
      metadata,
      useUploadToken: options.uploadToken,
      forceChunked: options.chunked,
      chunkThreshold: parseInt(options.chunkThreshold) * 1024 * 1024, // Convert MB to bytes
      maxRetries: parseInt(options.maxRetries),
      chunkTimeout: parseInt(options.chunkTimeout),
      maxConcurrent: parseInt(options.maxConcurrent)
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
