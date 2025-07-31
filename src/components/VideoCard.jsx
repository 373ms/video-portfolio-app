import { useState, useEffect } from 'react'
import axios from 'axios'

const VideoCard = ({ video, onDelete }) => {
  const [timeLeft, setTimeLeft] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showShareUrl, setShowShareUrl] = useState(false)

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime()
      const expiresAt = new Date(video.expiresAt).getTime()
      const difference = expiresAt - now

      if (difference <= 0) {
        setTimeLeft('Expired')
        return
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24))
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h`)
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`)
      } else {
        setTimeLeft(`${minutes}m`)
      }
    }

    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 60000) // Update every minute

    return () => clearInterval(timer)
  }, [video.expiresAt])

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this video?')) {
      setIsDeleting(true)
      try {
        await axios.delete(`/api/videos/${video.id}`)
        onDelete(video.id)
      } catch (error) {
        console.error('Error deleting video:', error)
        alert('Failed to delete video')
      } finally {
        setIsDeleting(false)
      }
    }
  }

  const copyShareUrl = async () => {
    const urlToCopy = video.shareableUrl || `Direct video URL not available`
    try {
      await navigator.clipboard.writeText(urlToCopy)
      alert('Shareable URL copied to clipboard!')
    } catch (error) {
      console.error('Failed to copy URL:', error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = urlToCopy
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('Shareable URL copied to clipboard!')
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const isExpired = new Date(video.expiresAt) <= new Date()

  return (
    <div className={`video-card ${isExpired ? 'opacity-60' : ''}`}>
      <div className="relative">
        <video 
          className="w-full h-48 object-cover"
          controls
          preload="metadata"
        >
          <source src={video.url} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        
        {isExpired && (
          <div className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center">
            <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              EXPIRED
            </span>
          </div>
        )}
      </div>
      
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-medium text-gray-900 truncate flex-1">
            {video.originalName}
          </h3>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-500 hover:text-red-700 ml-2 transition-colors duration-200"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
        
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>{formatFileSize(video.size)}</span>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              isExpired 
                ? 'bg-red-100 text-red-800' 
                : timeLeft.includes('d') 
                  ? 'bg-green-100 text-green-800'
                  : timeLeft.includes('h')
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
            }`}>
              {timeLeft}
            </span>
          </div>
        </div>
        
        {/* Shareable URL Section */}
        {!isExpired && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Discord Share URL:</span>
              <button
                onClick={() => setShowShareUrl(!showShareUrl)}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                {showShareUrl ? 'Hide' : 'Show'}
              </button>
            </div>
            {showShareUrl && (
              <div className="mt-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={video.shareableUrl || `Direct video URL not available`}
                    readOnly
                    className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1"
                  />
                  <button
                    onClick={copyShareUrl}
                    className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Direct video URL (24h expiry) - paste in Discord to play without file size limits!
                </p>
              </div>
            )}
          </div>
        )}
        
        <div className="mt-2 text-xs text-gray-500">
          Uploaded: {new Date(video.createdAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  )
}

export default VideoCard 