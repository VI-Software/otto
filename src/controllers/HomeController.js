// Otto File Server Homepage Controller
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import FileModel from '../models/File.js'
import logger from '../config/logger.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json')

// Helper function for formatting bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

class HomeController {  
    async home(req, res) {
        try {
            const customHtmlFile = process.env.HOMEPAGE_HTML_FILE
        
            let html
        
            if (customHtmlFile) {
                try {
                    const filePath = path.resolve(process.cwd(), customHtmlFile)
                
                    const projectRoot = process.cwd()
                    if (!filePath.startsWith(projectRoot)) {
                        throw new Error('Custom homepage file must be within the project directory')
                    }
                
                    if (!fs.existsSync(filePath)) {
                        throw new Error(`Custom homepage file not found: ${filePath}`)
                    }
                
                    html = fs.readFileSync(filePath, 'utf8')
                    logger.info('Loaded custom homepage from file', { filePath })
                
                } catch (fileError) {
                    logger.error('Failed to load custom homepage file, falling back to default', { 
                        file: customHtmlFile, 
                        error: fileError.message 
                    })
                    html = await this.getDefaultHtml()
                }
            } else {
                html = await this.getDefaultHtml()
            }
        
            res.setHeader('Content-Type', 'text/html')
            res.send(html)
        } catch (error) {
            logger.error('Failed to load homepage', { error: error.message })
            res.status(500).json({ 
                error: 'Failed to load homepage',
                message: error.message 
            })
        }  
    }

    async getDefaultHtml() {
        const showStats = process.env.SHOW_STATS !== 'false'
        const stats = showStats ? await FileModel.getStats() : null
    
        return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Otto - The simple and efficient file server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 3rem;
      border: 1px solid rgba(255,255,255,0.2);
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      max-width: 600px;
      width: 90%;
    }
    h1 { 
      font-size: 3rem; 
      margin-bottom: 1rem;
      background: linear-gradient(45deg, #fff, #f0f0f0);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .subtitle {
      font-size: 1.2rem;
      margin-bottom: 2rem;
      opacity: 0.9;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin: 2rem 0;
    }
    .stat {
      background: rgba(255,255,255,0.1);
      padding: 1rem;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }    .stat-label {
      font-size: 0.9rem;
      opacity: 0.8;
    }
    .success-message {
      margin: 2rem 0;
      padding: 1.5rem;
      background: rgba(255,255,255,0.1);
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .success-message p {
      font-size: 1.1rem;
      line-height: 1.6;
      margin: 0;
    }
    .version {
      margin-top: 1rem;
      opacity: 0.7;
      font-size: 0.9rem;
    }
    .copyright {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255,255,255,0.2);
      font-size: 0.8rem;
      opacity: 0.8;
      line-height: 1.4;
    }
    .copyright p {
      margin: 0.3rem 0;
    }
    .copyright a {
      color: #4ade80;
      text-decoration: none;
    }
    .copyright a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>  <div class="container">
    <h1>Otto</h1>    
    <div class="subtitle">The simple and efficient file server</div>
    
    <div class="success-message">
      <p>This is the default Otto file server homepage. If you can see this page, the Otto file server is working properly.</p>
    </div>
    
    ${showStats ? `<div class="stats">
      <div class="stat">
        <div class="stat-value">${stats.total_files || 0}</div>
        <div class="stat-label">Files</div>
      </div>
      <div class="stat">
        <div class="stat-value">${formatBytes(stats.total_size || 0)}</div>
        <div class="stat-label">Storage</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.unique_contexts || 0}</div>
        <div class="stat-label">Contexts</div>
      </div>
    </div>` : ''}

    <div class="version">Otto v${version || '1.0.0'}</div>    <div class="copyright">
      <p>&copy; 2025 VI Software Studio.</p>
      <p><a href="https://github.com/vi-software/otto" target="_blank" style="color: #4ade80;">Otto is open source</a> software licensed under the <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" style="color: #4ade80;">GNU Affero General Public License v3.0</a></p>
    </div>
  </div>
</body>
</html>`
    }

    formatBytes(bytes) {
        return formatBytes(bytes)
    }

    async stats(req, res) {
        try {
            const stats = await FileModel.getStats()
            res.json({
                success: true,
                data: {
                    ...stats,
                    total_size_formatted: formatBytes(stats.total_size || 0),
                    version: version || '1.0.0'
                }
            })
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to get stats',
                message: error.message
            })
        }
    }
}

export default new HomeController()
