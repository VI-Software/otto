# Otto - The simple and efficient File server

Otto is a secure, efficient file server designed for the VI Software Platform. It provides robust file upload, storage, and serving capabilities with support for multiple authentication methods, public/private access control, and advanced features like file deduplication and thumbnail generation.

## 🚀 Features

- **Multiple Authentication Methods**: Service tokens, JWT tokens, and temporary upload tokens
- **Public/Private File Access**: Context-based access control with public file serving
- **File Deduplication**: Automatic detection and handling of duplicate files
- **Thumbnail Generation**: Automatic thumbnail creation for images
- **Secure Upload**: File type validation, content verification, and size limits
- **RESTful API**: Clean API design with comprehensive error handling
- **Database Integration**: PostgreSQL with migrations support
- **Upload Contexts**: Organize files by context (public, avatars, documents, etc.)
- **Signed URLs**: Generate temporary access URLs for secure file sharing
- **Rate Limiting**: Built-in protection against abuse
- **Logging**: Comprehensive logging with Winston

## 📋 Table of Contents

- [Installation](#-installation)
- [Configuration](#-configuration)
- [Database Setup](#-database-setup)
- [API Documentation](#-api-documentation)
- [Authentication](#-authentication)
- [File Upload](#-file-upload)
- [File Access](#-file-access)
- [Upload Script](#-upload-script)
- [Public Contexts](#-public-contexts)
- [Development](#-development)
- [License](#-license)

## 🛠 Installation

### Prerequisites

- Node.js >= 22.0.0
- PostgreSQL >= 12
- npm or yarn

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/vi-software/otto.git
cd otto
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Setup database**
```bash
# Create database and user in PostgreSQL
createdb otto
createuser otto_user

# Run migrations
node src/scripts/migrate.js
```

5. **Start the server**
```bash
npm start
# or for development
npm run dev
```

## ⚙ Configuration

Otto uses environment variables for configuration. Copy `.env.example` to `.env` and update the values:

### Server Configuration
```env
PORT=3000
NODE_ENV=development
SERVER_SECRET=your-server-secret-here
```

### Database Configuration
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=otto
DB_USER=otto_user
DB_PASSWORD=your-password
```

### Authentication
```env
# JWT configuration
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=1h
UPLOAD_TOKEN_EXPIRES_IN=15m

# Service token for backend-to-backend communication
SERVICE_TOKEN=your-service-token-here
```

### File Upload
```env
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760  # 10MB in bytes
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain
```

### Security
```env
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

## 🗄 Database Setup

Otto requires a PostgreSQL database. The database schema is managed through migrations.

### Required Database Schema

```sql
-- Files table
CREATE TABLE IF NOT EXISTS "files" (
	"id" UUID NOT NULL DEFAULT gen_random_uuid(),
	"filename" VARCHAR(255) NOT NULL,
	"original_name" VARCHAR(255) NOT NULL,
	"file_path" VARCHAR(255) NOT NULL,
	"file_size" INTEGER NOT NULL,
	"mime_type" VARCHAR(100) NOT NULL,
	"created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
	"uploaded_by" VARCHAR(255) NULL DEFAULT NULL,
	"upload_context" VARCHAR(100) NULL DEFAULT NULL,
	"metadata" JSONB NULL DEFAULT NULL,
	"file_hash" VARCHAR(64) NULL DEFAULT NULL,
	"thumbnail_path" VARCHAR(255) NULL DEFAULT NULL,
	"access_count" INTEGER NULL DEFAULT 0,
	"last_accessed" TIMESTAMP NULL DEFAULT NULL,
	"is_compressed" BOOLEAN NULL DEFAULT false,
	"original_size" INTEGER NULL DEFAULT NULL,
	"compression_type" VARCHAR(50) NULL DEFAULT NULL,
	"upload_source" VARCHAR(50) NULL DEFAULT 'api',
	"deleted_at" TIMESTAMP NULL DEFAULT NULL,
	"last_accessed_at" TIMESTAMP NULL DEFAULT NULL,
	"is_public" BOOLEAN NULL DEFAULT false,
	PRIMARY KEY ("id")
);
CREATE INDEX "idx_files_uploaded_at" ON "" ("created_at");
CREATE INDEX "idx_files_hash" ON "" ("file_hash");
CREATE INDEX "idx_files_hash_size" ON "" ("file_hash", "file_size");
CREATE INDEX "idx_files_thumbnail_path" ON "" ("thumbnail_path");
CREATE INDEX "idx_files_access_count" ON "" ("access_count");
CREATE INDEX "idx_files_last_accessed" ON "" ("last_accessed");
CREATE INDEX "idx_files_is_compressed" ON "" ("is_compressed");
CREATE INDEX "idx_files_compression_type" ON "" ("compression_type");
CREATE INDEX "idx_files_upload_context" ON "" ("upload_context");
CREATE INDEX "idx_files_deleted_at" ON "" ("deleted_at");
CREATE INDEX "idx_files_is_public" ON "" ("is_public");
CREATE INDEX "idx_files_context_filename" ON "" ("upload_context", "original_name");
CREATE INDEX "idx_files_uploaded_by" ON "" ("uploaded_by");;
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000
```

### Authentication

Otto supports three authentication methods:

1. **Service Token** (Backend-to-backend)
2. **JWT Token** (User authentication)  
3. **Upload Token** (Temporary upload access)

All authenticated requests require the `Authorization` header:
```
Authorization: Bearer <token>
```

## 🔐 Authentication

### Service Token Authentication

Service tokens provide full access to all Otto features. Used for backend-to-backend communication.

```bash
curl -H "Authorization: Bearer YOUR_SERVICE_TOKEN" \
     http://localhost:3000/files/file-id
```

### JWT Token Authentication

JWT tokens are used for user-specific access. Users can only access their own files.

```bash
curl -H "Authorization: Bearer JWT_TOKEN" \
     http://localhost:3000/files/file-id
```

### Upload Token Authentication

Temporary tokens with limited permissions for frontend uploads.

```bash
# Generate upload token (requires service token)
curl -X POST \
  -H "Authorization: Bearer SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uploadedBy": "user123", "context": "avatars", "maxFiles": 1}' \
  http://localhost:3000/upload/token
```

## 📤 File Upload

### Upload Endpoint

```
POST /upload
```

### Supported Methods

1. **Service Token Upload** (Backend)
2. **Upload Token Upload** (Frontend)
3. **JWT Token Upload** (User)

### Upload Examples

#### Service Token Upload
```bash
curl -X POST \
  -H "Authorization: Bearer SERVICE_TOKEN" \
  -F "files=@image.jpg" \
  -F "context=images" \
  -F "uploadedBy=admin" \
  -F "generateThumbnails=true" \
  http://localhost:3000/upload
```

#### Upload with Metadata
```bash
curl -X POST \
  -H "Authorization: Bearer SERVICE_TOKEN" \
  -F "files=@document.pdf" \
  -F "context=documents" \
  -F "metadata={\"department\":\"finance\",\"confidential\":true}" \
  http://localhost:3000/upload
```

#### Multiple Files
```bash
curl -X POST \
  -H "Authorization: Bearer SERVICE_TOKEN" \
  -F "files=@image1.jpg" \
  -F "files=@image2.png" \
  -F "context=gallery" \
  http://localhost:3000/upload
```

### Upload Response

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
        "uploadContext": "images",
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

## 📥 File Access

### Access Methods

1. **Direct File Access** (Authenticated)
2. **Public File Access** (No authentication)
3. **Signed URL Access** (Temporary)

### Direct File Access

```bash
# By file ID
GET /files/{fileId}

# By context and filename
GET /files/{context}/{filename}

# Short URLs
GET /f/{fileId}
```

### Public File Access

For files in public contexts or marked as public:

```bash
# Public access
GET /public/{context}/{filename}

# Short public URL
GET /p/{context}/{filename}
```

### Signed URLs

Generate temporary access URLs:

```bash
# Generate signed URL
curl -X POST \
  -H "Authorization: Bearer SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn": 3600}' \
  http://localhost:3000/files/{fileId}/signed-url

# Use signed URL (no auth required)
curl http://localhost:3000/files/{fileId}?token=SIGNED_TOKEN
```

## 🚀 Upload Script

Otto includes a powerful command-line upload script for easy file uploads.

### Installation

The script is included in the Otto repository at `scripts/otto-upload.js`.

### Usage

```bash
node scripts/otto-upload.js [options] <files...>
```

### Examples

#### Basic Upload
```bash
node scripts/otto-upload.js --token SERVICE_TOKEN --context images photo.jpg
```

#### Multiple Files with Thumbnails
```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --context gallery \
  --thumbnails \
  --verbose \
  *.jpg *.png
```

#### Upload with Metadata
```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --context documents \
  --metadata '{"department":"hr","confidential":true}' \
  document.pdf
```

#### Environment Variables
```bash
# Set environment variables
export OTTO_TOKEN=your-service-token
export OTTO_URL=http://localhost:3000

# Upload without specifying token/url
node scripts/otto-upload.js --context public image.png
```

### Script Options

```
Options:
  -V, --version             output the version number
  -u, --url <url>           Otto server URL (default: "http://localhost:3000")
  -t, --token <token>       Service token or upload token
  -c, --context <context>   Upload context (default: "general")
  -b, --uploaded-by <user>  User ID for upload attribution (default: "script-user")
  -m, --metadata <json>     Additional metadata as JSON string
  --thumbnails              Generate thumbnails for images (default: false)
  --upload-token            Use upload token flow (requires service token) (default: false)
  -v, --verbose             Verbose logging (default: false)
  --stats                   Show upload statistics after upload (default: false)
  --test-only               Only test connection without uploading (default: false)
  -h, --help                display help for command
```

## 🌐 Public Contexts

Otto automatically treats certain contexts as public. Files uploaded to these contexts are accessible without authentication.

### Default Public Contexts

- `public` - General public files
- `avatars` - User avatars
- `thumbnails` - Generated thumbnails
- `assets` - Static assets
- `static` - Static content
- `media` - Media files

### Uploading Public Files

```bash
# Upload to public context (automatically public)
node scripts/otto-upload.js --token SERVICE_TOKEN --context public image.png

# File will be accessible at:
# http://localhost:3000/public/public/image.png
# http://localhost:3000/p/public/image.png
```

## 👨‍💻 Development

### Project Structure

```
otto/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Express middleware
│   ├── models/          # Database models
│   ├── routes/          # Route definitions
│   ├── scripts/         # Utility scripts
│   └── services/        # Business logic
├── scripts/
│   └── otto-upload.js   # Upload script
├── tests/               # Test files
├── uploads/             # File storage (created automatically)
└── logs/               # Log files
```

### Running Tests

```bash
npm test
```

### Development Server

```bash
npm run dev
```

### API Endpoints Summary

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Homepage | No |
| GET | `/health` | Health check | No |
| GET | `/stats` | Server statistics | No |
| POST | `/upload/token` | Generate upload token | Service |
| POST | `/upload` | Upload files | Yes |
| GET | `/upload/stats` | Upload statistics | Service |
| GET | `/files/{id}` | Get file by ID | Yes |
| GET | `/files/{context}/{filename}` | Get file by context/filename | Yes |
| GET | `/public/{context}/{filename}` | Get public file | No |
| DELETE | `/files/{id}` | Delete file | Yes |
| POST | `/files/{id}/signed-url` | Generate signed URL | Yes |

### File Validation

Otto performs comprehensive file validation:

- **MIME Type Checking**: Validates against allowed types
- **File Size Limits**: Configurable maximum file size
- **Content Validation**: Verifies file headers match declared type
- **Extension Filtering**: Blocks dangerous file extensions
- **Image Validation**: Additional checks for image files

### Error Handling

Otto provides detailed error responses:

```json
{
  "error": "File type image/svg+xml is not allowed",
  "code": "FILE_TYPE_NOT_ALLOWED"
}
```

### Logging

Otto uses Winston for structured logging:

- **Request Logging**: All requests are logged
- **Error Logging**: Comprehensive error tracking
- **Security Logging**: Authentication attempts and failures
- **File Logging**: Upload and access tracking

## 🔒 Security Features

- **Rate Limiting**: Protection against abuse
- **CORS Configuration**: Restricted to internal services
- **Helmet Security**: Security headers
- **File Type Validation**: Prevents malicious file uploads
- **Content Security Policy**: XSS protection
- **Authentication Required**: Most endpoints require authentication
- **Input Validation**: All inputs are validated and sanitized

## 📊 Statistics and Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2023-01-01T00:00:00.000Z",
  "service": "otto",
  "version": "1.0.0",
  "uptime": 3600,
  "environment": "development",
  "database": "connected",
  "uploadsDirectory": {
    "status": "accessible",
    "path": "./uploads",
    "fileCount": 42
  }
}
```

### Upload Statistics

```bash
curl -H "Authorization: Bearer SERVICE_TOKEN" \
     http://localhost:3000/upload/stats
```

Response:
```json
{
  "success": true,
  "data": {
    "totalFiles": 150,
    "totalSize": 52428800,
    "averageSize": 349525,
    "uniqueContexts": 8,
    "uniqueUploaders": 12,
    "formattedTotalSize": "50.00 MB"
  }
}
```

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check PostgreSQL is running
   - Verify database credentials in `.env`
   - Ensure database exists

2. **File Upload Fails**
   - Check file size against `MAX_FILE_SIZE`
   - Verify MIME type is in `ALLOWED_MIME_TYPES`
   - Ensure upload directory is writable

3. **Authentication Errors**
   - Verify token is correct
   - Check token hasn't expired
   - Ensure proper Authorization header format

4. **Public Files Not Accessible**
   - Verify file is in public context
   - Check `is_public` flag in database
   - Ensure public routes are properly configured

### Log Files

Check logs for detailed error information:
- `logs/otto.log` - General application logs
- `logs/error.log` - Error-specific logs

## 📄 License

Otto is open source software licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html).

## 🤝 Contributing

We welcome contributions! Please see our [contributing guidelines](https://docs.visoftware.dev/vi-software/guidelines/contribution-guidelines) for details.

---

**Otto** - Built with ❤️ by [VI Software Studio](https://github.com/vi-software)
