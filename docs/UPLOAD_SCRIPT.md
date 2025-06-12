# Otto Upload Script Documentation

The Otto upload script (`scripts/otto-upload.js`) is a powerful command-line tool for uploading files to an Otto server. It supports various authentication methods, file validation, and advanced upload options.

## Installation

The script is included with Otto. Ensure you have the required dependencies:

```bash
npm install
```

## Usage

```bash
node scripts/otto-upload.js [options] <files...>
```

## Authentication

The script supports multiple authentication methods:

### Environment Variables

Set these environment variables to avoid specifying them each time:

```bash
# Windows
set OTTO_TOKEN=your-service-token-here
set OTTO_URL=http://localhost:3000

# Linux/Mac
export OTTO_TOKEN=your-service-token-here
export OTTO_URL=http://localhost:3000
```

### Command Line Options

```bash
node scripts/otto-upload.js --token YOUR_TOKEN --url http://localhost:3000 files...
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-V, --version` | Output version number | |
| `-u, --url <url>` | Otto server URL | `http://localhost:3000` |
| `-t, --token <token>` | Service token or upload token | |
| `-c, --context <context>` | Upload context | `general` |
| `-b, --uploaded-by <user>` | User ID for upload attribution | `script-user` |
| `-m, --metadata <json>` | Additional metadata as JSON string | |
| `--thumbnails` | Generate thumbnails for images | `false` |
| `--upload-token` | Use upload token flow | `false` |
| `-v, --verbose` | Verbose logging | `false` |
| `--stats` | Show upload statistics after upload | `false` |
| `--test-only` | Only test connection without uploading | `false` |
| `-h, --help` | Display help | |

## Examples

### Basic Upload

Upload a single file to the default context:

```bash
node scripts/otto-upload.js --token SERVICE_TOKEN image.jpg
```

### Upload to Specific Context

Upload a file to a specific context:

```bash
node scripts/otto-upload.js --token SERVICE_TOKEN --context avatars profile.jpg
```

### Upload Multiple Files

Upload multiple files at once:

```bash
node scripts/otto-upload.js --token SERVICE_TOKEN --context gallery *.jpg *.png
```

### Upload with Thumbnails

Generate thumbnails for uploaded images:

```bash
node scripts/otto-upload.js --token SERVICE_TOKEN --context gallery --thumbnails *.jpg
```

### Upload with Metadata

Add custom metadata to uploaded files:

```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --context documents \
  --metadata '{"department":"marketing","confidential":false,"project":"website"}' \
  presentation.pdf
```

### Upload to Public Context

Upload files that will be publicly accessible:

```bash
node scripts/otto-upload.js --token SERVICE_TOKEN --context public banner.png
```

### Verbose Upload

See detailed logging during upload:

```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --context images \
  --verbose \
  --stats \
  photo.jpg
```

### Test Connection Only

Test server connectivity without uploading:

```bash
node scripts/otto-upload.js --token SERVICE_TOKEN --test-only
```

### Upload Token Flow

Use the upload token flow for frontend-style uploads:

```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --upload-token \
  --context avatars \
  --uploaded-by user123 \
  avatar.jpg
```

## File Support

### Automatic MIME Type Detection

The script automatically detects file types using the `file-type` library and falls back to extension-based detection:

- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
- **Documents**: `.pdf`, `.txt`, `.doc`, `.docx`
- **Others**: Any file type allowed by the server

### File Validation

Before upload, the script:
1. Validates file existence and readability
2. Detects MIME type
3. Calculates file size
4. Reports file information in verbose mode

## Output

### Successful Upload

```bash
$ node scripts/otto-upload.js --token SERVICE_TOKEN --context images --verbose image.jpg

[2023-01-01T12:00:00.000Z] DEBUG: Testing connection to Otto server...
[2023-01-01T12:00:00.100Z] DEBUG: Connected to Otto server (ok)
[2023-01-01T12:00:00.105Z] DEBUG: Found file: image.jpg (245.6 KB, image/jpeg)
[2023-01-01T12:00:00.105Z] INFO: Preparing to upload 1 files (total: 245.6 KB)
[2023-01-01T12:00:00.105Z] INFO: Uploading 1 file(s) to context: images

✓ Upload completed successfully!

Uploaded Files (1):
1. image.jpg
   ID: 550e8400-e29b-41d4-a716-446655440000
   Size: 245.6 KB
   Type: image/jpeg
   URL: /files/550e8400-e29b-41d4-a716-446655440000
   Public URL: null

Total uploaded: 245.6 KB
```

### Upload with Statistics

```bash
$ node scripts/otto-upload.js --token SERVICE_TOKEN --stats image.jpg

✓ Upload completed successfully!

Uploaded Files (1):
1. image.jpg
   ID: 550e8400-e29b-41d4-a716-446655440000
   Size: 245.6 KB
   Type: image/jpeg
   URL: /files/550e8400-e29b-41d4-a716-446655440000

Total uploaded: 245.6 KB

Server Statistics:
Total Files: 1,247
Total Size: 512.3 MB
Unique Contexts: 8
Unique Uploaders: 23
```

### Public File Upload

