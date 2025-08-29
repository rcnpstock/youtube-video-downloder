const express = require('express');
const path = require('path');
const fs = require('fs');
const youtubedl = require('node-youtube-dl');
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
  const baseOptions = ['--no-check-certificate', '--prefer-insecure'];
  
  switch (quality) {
    case 'best':
      return [...baseOptions, '--format', 'best[ext=mp4]/best'];
    case 'worst':
      return [...baseOptions, '--format', 'worst[ext=mp4]/worst'];
    case 'audio':
      return [...baseOptions, '--format', 'bestaudio', '--extract-audio', '--audio-format', 'mp3'];
    case '2160':
      return [...baseOptions, '--format', 'best[height<=2160][ext=mp4]/best[height<=2160]/best'];
    case '1440':
      return [...baseOptions, '--format', 'best[height<=1440][ext=mp4]/best[height<=1440]/best'];
    case '1080':
      return [...baseOptions, '--format', 'best[height<=1080][ext=mp4]/best[height<=1080]/best'];
    case '720':
      return [...baseOptions, '--format', 'best[height<=720][ext=mp4]/best[height<=720]/best'];
    case '480':
      return [...baseOptions, '--format', 'best[height<=480][ext=mp4]/best[height<=480]/best'];
    case '360':
      return [...baseOptions, '--format', 'best[height<=360][ext=mp4]/best[height<=360]/best'];
    default:
      return [...baseOptions, '--format', 'best[ext=mp4]/best'];
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
      // Download using node-youtube-dl
      const formatOptions = getFormatOptions(quality);
      const outputPath = path.join(outputFolder, `${nextBaseName}.%(ext)s`);
      
      console.log('Executing download with options:', formatOptions);
      
      await new Promise((resolve, reject) => {
        const video = youtubedl(url, formatOptions, {
          cwd: outputFolder
        });
        
        video.on('info', (info) => {
          console.log('Download started:', info.title);
          console.log('Filename: ' + info._filename);
          
          const outputFile = path.join(outputFolder, `${nextBaseName}.${info.ext}`);
          video.pipe(fs.createWriteStream(outputFile));
        });
        
        video.on('complete', (info) => {
          console.log('Download completed:', info.title);
          resolve(info);
        });
        
        video.on('error', (err) => {
          console.error('Download error:', err);
          reject(err);
        });
      });

      console.log(`Download complete! Checking for downloaded file...`);
      
      // Find the actual downloaded file
      const files = fs.readdirSync(outputFolder);
      console.log('Available files after download:', files);
      
      const downloadedFile = files.find(file => 
        file.startsWith(nextBaseName) && 
        !file.includes('thumbnail') &&
        (file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.webm') || file.endsWith('.mp3'))
      );
      
      if (!downloadedFile) {
        console.error('Available files:', files);
        throw new Error('Downloaded file not found');
      }

      console.log(`Download complete! Saved as ${downloadedFile}`);
      
      // Return success response
      return res.status(200).json({
        status: 'completed',
        message: `${isAudio ? 'Audio' : 'Video'} download completed successfully!`,
        filename: downloadedFile,
        downloadUrl: `/download-file/${downloadedFile}`,
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
      // Get video info first to extract thumbnail URL
      await new Promise((resolve, reject) => {
        youtubedl.getInfo(url, ['--no-check-certificate'], (err, info) => {
          if (err) {
            reject(err);
            return;
          }
          
          console.log('Got video info:', info.title);
          
          if (info.thumbnail) {
            // Download thumbnail directly
            fetch(info.thumbnail)
              .then(response => response.arrayBuffer())
              .then(buffer => {
                const thumbnailPath = path.join(outputFolder, `${nextBaseName}.jpg`);
                fs.writeFileSync(thumbnailPath, Buffer.from(buffer));
                resolve(info);
              })
              .catch(reject);
          } else {
            reject(new Error('No thumbnail URL found'));
          }
        });
      });

      // Find the actual thumbnail file
      const files = fs.readdirSync(outputFolder);
      console.log('Available files after thumbnail download:', files);
      
      const thumbnailFile = files.find(file => 
        file.startsWith(nextBaseName) && 
        (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || 
         file.endsWith('.webp'))
      );
      
      if (thumbnailFile) {
        console.log(`Thumbnail download complete! Saved as ${thumbnailFile}`);
        
        res.status(200).json({
          status: 'completed',
          message: 'Thumbnail download completed successfully!',
          filename: thumbnailFile,
          downloadUrl: `/download-file/${thumbnailFile}`
        });
      } else {
        console.error('No thumbnail file found. Available files:', files);
        throw new Error('Thumbnail file not found after download');
      }

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