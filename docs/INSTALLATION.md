# Otto Installation and Setup Guide

This guide walks you through setting up Otto from scratch, including database configuration, environment setup, and deployment options.

## Prerequisites

Before installing Otto, ensure you have the following installed:

- **Node.js** >= 24.9.0
- **PostgreSQL** >= 16
- **npm** or **yarn**
- **Git** (for cloning the repository)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/vi-software/otto.git
cd otto
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
SERVER_SECRET=your-random-secret-here

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=otto
DB_USER=otto_user
DB_PASSWORD=your-secure-password

# JWT Configuration
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=1h
UPLOAD_TOKEN_EXPIRES_IN=15m

# File Upload Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain

# Service Authentication
SERVICE_TOKEN=your-secure-service-token

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/otto.log
```

### 4. Database Setup

#### Create Database and User

```sql
-- Connect to PostgreSQL as superuser
sudo -u postgres psql

-- Create database
CREATE DATABASE otto;

-- Create user
CREATE USER otto_user WITH PASSWORD 'your-secure-password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE otto TO otto_user;

-- Exit PostgreSQL
\q
```

#### Run Migrations

```bash
node src/scripts/migrate.js
```

### 5. Start the Server

```bash
npm start
```

Visit `http://localhost:3000` to see the Otto homepage.

## Detailed Configuration

### Environment Variables

#### Server Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `NODE_ENV` | Environment mode | `development` | No |
| `SERVER_SECRET` | Server encryption secret | - | Yes |

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_HOST` | Database host | `localhost` | No |
| `DB_PORT` | Database port | `5432` | No |
| `DB_NAME` | Database name | `otto` | No |
| `DB_USER` | Database user | `otto_user` | No |
| `DB_PASSWORD` | Database password | - | Yes |
| `DB_SSL` | Enable SSL | `false` | No |

#### Authentication Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `JWT_EXPIRES_IN` | JWT expiration time | `1h` | No |
| `UPLOAD_TOKEN_EXPIRES_IN` | Upload token expiration | `15m` | No |
| `SERVICE_TOKEN` | Service authentication token | - | Yes |

#### Upload Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `UPLOAD_DIR` | Upload directory path | `./uploads` | No |
| `MAX_FILE_SIZE` | Maximum file size (bytes) | `10485760` (10MB) | No |
| `ALLOWED_MIME_TYPES` | Comma-separated MIME types | See below | No |

**Default MIME Types:**
```
image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

#### Security Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | `900000` (15 min) | No |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` | No |

#### Logging Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | Logging level | `info` | No |
| `LOG_FILE` | Log file path | `./logs/otto.log` | No |

#### UI Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `HOMEPAGE_HTML_FILE` | Custom homepage HTML file path (relative to project root) | - | No |
| `SHOW_STATS` | Show server statistics on homepage | `true` | No |

**Custom Homepage**: Set `HOMEPAGE_HTML_FILE` to load a custom HTML file for the homepage instead of the default. The file must be within the project directory for security. Example: `home.html`

### Database Setup (Detailed)

#### Option 1: Local PostgreSQL

1. **Install PostgreSQL**

   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql postgresql-contrib

   # CentOS/RHEL
   sudo yum install postgresql-server postgresql-contrib

   # macOS
   brew install postgresql
   brew services start postgresql

   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. **Configure PostgreSQL**

   ```bash
   # Switch to postgres user
   sudo -u postgres psql

   # Create database and user
   CREATE DATABASE otto;
   CREATE USER otto_user WITH ENCRYPTED PASSWORD 'your-secure-password';
   GRANT ALL PRIVILEGES ON DATABASE otto TO otto_user;
   
   # Exit
   \q
   ```

3. **Test Connection**

   ```bash
   psql -h localhost -U otto_user -d otto
   ```

#### Option 2: Docker PostgreSQL (Recomended)

```bash
# Run PostgreSQL in Docker
docker run --name otto-postgres \
  -e POSTGRES_DB=otto \
  -e POSTGRES_USER=otto_user \
  -e POSTGRES_PASSWORD=your-secure-password \
  -p 5432:5432 \
  -d postgres:14

# Test connection
docker exec -it otto-postgres psql -U otto_user -d otto
```

#### Option 3: Remote PostgreSQL

Update your `.env` file with remote database credentials:

```env
DB_HOST=your-remote-host
DB_PORT=5432
DB_NAME=otto
DB_USER=otto_user
DB_PASSWORD=your-password
DB_SSL=true
```

## Directory Structure

