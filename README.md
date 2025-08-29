# YouTube Downloader API

Clean, minimal backend for YouTube video downloading.

## Features
- Download YouTube videos in multiple qualities
- Audio-only downloads (MP3)
- Thumbnail downloads
- CORS-enabled for frontend integration

## Deployment
Ready for deployment on Render.com

## Endpoints
- `POST /download` - Download video/audio
- `POST /download-thumbnail` - Download thumbnail
- `GET /download-file/:filename` - Serve downloaded files
- `GET /health` - Health check