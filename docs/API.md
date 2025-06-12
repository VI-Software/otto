# Otto API Documentation

## Overview

Otto provides a RESTful API for file upload, management, and serving. The API supports multiple authentication methods and provides comprehensive file management capabilities.

## Base URL

```
http://localhost:3000
```

## Authentication

All API requests (except public file access and health checks) require authentication via the `Authorization` header:

```
Authorization: Bearer <token>
```

### Authentication Types

1. **Service Token** - Backend-to-backend communication with full access
2. **JWT Token** - User authentication with access to own files
3. **Upload Token** - Temporary token with limited upload permissions

## API Endpoints

### 1. File Upload

#### Generate Upload Token
Generate a temporary token for frontend file uploads.

```
POST /upload/token
```

**Authentication:** Service Token required

**Request Body:**
```json
{
  "uploadedBy": "user123",
  "context": "avatars",
  "maxFiles": 5,
  "maxSize": 10485760,
  "allowedTypes": ["image/jpeg", "image/png"],
  "expiresIn": "1h"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenId": "550e8400-e29b-41d4-a716-446655440000",
    "expiresAt": "2023-01-01T01:00:00.000Z",
    "context": "avatars",
    "maxFiles": 5,
    "maxSize": 10485760
  }
}
```

#### Upload Files
Upload one or more files to Otto.

```
POST /upload
```

**Authentication:** Service Token, JWT Token, or Upload Token

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `files` (file) - File(s) to upload (max 5)
- `context` (string) - Upload context (default: "general")
- `uploadedBy` (string) - User identifier
- `generateThumbnails` (boolean) - Generate thumbnails for images
- `metadata` (JSON string) - Additional file metadata

**Example Request:**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@image.jpg" \
  -F "context=gallery" \
  -F "generateThumbnails=true" \
  -F "metadata={\"description\":\"Profile photo\"}" \
  http://localhost:3000/upload
```

**Response:**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "filename": "1640995200000_abc123_image.jpg",
        "originalName": "image.jpg",
        "mimeType": "image/jpeg",
        "fileSize": 245760,
        "uploadContext": "gallery",
        "uploadedAt": "2023-01-01T00:00:00.000Z",
        "isPublic": false,
        "url": "/files/550e8400-e29b-41d4-a716-446655440000",
        "publicUrl": null
      }
    ],
    "count": 1,
    "totalSize": 245760
  }
}
```

### 2. File Access

#### Get File by ID
Retrieve a file by its unique identifier.

```
GET /files/{fileId}
```

**Authentication:** Required (unless using signed URL)

**Query Parameters:**
- `token` (string) - Signed access token (optional)
- `download` (boolean) - Force download instead of inline display
- `thumbnail` (boolean) - Get thumbnail version if available

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/files/550e8400-e29b-41d4-a716-446655440000
```

#### Get File by Context and Filename
Retrieve a file using context and original filename.

```
GET /files/{context}/{filename}
```

**Authentication:** Required

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/files/gallery/image.jpg
```

#### Get Public File
Access public files without authentication.

```
GET /public/{context}/{filename}
GET /p/{context}/{filename}  # Short URL
```

**Authentication:** Not required

**Example:**
```bash
curl http://localhost:3000/public/avatars/profile.jpg
curl http://localhost:3000/p/avatars/profile.jpg
```

### 3. File Management

#### Get File Information
Retrieve detailed file metadata.

```
GET /files/{fileId}/info
```

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "1640995200000_abc123_image.jpg",
    "originalName": "image.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 245760,
    "uploadContext": "gallery",
    "uploadedBy": "user123",
    "uploadSource": "api",
    "metadata": {
      "description": "Profile photo"
    },
    "accessCount": 15,
    "isPublic": false,
    "fileHash": "sha256:abc123...",
    "thumbnailPath": "/thumbs/image_thumb.jpg",
    "createdAt": "2023-01-01T00:00:00.000Z",
    "lastAccessedAt": "2023-01-01T12:00:00.000Z"
  }
}
```

#### Delete File
Delete a file from Otto (soft delete).

```
DELETE /files/{fileId}
```

**Authentication:** Required (users can only delete own files)

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

#### Generate Signed URL
Create a temporary access URL for a file.

```
POST /files/{fileId}/signed-url
```

**Authentication:** Required

**Request Body:**
```json
{
  "expiresIn": 3600
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "signedUrl": "http://localhost:3000/files/550e8400-e29b-41d4-a716-446655440000?token=signed_token",
    "expiresIn": 3600,
    "expiresAt": "2023-01-01T01:00:00.000Z"
  }
}
```

### 4. File Listing

#### Get Files by Uploader
List files uploaded by a specific user.

```
GET /files/uploader/{uploaderId}
```

**Authentication:** Required (users can only see own files)

**Query Parameters:**
- `limit` (number) - Maximum files to return (default: 50)
- `offset` (number) - Number of files to skip (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "files": [...],
    "uploaderId": "user123",
    "count": 25,
    "pagination": {
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

#### Get Files by Context
List files in a specific context.

```
GET /upload/context/{context}
```

**Authentication:** Service Token required

**Query Parameters:**
- `limit` (number) - Maximum files to return (default: 50)
- `offset` (number) - Number of files to skip (default: 0)

### 5. Statistics

#### Upload Statistics
Get server-wide upload statistics.

```
GET /upload/stats
```

**Authentication:** Service Token required

**Response:**
```json
{
  "success": true,
  "data": {
    "totalFiles": 1250,
    "totalSize": 524288000,
    "averageSize": 419430,
    "uniqueContexts": 12,
    "uniqueUploaders": 45,
    "formattedTotalSize": "500.00 MB"
  }
}
```

#### Server Health
Check server health and status.

```
GET /health
```

**Authentication:** Not required

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-01-01T00:00:00.000Z",
  "service": "otto",
  "version": "1.0.0",
  "uptime": 3600,
  "environment": "production",
  "database": "connected",
  "uploadsDirectory": {
    "status": "accessible",
    "path": "./uploads",
    "fileCount": 1250
  }
}
```