After installation, your Otto directory should look like this:

```
otto/
├── .env                 # Environment configuration
├── .env.example         # Environment template
├── package.json         # Dependencies
├── start.js            # Server entry point
├── docs/               # Documentation
│   ├── API.md
│   └── UPLOAD_SCRIPT.md
├── logs/               # Log files (created automatically)
│   ├── otto.log
│   └── error.log
├── scripts/            # Utility scripts
│   └── otto-upload.js  # Upload script
├── src/                # Source code
│   ├── config/         # Configuration
│   ├── controllers/    # Route controllers
│   ├── middleware/     # Express middleware
│   ├── models/         # Database models
│   ├── routes/         # Route definitions
│   ├── scripts/        # Database scripts
│   └── services/       # Business logic
├── tests/              # Test files
└── uploads/            # File storage (created automatically)
    ├── general/        # Default context
    ├── public/         # Public files
    ├── avatars/        # User avatars
    └── ...             # Other contexts
```

## Development Setup

### Development Dependencies

```bash
npm install --save-dev
```

### Development Scripts

```bash
# Start development server with auto-reload
npm run dev
```

### Development Environment

```env
NODE_ENV=development
LOG_LEVEL=debug
```

## Production Deployment

### Environment Configuration

```env
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
```

### Process Management

#### Option 1: PM2

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start start.js --name otto

# Monitor
pm2 status
pm2 logs otto

# Auto-restart on reboot
pm2 startup
pm2 save
```

#### Option 2: systemd

Create `/etc/systemd/system/otto.service`:

```ini
[Unit]
Description=Otto File Server
After=network.target

[Service]
Type=simple
User=otto
WorkingDirectory=/opt/otto
Environment=NODE_ENV=production
ExecStart=/usr/bin/node start.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable otto
sudo systemctl start otto
sudo systemctl status otto
```

#### Option 3: Docker

Create `Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

USER node

CMD ["node", "start.js"]
```

Build and run:

```bash
# Build image
docker build -t otto .

# Run container
docker run -d \
  --name otto \
  -p 3000:3000 \
  --env-file .env \
  otto
```

### Reverse Proxy (Nginx)

Create `/etc/nginx/sites-available/otto`:

```nginx
server {
    listen 80;
    server_name files.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/otto /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL/TLS (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d files.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Backup and Monitoring

### Database Backup

```bash
# Backup database
pg_dump -h localhost -U otto_user otto > otto_backup.sql

# Restore database
psql -h localhost -U otto_user otto < otto_backup.sql
```

### File Backup

```bash
# Backup uploads directory
tar -czf uploads_backup.tar.gz uploads/

# Restore uploads
tar -xzf uploads_backup.tar.gz
```

### Monitoring

Monitor Otto using:

- **Health endpoint**: `GET /health`
- **Statistics endpoint**: `GET /stats`
- **Log files**: `logs/otto.log`, `logs/error.log`
- **PM2 monitoring**: `pm2 monit`

## Troubleshooting

### Common Issues

1. **Database connection failed**
   ```
   Error: ECONNREFUSED 127.0.0.1:5432
   ```
   - Check PostgreSQL is running
   - Verify database credentials
   - Check firewall settings

2. **Permission denied on uploads directory**
   ```
   Error: EACCES: permission denied, mkdir './uploads'
   ```
   - Check directory permissions
   - Ensure Otto user has write access

3. **File upload fails**
   ```
   Error: File type not allowed
   ```
   - Check `ALLOWED_MIME_TYPES` configuration
   - Verify file size against `MAX_FILE_SIZE`

4. **Authentication errors**
   ```
   Error: Invalid service token
   ```
   - Verify `SERVICE_TOKEN` in `.env`
   - Check token format and length

### Log Analysis

```bash
# View recent logs
tail -f logs/otto.log

# Search for errors
grep "ERROR" logs/otto.log

# Monitor uploads
grep "upload" logs/otto.log
```

### Health Check

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "database": "connected",
  "uploadsDirectory": {
    "status": "accessible"
  }
}
```

## Next Steps

After installation:

1. **Test upload functionality** using the upload script
2. **Configure authentication** for your use case
3. **Set up monitoring** and backups
4. **Configure reverse proxy** for production
5. **Review security settings** and rate limits
6. **Integrate with your applications** using the API

## Support

For installation issues:

- Check the troubleshooting section
- Review log files for error details
- Ensure all prerequisites are met
- Verify environment configuration
- Test database connectivity

For additional help, see the main README.
