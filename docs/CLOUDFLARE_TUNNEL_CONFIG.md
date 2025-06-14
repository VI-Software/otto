# Cloudflare Tunnel Configuration for Otto Chunked Uploads

When using Otto with Cloudflare Tunnel for chunked uploads, you may encounter 524 timeout errors. This guide explains how to configure your tunnel for optimal chunked upload performance.

## The Problem

Cloudflare Tunnel has default timeout settings that may be too aggressive for large chunk uploads:

- **Default origin timeout**: 30 seconds
- **Default connection timeout**: 30 seconds
- **Large chunk size**: 25MB chunks can take longer than 30 seconds on slower connections

Error 524 indicates that Cloudflare's tunnel timed out waiting for your Otto server to respond.

## Solution: Increase Tunnel Timeouts

### Method 1: Command-Line Flags

When starting your Cloudflare tunnel, add these flags:

```bash
cloudflared tunnel run \
  --url http://localhost:3000 \
  --http-host-header localhost:3000 \
  --origin-request-timeout 5m \
  --proxy-connect-timeout 30s \
  --proxy-tls-timeout 30s \
  --heartbeat-interval 5s \
  YOUR_TUNNEL_NAME
```

### Method 2: Configuration File

Create or update your `config.yml` file:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /path/to/credentials.json

originRequest:
  # Increase origin timeout to 5 minutes for chunked uploads
  timeout: 5m
  
  # Connection settings
  connectTimeout: 30s
  tlsTimeout: 30s
  
  # Keep connections alive
  keepAliveConnections: 100
  keepAliveTimeout: 90s
  
  # HTTP settings for large uploads
  httpHostHeader: localhost:3000
  
  # Disable buffering for streaming uploads
  disableChunkedEncoding: false

ingress:
  - hostname: your-domain.com
    service: http://localhost:3000
    originRequest:
      timeout: 5m
      connectTimeout: 30s
      httpHostHeader: localhost:3000
  - service: http_status:404
```

Then run: `cloudflared tunnel run --config config.yml`

### Method 3: Environment Variables

Set these environment variables before starting the tunnel:

```bash
export TUNNEL_ORIGIN_REQUEST_TIMEOUT=5m
export TUNNEL_PROXY_CONNECT_TIMEOUT=30s
export TUNNEL_PROXY_TLS_TIMEOUT=30s
cloudflared tunnel run YOUR_TUNNEL_NAME
```

## Recommended Otto CLI Settings

Use these settings with the Otto upload script for better Cloudflare compatibility:

```bash
# Conservative settings for reliable uploads
node scripts/otto-upload.js \
  --token YOUR_TOKEN \
  --chunked \
  --max-concurrent 1 \
  --chunk-timeout 180 \
  --max-retries 5 \
  --verbose \
  your-large-file.mp4

# Faster settings (may timeout on slow connections)
node scripts/otto-upload.js \
  --token YOUR_TOKEN \
  --chunked \
  --max-concurrent 2 \
  --chunk-timeout 120 \
  --max-retries 3 \
  --verbose \
  your-large-file.mp4
```

## Timeout Recommendations by File Size

| File Size | Chunk Timeout | Max Concurrent | Tunnel Timeout |
|-----------|---------------|----------------|----------------|
| < 500MB   | 120s          | 2              | 3m             |
| 500MB-2GB | 180s          | 1              | 5m             |
| > 2GB     | 300s          | 1              | 10m            |

## Additional Optimizations

### 1. Reduce Chunk Size

If you're still experiencing timeouts, reduce the server's chunk size:

```env
# In your .env file
CHUNK_SIZE=10485760  # 10MB instead of 25MB
```

### 2. Enable Compression

Cloudflare automatically compresses responses, but ensure your origin supports it:

```yaml
# In config.yml
originRequest:
  compressionQuality: 6
```

### 3. Monitor Upload Progress

Use verbose logging to monitor upload progress:

```bash
node scripts/otto-upload.js --verbose --token YOUR_TOKEN your-file.mp4
```

You'll see output like:
```
[2025-06-14T12:11:31.218Z] INFO: Starting chunked upload for: video.mp4 (123.41 MB)
[2025-06-14T12:11:35.432Z] DEBUG: Chunk 1/5 uploaded (20%) - Speed: 5.2 MB/s - ETA: 15s
[2025-06-14T12:11:41.661Z] DEBUG: Chunk 2/5 uploaded (40%) - Speed: 4.8 MB/s - ETA: 12s
```

## Troubleshooting

### Still Getting 524 Errors?

1. **Check tunnel logs**: `cloudflared tunnel info YOUR_TUNNEL_NAME`
2. **Increase timeouts further**: Try 10-15 minutes for very large files
3. **Reduce concurrency**: Use `--max-concurrent 1`
4. **Test local upload first**: Ensure Otto works without tunnel

### Connection Issues?

1. **Check tunnel status**: `cloudflared tunnel list`
2. **Restart tunnel**: Sometimes a restart resolves connection issues
3. **Check firewall**: Ensure port 3000 is accessible locally

### Performance Issues?

1. **Network speed**: Check your upload bandwidth
2. **Server resources**: Monitor Otto server CPU/memory usage
3. **Disk space**: Ensure adequate space for temporary chunks

## Example Working Configuration

Here's a complete working setup:

**config.yml:**
```yaml
tunnel: abc123def456
credentials-file: ./tunnel-credentials.json

originRequest:
  timeout: 10m
  connectTimeout: 30s
  keepAliveConnections: 100
  httpHostHeader: localhost:3000

ingress:
  - hostname: files.yourdomain.com
    service: http://localhost:3000
    originRequest:
      timeout: 10m
  - service: http_status:404
```

**Upload command:**
```bash
node scripts/otto-upload.js \
  --url https://files.yourdomain.com \
  --token $OTTO_TOKEN \
  --max-concurrent 1 \
  --chunk-timeout 300 \
  --max-retries 5 \
  --verbose \
  large-video.mp4
```

**Otto .env:**
```env
CHUNK_SIZE=20971520  # 20MB
MAX_TOTAL_FILE_SIZE=5368709120  # 5GB
CHUNK_SESSION_TIMEOUT=7200000  # 2 hours
```

This configuration should handle files up to 5GB with reliable chunked uploads through Cloudflare Tunnel.
