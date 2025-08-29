const express = require('express');
const path = require('path');
const fs = require('fs');
const ytdl = require('@distube/ytdl-core');
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
    const formatOptions = getFormatOptions(quality);
    const isAudio = quality === 'audio';
    const fileExtension = isAudio ? 'mp3' : 'mp4';
    const nextBaseName = getNextVideoName(outputFolder);
    const fileName = `${nextBaseName}.${fileExtension}`;
    const filePath = path.join(outputFolder, fileName);

    console.log(`Starting download for ${url} with quality: ${quality}...`);

    // Start download process immediately and return result
    try {
      const stream = ytdl(url, {
        quality: formatOptions.quality,
        filter: formatOptions.filter
      });

      const writeStream = fs.createWriteStream(filePath);

      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on('end', resolve);
        stream.on('error', reject);
        writeStream.on('error', reject);
      });

      console.log(`Download complete! Saved as ${fileName}`);
      
      // Return success response
      return res.status(200).json({
        status: 'completed',
        message: `${isAudio ? 'Audio' : 'Video'} download completed successfully!`,
        filename: fileName,
        downloadUrl: `/download-file/${fileName}`,
        quality: quality
      });
      
    } catch (downloadError) {
      console.error('Download error:', downloadError);
      
      // Clean up failed download
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      let errorMessage = 'Failed to download video';
      if (downloadError.message.includes('Video unavailable')) {
        errorMessage = 'Video is unavailable or private';
      } else if (downloadError.message.includes('This video is not available')) {
        errorMessage = 'Video not available in this region';  
      } else if (downloadError.message.includes('Sign in to confirm')) {
        errorMessage = 'Age-restricted content cannot be downloaded';
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

    // Get video info to extract thumbnail
    const info = await ytdl.getInfo(url);
    const thumbnailUrl = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url;

    const outputFolder = path.join(__dirname, 'downloads');
    const nextBaseName = getNextVideoName(outputFolder, 'thumbnail');
    const fileName = `${nextBaseName}.jpg`;
    const filePath = path.join(outputFolder, fileName);

    // Download thumbnail
    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch thumbnail: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));

    console.log(`Thumbnail download complete! Saved as ${fileName}`);
    
    res.status(200).json({
      status: 'completed',
      message: 'Thumbnail download completed successfully!',
      filename: fileName,
      downloadUrl: `/download-file/${fileName}`
    });

  } catch (error) {
    console.error('Error downloading thumbnail:', error);
    
    let errorMessage = 'Failed to download thumbnail';
    if (error.message.includes('unavailable')) {
      errorMessage = 'Video is unavailable or private';
    } else if (error.message.includes('fetch thumbnail')) {
      errorMessage = 'Could not fetch thumbnail image';
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
app.get('/', (req, res) => {
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