require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const categories = require('./categories');
const users = require('./users');
const { runViralAgent, calculateVirality } = require('./scraperEngine');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.warn('[WARN] SESSION_SECRET not set — using an insecure development fallback. Set SESSION_SECRET in .env before any non-local use.');
}

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(session({
  secret: SESSION_SECRET || 'dev-insecure-fallback-secret-do-not-use-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // Not marked `secure: true` — this app is assumed to run on localhost/an
    // internal network without TLS in front of it. If it's ever put behind
    // HTTPS, flip this to true and call app.set('trust proxy', 1).
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  return res.redirect('/login');
}

// Auth: serve the login page (must stay reachable without a session)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Auth: verify credentials and start a session
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find(u => u.username === username);

  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  req.session.user = { username: user.username };
  res.json({ success: true });
});

// Auth: destroy the session
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.use(requireAuth);
app.use(express.static(path.join(__dirname, 'public')));

// In-memory cache for recent scrape results
let latestScrapeSession = null;

// API: Get categories
app.get('/api/categories', (req, res) => {
  res.json({
    success: true,
    categories
  });
});

// API: Run Scrape (standard JSON)
app.post('/api/scrape', async (req, res) => {
  try {
    const { categoryId, timeRange, platforms, weights } = req.body;
    const result = await runViralAgent({
      categoryId: categoryId || 'tech-ai',
      timeRange: timeRange || '7d',
      platforms: platforms && platforms.length ? platforms : ['youtube_shorts', 'tiktok', 'instagram_reels'],
      weights: weights || {}
    });

    latestScrapeSession = result;
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal scraping error'
    });
  }
});

// API: Real-time SSE Agent execution stream
app.get('/api/scrape-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const categoryId = req.query.category || 'tech-ai';
  const timeRange = req.query.timeRange || '7d';
  const platforms = req.query.platforms ? req.query.platforms.split(',') : ['youtube_shorts', 'tiktok', 'instagram_reels'];

  let weights = {};
  if (req.query.weights) {
    try {
      weights = JSON.parse(req.query.weights);
    } catch (e) {}
  }

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runViralAgent({
      categoryId,
      timeRange,
      platforms,
      weights,
      onProgress: (prog) => {
        sendEvent('progress', prog);
      }
    });

    latestScrapeSession = result;
    sendEvent('complete', result);
    res.end();
  } catch (error) {
    sendEvent('error', { message: error.message });
    res.end();
  }
});

// API: Export results as CSV or JSON
app.get('/api/export', (req, res) => {
  if (!latestScrapeSession || !latestScrapeSession.clips || latestScrapeSession.clips.length === 0) {
    return res.status(400).json({ success: false, message: 'No recent scrape session available. Run an agent scrape first.' });
  }

  const format = req.query.format || 'json';
  const { clips, category, timeRange } = latestScrapeSession;

  if (format === 'csv') {
    const headers = ['Rank', 'Platform', 'Title', 'Creator', 'Creator Handle', 'Velocity Score', 'Viral Tier', 'Views', 'Views/Hour', 'Likes', 'Comments', 'Shares', 'Engagement Rate %', 'Duration Sec', 'Upload Time', 'Hook Type', 'Audio Trend', 'URL'];
    const rows = clips.map(c => [
      c.rank,
      `"${c.platformName}"`,
      `"${(c.title || '').replace(/"/g, '""')}"`,
      `"${(c.creator || '').replace(/"/g, '""')}"`,
      `"${c.creatorHandle}"`,
      c.velocityScore,
      `"${c.viralTier}"`,
      c.views,
      c.viewsPerHour,
      c.likes,
      c.comments,
      c.shares,
      c.engagementRate,
      c.durationSeconds,
      `"${c.uploadTimeAgo}"`,
      `"${c.hook.hookType}"`,
      `"${c.hook.audioTrend}"`,
      `"${c.url}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="viral_clips_${category.id}_${timeRange}.csv"`);
    return res.send(csvContent);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="viral_clips_${category.id}_${timeRange}.json"`);
  res.json(latestScrapeSession);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Viral Clips Agent server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
