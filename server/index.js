const express = require('express')
const cors = require('cors')
const multer = require('multer')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const cron = require('node-cron')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://video-portfolio-frontend.onrender.com'
  ],
  credentials: true
}))
app.use(express.json())

// Database setup
const db = new sqlite3.Database('./server/database.sqlite')

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  // Videos table
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`)
})

// Backblaze B2 configuration
const b2Client = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: 'us-west-002',
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY
  }
})

const BUCKET_NAME = process.env.B2_BUCKET_NAME

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true)
    } else {
      cb(new Error('Only video files are allowed'), false)
    }
  }
})

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ message: 'Access token required' })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' })
    }
    req.user = user
    next()
  })
}

// Routes

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body

    // Check if user already exists
    db.get('SELECT * FROM users WHERE email = ? OR username = ?', [email, username], async (err, user) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' })
      }
      if (user) {
        return res.status(400).json({ message: 'User already exists' })
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10)

      // Insert new user
      db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
        [username, email, hashedPassword], function(err) {
        if (err) {
          return res.status(500).json({ message: 'Failed to create user' })
        }

        // Generate JWT token
        const token = jwt.sign({ id: this.lastID, username, email }, JWT_SECRET, { expiresIn: '7d' })

        res.json({
          success: true,
          token,
          user: { id: this.lastID, username, email }
        })
      })
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' })
      }
      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' })
      }

      const validPassword = await bcrypt.compare(password, user.password)
      if (!validPassword) {
        return res.status(400).json({ message: 'Invalid credentials' })
      }

      const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' })

      res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username, email: user.email }
      })
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user })
})

// Upload video
app.post('/api/videos/upload', authenticateToken, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file provided' })
    }

    const { originalname, buffer, mimetype, size } = req.file
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${originalname}`
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days from now

    // Upload to Backblaze B2
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: mimetype,
      Metadata: {
        'original-name': originalname,
        'user-id': req.user.id.toString(),
        'expires-at': expiresAt.toISOString()
      }
    }

    await b2Client.send(new PutObjectCommand(uploadParams))

    // Save to database
    db.run('INSERT INTO videos (user_id, original_name, file_name, file_size, mime_type, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, originalname, fileName, size, mimetype, expiresAt.toISOString()], function(err) {
      if (err) {
        return res.status(500).json({ message: 'Failed to save video metadata' })
      }

      res.json({
        success: true,
        message: 'Video uploaded successfully',
        video: {
          id: this.lastID,
          originalName: originalname,
          fileName,
          size,
          expiresAt: expiresAt.toISOString()
        }
      })
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ message: 'Upload failed' })
  }
})

// Get user's videos
app.get('/api/videos', authenticateToken, (req, res) => {
  db.all('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], async (err, videos) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to fetch videos' })
    }

    // Generate signed URLs for each video
    const videosWithUrls = await Promise.all(videos.map(async (video) => {
      try {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: video.file_name
        })
        const url = await getSignedUrl(b2Client, command, { expiresIn: 3600 }) // 1 hour

        // Generate a public download URL for Discord (24 hour expiry)
        const downloadUrl = await getSignedUrl(b2Client, command, { expiresIn: 86400 }) // 24 hours
        const shareableUrl = downloadUrl

        return {
          id: video.id,
          originalName: video.original_name,
          fileName: video.file_name,
          size: video.file_size,
          mimeType: video.mime_type,
          url,
          shareableUrl,
          expiresAt: video.expires_at,
          createdAt: video.created_at
        }
      } catch (error) {
        console.error('Error generating signed URL:', error)
        return {
          ...video,
          url: null,
          shareableUrl: null
        }
      }
    }))

    res.json({ videos: videosWithUrls })
  })
})

