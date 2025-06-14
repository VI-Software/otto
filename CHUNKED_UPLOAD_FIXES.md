# Otto Chunked Upload Fixes

## Issues Fixed

### 1. Race Condition in File Assembly
**Problem**: The completion request was being sent before all chunks were fully processed by the server.

**Solution**: 
- Added 1-second delay after all chunks are uploaded before calling complete
- Added retry logic to the completion request
- Added better error checking in the controller

### 2. File Object Return Issue
**Problem**: The `assembleFile` method was returning a file path string instead of the processed file object when a session was already completed.

**Solution**:
- Fixed return value to always return the processed file object
- Added proper error handling for missing processed files
- Added validation to ensure file_hash property exists

### 3. Better Error Handling
**Improvements**:
- Added comprehensive logging to track assembly process
- Added validation for FileService response
- Added session status checking before completion
- Added retry logic with exponential backoff

## Updated CLI Features

### New ETA Display
The upload script now shows:
- Upload speed (MB/s)
- Estimated time remaining
- Real-time progress updates

Example output:
```
[2025-06-14T12:11:31.218Z] INFO: Starting chunked upload for: video.mp4 (123.41 MB)
[2025-06-14T12:11:35.432Z] DEBUG: Chunk 1/5 uploaded (20%) - Speed: 5.2 MB/s - ETA: 15s
[2025-06-14T12:11:41.661Z] DEBUG: Chunk 2/5 uploaded (40%) - Speed: 4.8 MB/s - ETA: 12s
```

### New CLI Options
```bash
# Control retry behavior
--max-retries 3                 # Maximum retry attempts for failed chunks
--chunk-timeout 120             # Timeout for individual chunk uploads (seconds)
--max-concurrent 2              # Maximum concurrent chunk uploads

# Conservative settings for unreliable connections
node scripts/otto-upload.js \
  --token YOUR_TOKEN \
  --max-concurrent 1 \
  --chunk-timeout 180 \
  --max-retries 5 \
  --verbose \
  large-file.mp4
```

## Cloudflare Tunnel Configuration

### Recommended Settings
For chunked uploads through Cloudflare Tunnel, update your `config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: ./credentials.json

originRequest:
  timeout: 5m              # Increase from default 30s
  connectTimeout: 30s
  keepAliveConnections: 100
  httpHostHeader: localhost:3000

ingress:
  - hostname: your-domain.com
    service: http://localhost:3000
    originRequest:
      timeout: 5m
  - service: http_status:404
```

### Command Line Alternative
```bash
cloudflared tunnel run \
  --origin-request-timeout 5m \
  --proxy-connect-timeout 30s \
  YOUR_TUNNEL_NAME
```

## Testing the Fixes

### 1. Test Basic Chunked Upload
```bash
node scripts/otto-upload.js \
  --url https://your-otto-domain.com \
  --token YOUR_TOKEN \
  --context media \
  --verbose \
  large-video.mp4
```

### 2. Test with Conservative Settings
```bash
node scripts/otto-upload.js \
  --url https://your-otto-domain.com \
  --token YOUR_TOKEN \
  --context media \
  --max-concurrent 1 \
  --chunk-timeout 300 \
  --max-retries 5 \
  --verbose \
  large-video.mp4
```

### 3. Run the Test Suite
```bash
npm run test:chunked
```

## Expected Behavior

### Success Case
```
[INFO] Starting chunked upload for: video.mp4 (123.41 MB)
[DEBUG] Initialized session abc123 with 5 chunks of 25 MB
[DEBUG] Chunk 1/5 uploaded (20%) - Speed: 4.2 MB/s - ETA: 18s
[DEBUG] Chunk 2/5 uploaded (40%) - Speed: 4.5 MB/s - ETA: 14s
[DEBUG] Chunk 3/5 uploaded (60%) - Speed: 4.3 MB/s - ETA: 9s
[DEBUG] Chunk 4/5 uploaded (80%) - Speed: 4.4 MB/s - ETA: 5s
[DEBUG] Chunk 5/5 uploaded (100%) - Speed: 4.3 MB/s - ETA: 0s
[DEBUG] All chunks uploaded, waiting for server processing...
[DEBUG] Completing chunked upload for session: abc123
[SUCCESS] ✓ Completed: video.mp4
```

### Error Handling
- **524 Timeout**: Automatic retry with exponential backoff
- **Missing chunks**: Status check and specific error reporting
- **Assembly failure**: Detailed error logging and recovery

## Troubleshooting

### Still Getting 524 Errors?
1. Increase Cloudflare tunnel timeout to 10m
2. Reduce concurrency: `--max-concurrent 1`
3. Increase chunk timeout: `--chunk-timeout 300`

### Assembly Failures?
1. Check server logs for detailed error information
2. Ensure adequate disk space for temporary files
3. Verify database connectivity

### Slow Uploads?
1. Check network bandwidth
2. Increase concurrency (if connection is stable): `--max-concurrent 3`
3. Monitor server CPU/memory usage

## Files Changed

- `src/services/ChunkedUploadService.js` - Fixed file assembly logic
- `src/controllers/ChunkedUploadController.js` - Better error handling
- `scripts/otto-upload.js` - Added ETA, retry logic, new options
- `docs/CLOUDFLARE_TUNNEL_CONFIG.md` - Comprehensive configuration guide

The fixes should resolve the "No file was returned" error and provide much more reliable chunked uploads through Cloudflare Tunnel.
