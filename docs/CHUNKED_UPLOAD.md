# Chunked Upload API Documentation

Otto supports chunked file uploads for handling large files (>100MB) efficiently. This feature allows files to be split into smaller chunks and uploaded via multiple requests, then reassembled on the server.

## Overview

Chunked uploads are automatically suggested when files exceed the chunk size threshold (default: 25MB). The CLI tool and client libraries automatically handle the chunking process, but you can also manually use the chunked upload API.

## Configuration

The following environment variables control chunked upload behavior:

```bash
# Chunk size in bytes (default: 25MB)
CHUNK_SIZE=26214400

# Session timeout in milliseconds (default: 24 hours)
CHUNK_SESSION_TIMEOUT=86400000

# Maximum concurrent chunk uploads (default: 10)
MAX_CONCURRENT_CHUNKS=10

# Temporary directory for chunks (default: ./temp-chunks)
CHUNK_TEMP_DIR=/path/to/temp/chunks

# Maximum total file size for chunked uploads (default: 1GB)
MAX_TOTAL_FILE_SIZE=1073741824
```

## API Endpoints

### 1. Get Configuration

```
GET /upload/chunk/config
```

Returns the current chunked upload configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "chunkSize": 26214400,
    "maxConcurrentChunks": 10,
    "sessionTimeout": 86400000,
    "formattedChunkSize": "25 MB",
    "formattedSessionTimeout": "24h 0m"
  }
}
```

### 2. Initialize Upload Session

```
POST /upload/chunk/init
```

Initialize a new chunked upload session.

**Headers:**
- `Authorization: Bearer <token>` (upload token, service token, or JWT)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "originalFilename": "large-video.mp4",
  "totalSize": 157286400,
  "mimeType": "video/mp4",
  "context": "videos",
  "metadata": {
    "description": "My large video file"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "chunkSize": 26214400,
    "totalChunks": 6,
    "expiresAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 3. Upload Chunk

```
POST /upload/chunk/:sessionId/:chunkIndex
```

Upload a single chunk of data.

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**
- `chunk`: The chunk data (binary)

**Response:**
```json
{
  "success": true,
  "data": {
    "chunkIndex": 0,
    "uploaded": true,
    "progress": 16.67,
    "uploadedChunks": 1,
    "totalChunks": 6,
    "completed": false
  }
}
```

### 4. Get Session Status

```
GET /upload/chunk/:sessionId/status
```

Get the current status of an upload session.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "originalFilename": "large-video.mp4",
    "totalSize": 157286400,
    "totalChunks": 6,
    "uploadedChunks": 3,
    "missingChunks": [3, 4, 5],
    "progress": 50.0,
    "completed": false,
    "createdAt": "2024-01-15T09:30:00.000Z",
    "expiresAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 5. Complete Upload

```
POST /upload/chunk/:sessionId/complete
```

Assemble all chunks into the final file and process it.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "file": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "filename": "large-video.mp4",
      "originalName": "large-video.mp4",
      "mimeType": "video/mp4",
      "fileSize": 157286400,
      "uploadContext": "videos",
      "uploadedAt": "2024-01-15T09:35:00.000Z",
      "isPublic": true,
      "url": "/files/123e4567-e89b-12d3-a456-426614174000",
      "publicUrl": "/public/videos/a1b2c3d4e5f6",
      "publicUrlWithExt": "/public/videos/a1b2c3d4e5f6.mp4",
      "shortPublicUrl": "/p/videos/a1b2c3d4e5f6",
      "shortPublicUrlWithExt": "/p/videos/a1b2c3d4e5f6.mp4"
    },
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "chunkedUpload": true
  }
}
```

### 6. Cancel Upload

```
DELETE /upload/chunk/:sessionId
```

Cancel an upload session and clean up any uploaded chunks.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "cancelled": true
  }
}
```

## CLI Usage

The Otto CLI automatically detects large files and uses chunked upload:

```bash
# Upload large files (automatically uses chunked upload for files >100MB)
node otto-upload.js --token YOUR_TOKEN --context videos large-video.mp4

# Force chunked upload for all files
node otto-upload.js --token YOUR_TOKEN --context videos --chunked small-file.jpg