// Shareable video endpoint (no authentication required)
app.get('/api/videos/share/:id', async (req, res) => {
  try {
    const videoId = req.params.id
    console.log('Share request for video ID:', videoId)

    // Get video details
    db.get('SELECT * FROM videos WHERE id = ?', [videoId], async (err, video) => {
      if (err) {
        console.error('Database error:', err)
        return res.status(500).json({ message: 'Database error' })
      }
      if (!video) {
        console.log('Video not found for ID:', videoId)
        return res.status(404).json({ message: 'Video not found' })
      }

      console.log('Found video:', video.original_name)

      // Check if video is expired
      if (new Date(video.expires_at) <= new Date()) {
        console.log('Video expired:', video.original_name)
        return res.status(410).json({ message: 'Video has expired' })
      }

      // Generate signed URL for the video
      try {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: video.file_name
        })
        const url = await getSignedUrl(b2Client, command, { expiresIn: 3600 }) // 1 hour

        console.log('Generated signed URL for:', video.original_name)

        // Return HTML page with Open Graph meta tags for Discord rich previews
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Open Graph meta tags for Discord rich previews -->
    <meta property="og:title" content="${video.original_name}">
    <meta property="og:description" content="Watch this video - expires ${new Date(video.expires_at).toLocaleDateString()}">
    <meta property="og:type" content="video.other">
    <meta property="og:url" content="${req.protocol}://${req.get('host')}/api/videos/share/${video.id}">
    <meta property="og:image" content="${req.protocol}://${req.get('host')}/api/videos/thumbnail/${video.id}">
    <meta property="og:video" content="${url}">
    <meta property="og:video:type" content="${video.mime_type}">
    <meta property="og:video:width" content="1280">
    <meta property="og:video:height" content="720">
    
    <!-- Twitter Card meta tags -->
    <meta name="twitter:card" content="player">
    <meta name="twitter:title" content="${video.original_name}">
    <meta name="twitter:description" content="Watch this video - expires ${new Date(video.expires_at).toLocaleDateString()}">
    <meta name="twitter:player" content="${req.protocol}://${req.get('host')}/api/videos/share/${video.id}">
    <meta name="twitter:player:width" content="1280">
    <meta name="twitter:player:height" content="720">
    
    <title>${video.original_name}</title>
    <style>
        body { 
            margin: 0; 
            background: #000; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            min-height: 100vh; 
            font-family: Arial, sans-serif;
        }
        video { 
            max-width: 100%; 
            max-height: 100vh; 
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .info { 
            position: fixed; 
            top: 20px; 
            left: 20px; 
            background: rgba(0,0,0,0.8); 
            color: white; 
            padding: 10px 15px; 
            border-radius: 5px; 
            font-size: 14px;
            z-index: 1000;
        }
        .expires { 
            position: fixed; 
            bottom: 20px; 
            right: 20px; 
            background: rgba(255,0,0,0.8); 
            color: white; 
            padding: 10px 15px; 
            border-radius: 5px; 
            font-size: 14px;
            z-index: 1000;
        }
        .video-container {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100vh;
        }
    </style>
</head>
<body>
    <div class="info">${video.original_name}</div>
    <div class="expires">Expires: ${new Date(video.expires_at).toLocaleDateString()}</div>
    <div class="video-container">
        <video controls autoplay>
            <source src="${url}" type="${video.mime_type}">
            Your browser does not support the video tag.
        </video>
    </div>
    <script>
        // Auto-refresh URL before it expires
        setTimeout(() => {
            location.reload();
        }, 3500000); // Refresh 5 minutes before URL expires
    </script>
</body>
</html>`

        res.setHeader('Content-Type', 'text/html')
        res.send(html)
      } catch (error) {
        console.error('Error generating signed URL:', error)
        res.status(500).json({ message: 'Failed to load video' })
      }
    })
  } catch (error) {
    console.error('Server error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Delete video
app.delete('/api/videos/:id', authenticateToken, async (req, res) => {
  try {
    const videoId = req.params.id

    // Get video details
    db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [videoId, req.user.id], async (err, video) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' })
      }
      if (!video) {
        return res.status(404).json({ message: 'Video not found' })
      }

      // Delete from Backblaze B2
      try {
        await b2Client.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: video.file_name
        }))
      } catch (error) {
        console.error('Error deleting from B2:', error)
      }

      // Delete from database
      db.run('DELETE FROM videos WHERE id = ?', [videoId], function(err) {
        if (err) {
          return res.status(500).json({ message: 'Failed to delete video' })
        }

        res.json({ success: true, message: 'Video deleted successfully' })
      })
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Thumbnail endpoint for Discord previews
app.get('/api/videos/thumbnail/:id', async (req, res) => {
  try {
    const videoId = req.params.id
    
    // Get video details
    db.get('SELECT * FROM videos WHERE id = ?', [videoId], async (err, video) => {
      if (err || !video) {
        // Return a default thumbnail
        res.setHeader('Content-Type', 'image/svg+xml')
        res.send(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
          <rect width="1200" height="630" fill="#1a1a1a"/>
          <text x="600" y="315" font-family="Arial, sans-serif" font-size="48" fill="white" text-anchor="middle">Video Player</text>
          <circle cx="600" cy="200" r="60" fill="#3b82f6"/>
          <polygon points="580,180 580,220 620,200" fill="white"/>
        </svg>`)
        return
      }

      // Check if video is expired
      if (new Date(video.expires_at) <= new Date()) {
        res.setHeader('Content-Type', 'image/svg+xml')
        res.send(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
          <rect width="1200" height="630" fill="#dc2626"/>
          <text x="600" y="315" font-family="Arial, sans-serif" font-size="48" fill="white" text-anchor="middle">Video Expired</text>
        </svg>`)
        return
      }

      // Generate a nice thumbnail with video info
      res.setHeader('Content-Type', 'image/svg+xml')
      res.send(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)"/>
        <rect x="100" y="100" width="1000" height="430" rx="20" fill="#1e293b" stroke="#3b82f6" stroke-width="3"/>
        <circle cx="600" cy="315" r="80" fill="#3b82f6"/>
        <polygon points="570,285 570,345 630,315" fill="white"/>
        <text x="600" y="450" font-family="Arial, sans-serif" font-size="32" fill="white" text-anchor="middle">${video.original_name}</text>
        <text x="600" y="480" font-family="Arial, sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle">Click to play video</text>
      </svg>`)
    })
  } catch (error) {
    console.error('Thumbnail error:', error)
    res.status(500).send('Error generating thumbnail')
  }
})

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!', timestamp: new Date().toISOString() })
})

// Auto-delete expired videos (runs every hour)
cron.schedule('0 * * * *', async () => {
  console.log('Running auto-delete for expired videos...')
  
  db.all('SELECT * FROM videos WHERE expires_at <= datetime("now")', [], async (err, expiredVideos) => {
    if (err) {
      console.error('Error fetching expired videos:', err)
      return
    }

    for (const video of expiredVideos) {
      try {
        // Delete from Backblaze B2
        await b2Client.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: video.file_name
        }))

        // Delete from database
        db.run('DELETE FROM videos WHERE id = ?', [video.id], (err) => {
          if (err) {
            console.error('Error deleting expired video from database:', err)
          } else {
            console.log(`Deleted expired video: ${video.original_name}`)
          }
        })
      } catch (error) {
        console.error('Error deleting expired video:', error)
      }
    }
  })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
}) 