```bash
$ node scripts/otto-upload.js --token SERVICE_TOKEN --context public logo.png

✓ Upload completed successfully!

Uploaded Files (1):
1. logo.png
   ID: 550e8400-e29b-41d4-a716-446655440000
   Size: 45.2 KB
   Type: image/png
   URL: /files/550e8400-e29b-41d4-a716-446655440000
   Public URL: /public/public/logo.png

Total uploaded: 45.2 KB
```

## Error Handling

The script provides detailed error messages for common issues:

### Connection Errors

```bash
Error: Cannot connect to Otto server
```

**Solutions:**
- Verify the server is running
- Check the URL is correct
- Ensure network connectivity

### Authentication Errors

```bash
Error: Upload failed: 401 - Invalid service token
```

**Solutions:**
- Verify the token is correct
- Check token hasn't expired
- Ensure proper token permissions

### File Type Errors

```bash
Error: Upload failed: 400 - File type application/octet-stream is not allowed
```

**Solutions:**
- Check file has correct extension
- Verify MIME type is allowed
- Use `--verbose` to see detected MIME type

### File Size Errors

```bash
Error: Upload failed: 400 - File too large. Maximum size is 10MB
```

**Solutions:**
- Reduce file size
- Check server configuration
- Split large uploads

## Advanced Usage

### Batch Processing

Process multiple files with different contexts:

```bash
# Upload images to gallery
node scripts/otto-upload.js --token SERVICE_TOKEN --context gallery images/*.jpg

# Upload documents to docs
node scripts/otto-upload.js --token SERVICE_TOKEN --context documents docs/*.pdf

# Upload assets to public
node scripts/otto-upload.js --token SERVICE_TOKEN --context assets assets/*.*
```

### Integration with CI/CD

Use in CI/CD pipelines:

```bash
#!/bin/bash
# Upload build artifacts

export OTTO_TOKEN=$SERVICE_TOKEN
export OTTO_URL=https://files.company.com

# Upload built assets
node scripts/otto-upload.js --context assets dist/*.js dist/*.css

# Upload documentation
node scripts/otto-upload.js --context docs --metadata '{"build":"'$BUILD_NUMBER'"}' docs/*.pdf
```

### Programmatic Usage

The script can be imported as a module:

```javascript
import { OttoUploader } from './scripts/otto-upload.js';

const uploader = new OttoUploader({
  baseUrl: 'http://localhost:3000',
  token: 'your-service-token',
  verbose: true
});

const files = await uploader.validateFiles(['image.jpg']);
const result = await uploader.uploadFiles(files, {
  context: 'gallery',
  generateThumbnails: true
});

console.log('Uploaded:', result.files.length, 'files');
```

## Troubleshooting

### Common Issues

1. **"Token is required" error**
   - Set `OTTO_TOKEN` environment variable
   - Or use `--token` option

2. **"Connection test failed" error**
   - Check if Otto server is running
   - Verify URL is correct
   - Check network connectivity

3. **"File type not allowed" error**
   - Check `ALLOWED_MIME_TYPES` in server config
   - Verify file extension is recognized
   - Use proper file types

4. **"Cannot access file" error**
   - Check file exists and is readable
   - Verify file path is correct
   - Check file permissions

### Debug Mode

Use verbose mode to see detailed information:

```bash
node scripts/otto-upload.js --verbose --token SERVICE_TOKEN files...
```

This shows:
- Connection test results
- File detection details
- MIME type detection
- Upload progress
- Server responses

### Health Check

Test server connectivity:

```bash
node scripts/otto-upload.js --token SERVICE_TOKEN --test-only
```

## Configuration

### Server Configuration

The script respects these server settings:
- `MAX_FILE_SIZE` - Maximum file size
- `ALLOWED_MIME_TYPES` - Allowed file types
- `UPLOAD_DIR` - Upload directory
- Rate limiting settings

### Environment Variables

```bash
# Required
OTTO_TOKEN=your-service-token

# Optional
OTTO_URL=http://localhost:3000
OTTO_BASE_URL=http://localhost:3000  # Alternative to OTTO_URL
```

## Best Practices

1. **Use Environment Variables**: Store tokens in environment variables for security
2. **Use Specific Contexts**: Organize files with meaningful contexts
3. **Add Metadata**: Include relevant metadata for file organization
4. **Generate Thumbnails**: Use `--thumbnails` for image uploads
5. **Use Verbose Mode**: Enable verbose logging for debugging
6. **Test Connections**: Use `--test-only` to verify connectivity
7. **Check Statistics**: Use `--stats` to monitor server usage

## Examples by Use Case

### Profile Picture Upload
```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --context avatars \
  --uploaded-by user123 \
  --thumbnails \
  --metadata '{"userId":"user123","type":"profile"}' \
  profile.jpg
```

### Document Upload
```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --context documents \
  --uploaded-by admin \
  --metadata '{"department":"legal","confidential":true}' \
  contract.pdf
```

### Asset Upload
```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --context public \
  --metadata '{"type":"logo","version":"2.0"}' \
  logo.svg
```

### Bulk Upload
```bash
node scripts/otto-upload.js \
  --token SERVICE_TOKEN \
  --context gallery \
  --thumbnails \
  --verbose \
  --stats \
  vacation_photos/*.jpg
```
