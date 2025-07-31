# Video Portfolio App

A modern web application for uploading and sharing videos with automatic deletion after 5 days. Built with React, Node.js, and Backblaze B2 storage.

## Features

- 🎥 **Video Upload**: Drag & drop or click to upload videos (up to 200MB)
- 🔐 **User Authentication**: Secure login and registration system
- 📱 **Modern UI**: Beautiful, responsive design with Tailwind CSS
- ⏰ **Auto-Deletion**: Videos automatically deleted after 5 days
- 📊 **Portfolio Dashboard**: View all your videos with countdown timers
- 🔗 **Discord Share URLs**: Generate shareable links that work like Streamable
- 🗑️ **Manual Deletion**: Delete videos manually before expiration
- 🔒 **Secure Storage**: Videos stored securely on Backblaze B2
- 📈 **Real-time Stats**: Track total videos, storage usage, and expiration status

## Tech Stack

### Frontend
- **React 18** - Modern UI framework
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Axios** - HTTP client

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **SQLite** - Lightweight database
- **JWT** - Authentication tokens
- **Multer** - File upload handling
- **Node-cron** - Scheduled tasks

### Storage
- **Backblaze B2** - Cloud storage (10GB free tier)
- **AWS SDK** - S3-compatible API

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Backblaze B2 account

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd video-portfolio-app
```

### 2. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 3. Backblaze B2 Setup

1. Create a Backblaze B2 account at [backblaze.com](https://www.backblaze.com)
2. Create a new bucket for your videos
3. Create an application key with read/write permissions
4. Note down your:
   - Key ID
   - Application Key
   - Bucket Name
   - Endpoint URL

### 4. Environment Configuration

1. Copy the example environment file:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` with your Backblaze B2 credentials:
   ```env
   B2_KEY_ID=your_backblaze_key_id
   B2_APPLICATION_KEY=your_backblaze_application_key
   B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com
   B2_BUCKET_NAME=your_bucket_name
   JWT_SECRET=your-super-secret-jwt-key-change-this
   PORT=5000
   ```

### 5. Start the Application

#### Development Mode

```bash
# Terminal 1: Start the backend server
npm run server

# Terminal 2: Start the frontend development server
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

#### Production Mode

```bash
# Build the frontend
npm run build

# Start the production server
npm run server
```

## Usage

### 1. Registration
- Visit the application and click "Register"
- Create an account with username, email, and password

### 2. Upload Videos
- Click "Upload Video" or drag & drop a video file
- Supported formats: MP4, AVI, MOV, WMV, FLV
- Maximum file size: 100MB

### 3. View Portfolio
- Dashboard shows all your uploaded videos
- Each video displays:
  - Thumbnail preview
  - File name and size
  - Countdown timer to deletion
  - Upload date

### 4. Video Management
- Click the delete button to remove videos manually
- Videos automatically delete after 5 days
- Expired videos are marked with "EXPIRED" status

### 5. Share on Discord
- Each video has a "Show" button to reveal the shareable URL
- Copy the URL and paste it in Discord
- Videos play directly in Discord without file size limits
- URLs work like Streamable - full-screen video player

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Videos
- `POST /api/videos/upload` - Upload video
- `GET /api/videos` - Get user's videos
- `DELETE /api/videos/:id` - Delete video

## Auto-Deletion System

The application includes an automated system that:
- Runs every hour to check for expired videos
- Deletes videos from both Backblaze B2 and the database
- Logs deletion activities for monitoring

## Security Features

- **Password Hashing**: Passwords encrypted with bcrypt
- **JWT Authentication**: Secure token-based authentication
- **File Validation**: Only video files accepted
- **Size Limits**: 100MB maximum file size
- **Signed URLs**: Temporary access URLs for video streaming

## File Structure

```
video-portfolio-app/
├── src/
│   ├── components/          # React components
│   ├── contexts/           # React contexts
│   ├── pages/              # Page components
│   ├── App.jsx             # Main app component
│   ├── main.jsx            # Entry point
│   └── index.css           # Global styles
├── server/
│   └── index.js            # Express server
├── package.json            # Dependencies
├── vite.config.js          # Vite configuration
├── tailwind.config.js      # Tailwind configuration
├── env.example             # Environment variables example
└── README.md               # This file
```

## Troubleshooting

### Common Issues

1. **Upload Fails**
   - Check Backblaze B2 credentials in `.env`
   - Verify bucket name and permissions
   - Ensure file is under 100MB

2. **Authentication Errors**
   - Clear browser localStorage
   - Check JWT_SECRET in environment
   - Restart the server

3. **Database Issues**
   - Check if `server/database.sqlite` exists
   - Restart the server to recreate tables

### Backblaze B2 Setup Tips

1. **Bucket Configuration**
   - Set bucket to "Private" for security
   - Enable CORS if needed for direct uploads

2. **Application Keys**
   - Create keys with minimal required permissions
   - Use separate keys for development/production

3. **Cost Optimization**
   - Monitor storage usage (10GB free tier)
   - Delete unused videos to save space

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Backblaze B2 documentation
3. Open an issue on GitHub

---

**Note**: This application uses Backblaze B2's free tier (10GB storage). For production use, consider upgrading to a paid plan for more storage and features. 