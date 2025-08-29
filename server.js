const express = require('express');
const path = require('path');
const fs = require('fs');
const ytdl = require('ytdl-core');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS for cross-origin requests from Netlify frontend
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://youtube-video-downloder-frontend.netlify.app'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

app.use(express.json());

// Serve static files (frontend)
app.use(express.static(__dirname));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function getNextVideoName(folder, prefix = 'video') {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  
  const files = fs.readdirSync(folder);
  let maxNumber = 0;

  files.forEach(file => {
    const match = file.match(new RegExp(`^${prefix}(\\d+)\\.[^.]+$`));
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNumber) maxNumber = num;
    }
  });

  return `${prefix}${maxNumber + 1}`;
}

function getFormatOptions(quality) {
  switch (quality) {
    case 'best':
      return { quality: 'highestvideo', filter: 'audioandvideo' };
    case 'worst':
      return { quality: 'lowestvideo', filter: 'audioandvideo' };
    case 'audio':
      return { quality: 'highestaudio', filter: 'audioonly' };
    case '2160':
      return { quality: 'highestvideo', filter: format => format.height <= 2160 };
    case '1440':
      return { quality: 'highestvideo', filter: format => format.height <= 1440 };
    case '1080':
      return { quality: 'highestvideo', filter: format => format.height <= 1080 };
    case '720':
      return { quality: 'highestvideo', filter: format => format.height <= 720 };
    case '480':
      return { quality: 'highestvideo', filter: format => format.height <= 480 };
    case '360':
      return { quality: 'highestvideo', filter: format => format.height <= 360 };
    default:
      return { quality: 'highestvideo', filter: 'audioandvideo' };
  }
}

app.post('/download', async (req, res) => {
  try {
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
      return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
    }

    // Basic URL format validation
    if (!url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/)) {
      return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
    }

    const outputFolder = path.join(__dirname, 'downloads');
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    const formatOptions = getFormatOptions(quality);
    const isAudio = quality === 'audio';
    const fileExtension = isAudio ? 'mp3' : 'mp4';
    const nextBaseName = getNextVideoName(outputFolder);
    const fileName = `${nextBaseName}.${fileExtension}`;
    const filePath = path.join(outputFolder, fileName);

    console.log(`Starting download for ${url} with quality: ${quality}...`);

    try {
      // Simple ytdl-core download
      const formatOptions = getFormatOptions(quality);
      const isAudio = quality === 'audio';
      const fileExtension = isAudio ? 'mp3' : 'mp4';
      const actualFileName = `${nextBaseName}.${fileExtension}`;
      const actualFilePath = path.join(outputFolder, actualFileName);
      
      console.log(`Downloading ${url} to ${actualFileName}...`);
      
      const stream = ytdl(url, formatOptions);
      const writeStream = fs.createWriteStream(actualFilePath);
      
      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on('end', resolve);
        stream.on('error', reject);
        writeStream.on('error', reject);
      });

      console.log(`Download complete! Saved as ${actualFileName}`);
      
      // Return success response
      return res.status(200).json({
        status: 'completed',
        message: `${isAudio ? 'Audio' : 'Video'} download completed successfully!`,
        filename: actualFileName,
        downloadUrl: `/download-file/${actualFileName}`,
        quality: quality
      });
      
    } catch (downloadError) {
      console.error('Download error:', downloadError);
      
      // Clean up failed download - check for any files starting with our base name
      try {
        const files = fs.readdirSync(outputFolder);
        files.forEach(file => {
          if (file.startsWith(nextBaseName)) {
            fs.unlinkSync(path.join(outputFolder, file));
          }
        });
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      
      let errorMessage = 'Failed to download video';
      if (downloadError.message.includes('Video unavailable')) {
        errorMessage = 'Video is unavailable or private';
      } else if (downloadError.message.includes('This video is not available')) {
        errorMessage = 'Video not available in this region';  
      } else if (downloadError.message.includes('Sign in to confirm')) {
        errorMessage = 'Age-restricted content cannot be downloaded';
      } else if (downloadError.message.includes('Private video')) {
        errorMessage = 'This is a private video and cannot be downloaded';
      } else if (downloadError.message.includes('blocked')) {
        errorMessage = 'Video is blocked in this region';
      }
      
      return res.status(500).json({
        status: 'error',
        message: errorMessage
      });
    }

  } catch (error) {
    console.error('Error downloading video:', error);
    
    let errorMessage = 'Failed to download video';
    if (error.message.includes('unavailable')) {
      errorMessage = 'Video is unavailable or private';
    } else if (error.message.includes('restricted')) {
      errorMessage = 'Video is restricted in this region';
    } else if (error.message.includes('age')) {
      errorMessage = 'Age-restricted content cannot be downloaded';
    }
    
    res.status(500).json({
      status: 'error',
      message: errorMessage
    });
  }
});

app.post('/download-thumbnail', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
      return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
    }

    const outputFolder = path.join(__dirname, 'downloads');
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    const nextBaseName = getNextVideoName(outputFolder, 'thumbnail');
    const fileName = `${nextBaseName}.jpg`;
    const filePath = path.join(outputFolder, fileName);

    try {
      // Get video info to extract thumbnail
      const info = await ytdl.getInfo(url);
      const thumbnail = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1];
      
      if (!thumbnail || !thumbnail.url) {
        throw new Error('No thumbnail available for this video');
      }

      console.log(`Downloading thumbnail from: ${thumbnail.url}`);
      
      // Download thumbnail
      const response = await fetch(thumbnail.url);
      if (!response.ok) {
        throw new Error(`Failed to download thumbnail: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      const thumbnailFileName = `${nextBaseName}.jpg`;
      const thumbnailPath = path.join(outputFolder, thumbnailFileName);
      
      fs.writeFileSync(thumbnailPath, Buffer.from(buffer));
      
      console.log(`Thumbnail download complete! Saved as ${thumbnailFileName}`);
      
      res.status(200).json({
        status: 'completed',
        message: 'Thumbnail download completed successfully!',
        filename: thumbnailFileName,
        downloadUrl: `/download-file/${thumbnailFileName}`
      });

    } catch (downloadError) {
      console.error('Thumbnail download error:', downloadError);
      throw downloadError;
    }

  } catch (error) {
    console.error('Error downloading thumbnail:', error);
    
    let errorMessage = 'Failed to download thumbnail';
    if (error.message.includes('unavailable')) {
      errorMessage = 'Video is unavailable or private';
    } else if (error.message.includes('Private video')) {
      errorMessage = 'This is a private video';
    } else if (error.message.includes('blocked')) {
      errorMessage = 'Video is blocked in this region';
    }
    
    res.status(500).json({
      status: 'error',
      message: errorMessage
    });
  }
});

app.get('/download-file/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'downloads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('Error sending file:', err);
      res.status(500).json({ error: 'Error downloading file' });
    }
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    message: 'YouTube Downloader API is running',
    endpoints: {
      'POST /download': 'Download video/audio',
      'POST /download-thumbnail': 'Download thumbnail',
      'GET /download-file/:filename': 'Download specific file'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`YouTube Downloader API running at http://localhost:${PORT}`);
});