## Error Responses

All API errors follow a consistent format:

```json
{
  "error": "Error description",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `MISSING_AUTH_HEADER` | Authorization header missing or invalid |
| `INVALID_SERVICE_TOKEN` | Service token is invalid |
| `INVALID_TOKEN` | JWT token is invalid or expired |
| `FILE_NOT_FOUND` | Requested file doesn't exist |
| `ACCESS_DENIED` | User doesn't have permission to access resource |
| `FILE_TOO_LARGE` | Uploaded file exceeds size limit |
| `FILE_TYPE_NOT_ALLOWED` | File type is not permitted |
| `TOO_MANY_FILES` | Too many files in single upload request |
| `NO_FILES` | No files provided in upload request |
| `VALIDATION_ERROR` | Request validation failed |

## Rate Limiting

API requests are rate limited:
- **Window:** 15 minutes (configurable)
- **Limit:** 100 requests per IP (configurable)

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## File Size and Type Limits

### Size Limits
- **Maximum file size:** 10MB (configurable via `MAX_FILE_SIZE`)
- **Maximum files per request:** 5
- **Maximum form field size:** 1MB

### Allowed File Types
Default allowed MIME types:
- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`
- `application/pdf`
- `text/plain`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Configurable via `ALLOWED_MIME_TYPES` environment variable.

### Blocked Extensions
For security, these extensions are blocked:
`.exe`, `.bat`, `.cmd`, `.com`, `.pif`, `.scr`, `.vbs`, `.js`, `.jar`, `.sh`, `.ps1`, `.php`, `.asp`, `.aspx`, `.jsp`, `.py`, `.rb`, `.pl`

## Public Contexts

Files uploaded to these contexts are automatically public:
- `public`
- `avatars`
- `thumbnails`
- `assets`
- `static`
- `media`

## Examples

### Complete Upload Workflow

1. **Generate upload token (frontend)**
```bash
curl -X POST \
  -H "Authorization: Bearer SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uploadedBy":"user123","context":"avatars","maxFiles":1}' \
  http://localhost:3000/upload/token
```

2. **Upload file using token**
```bash
curl -X POST \
  -H "Authorization: Bearer UPLOAD_TOKEN" \
  -F "files=@avatar.jpg" \
  http://localhost:3000/upload
```

3. **Access uploaded file**
```bash
# Private access (requires auth)
curl -H "Authorization: Bearer JWT_TOKEN" \
     http://localhost:3000/files/FILE_ID

# Public access (if in public context)
curl http://localhost:3000/public/avatars/avatar.jpg
```

### Backend Upload with Service Token

```bash
curl -X POST \
  -H "Authorization: Bearer SERVICE_TOKEN" \
  -F "files=@document.pdf" \
  -F "context=documents" \
  -F "uploadedBy=admin" \
  -F "metadata={\"department\":\"legal\",\"confidential\":true}" \
  http://localhost:3000/upload
```