# Set custom chunk threshold (50MB)
node otto-upload.js --token YOUR_TOKEN --chunk-threshold 50 files/*.mp4

# Verbose output to see chunking progress
node otto-upload.js --token YOUR_TOKEN --verbose large-file.zip
```

## Client Implementation Example

Here's a JavaScript example for implementing chunked uploads in a web client:

```javascript
async function uploadFileChunked(file, uploadToken, serverUrl = 'http://localhost:3000') {
  // Step 1: Initialize upload session
  const initResponse = await fetch(`${serverUrl}/upload/chunk/init`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${uploadToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      originalFilename: file.name,
      totalSize: file.size,
      mimeType: file.type || 'application/octet-stream'
    })
  });

  const initData = await initResponse.json();
  const { sessionId, chunkSize, totalChunks } = initData.data;

  // Step 2: Upload chunks
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const chunkFormData = new FormData();
    chunkFormData.append('chunk', chunk);

    await fetch(`${serverUrl}/upload/chunk/${sessionId}/${chunkIndex}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${uploadToken}`
      },
      body: chunkFormData
    });

    // Update progress
    const progress = ((chunkIndex + 1) / totalChunks) * 100;
    console.log(`Upload progress: ${progress.toFixed(1)}%`);
  }

  // Step 3: Complete upload
  const completeResponse = await fetch(`${serverUrl}/upload/chunk/${sessionId}/complete`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${uploadToken}`
    }
  });

  const result = await completeResponse.json();
  return result.data.file;
}
```

## Error Handling

Common error scenarios and how to handle them:

### Session Not Found (404)
```json
{
  "error": "Upload session not found or expired",
  "code": "SESSION_NOT_FOUND"
}
```

**Resolution:** Start a new upload session.

### Missing Chunks (400)
```json
{
  "error": "Missing chunk 3",
  "code": "MISSING_CHUNKS"
}
```

**Resolution:** Re-upload the missing chunks, then retry completion.

### File Too Large (400)
```json
{
  "error": "File too large. Maximum size is 1024MB",
  "code": "FILE_TOO_LARGE"
}
```

**Resolution:** Reduce file size or increase the `MAX_TOTAL_FILE_SIZE` setting.

### Chunk Too Large (400)
```json
{
  "error": "Chunk too large. Maximum chunk size is 30MB",
  "code": "CHUNK_TOO_LARGE"
}
```

**Resolution:** Use smaller chunks (default chunk size is 25MB).

## Resume Interrupted Uploads

You can resume an interrupted upload by checking the session status and uploading missing chunks:

```javascript
// Check what chunks are missing
const statusResponse = await fetch(`${serverUrl}/upload/chunk/${sessionId}/status`, {
  headers: { 'Authorization': `Bearer ${uploadToken}` }
});

const status = await statusResponse.json();
const missingChunks = status.data.missingChunks;

// Re-upload missing chunks
for (const chunkIndex of missingChunks) {
  // ... upload chunk logic
}

// Complete upload
await fetch(`${serverUrl}/upload/chunk/${sessionId}/complete`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${uploadToken}` }
});
```

## Performance Considerations

1. **Concurrent Uploads**: The server limits concurrent chunk uploads per session to prevent overwhelming the system.

2. **Chunk Size**: Default 25MB chunks work well for most scenarios. Larger chunks reduce the number of requests but may timeout on slow connections.

3. **Session Cleanup**: Upload sessions automatically expire after 24 hours. Completed sessions are cleaned up after file assembly.

4. **Temporary Storage**: Ensure adequate disk space for temporary chunk storage. Chunks are stored until assembly is complete.

## Compatibility

- **Cloudflare**: Chunked uploads work within Cloudflare's 100MB request limit since each chunk is under that limit.
- **Bandwidth**: Reduces bandwidth waste on failed uploads since only failed chunks need to be retried.
- **Progress Tracking**: Provides granular progress information for better user experience.

## Security

- All chunked upload endpoints require authentication (same as regular uploads)
- Chunks are validated for size and content type restrictions
- Session IDs are UUIDs to prevent enumeration attacks
- Temporary files are cleaned up automatically to prevent storage abuse
