const bcrypt = require('bcryptjs');

const TEST_USERNAME = 'testuser';
const TEST_PASSWORD = 'correct-horse-battery-staple';

jest.mock('../users', () => ([
  { username: 'testuser', passwordHash: require('bcryptjs').hashSync('correct-horse-battery-staple', 4) }
]));

const fakeScrapeResult = {
  category: { id: 'tech-ai', name: 'Tech & AI' },
  timeRange: '7d',
  timeWindowHours: 168,
  platforms: ['tiktok'],
  totalClips: 1,
  clips: [{
    id: 'tt_0',
    rank: 1,
    platform: 'tiktok',
    platformName: 'TikTok',
    title: 'A "quoted" viral title',
    creator: 'Some Creator',
    creatorHandle: '@somecreator',
    velocityScore: 88.5,
    viralTier: '🚀 Trending Fast',
    views: 1000000,
    viewsPerHour: 5000,
    likes: 50000,
    comments: 5000,
    shares: 2000,
    engagementRate: 5.7,
    durationSeconds: 30,
    uploadTimeAgo: '2 days ago',
    hook: { hookType: 'Curiosity Gap', audioTrend: 'Some Trend' },
    url: 'https://www.tiktok.com/@somecreator/video/123'
  }],
  timestamp: new Date().toISOString()
};

jest.mock('../scraperEngine', () => ({
  runViralAgent: jest.fn(),
  calculateVirality: jest.requireActual('../scraperEngine').calculateVirality
}));

const { runViralAgent } = require('../scraperEngine');
const request = require('supertest');
const app = require('../server');

describe('auth', () => {
  it('serves the login page without a session', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
  });

  it('rejects API requests without a session', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('redirects unauthenticated page requests to /login', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('rejects an unknown username', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'nobody', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: TEST_USERNAME, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a missing body without throwing', async () => {
    const res = await request(app).post('/api/login').send();
    expect(res.status).toBe(401);
  });

  it('logs in with correct credentials and sets a session cookie', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('grants access to protected routes after login, and revokes it after logout', async () => {
    const agent = request.agent(app);

    await agent
      .post('/api/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);

    await agent.get('/api/categories').expect(200);

    await agent.post('/api/logout').expect(200);

    await agent.get('/api/categories').expect(401);
  });
});

describe('GET /api/export with no prior scrape', () => {
  // Must run before any test that calls POST /api/scrape or /api/scrape-stream,
  // since latestScrapeSession is process-local shared state (see server.js).
  it('returns 400 before any scrape has run', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });

    const res = await agent.get('/api/export');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/categories', () => {
  it('returns the static category list once authenticated', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });

    const res = await agent.get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThan(0);
  });
});

describe('POST /api/scrape', () => {
  let agent;

  beforeEach(async () => {
    runViralAgent.mockReset();
    agent = request.agent(app);
    await agent.post('/api/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  });

  it('requires authentication', async () => {
    runViralAgent.mockResolvedValue(fakeScrapeResult);
    const res = await request(app).post('/api/scrape').send({});
    expect(res.status).toBe(401);
  });

  it('runs the agent with defaults when no body is given and returns its result', async () => {
    runViralAgent.mockResolvedValue(fakeScrapeResult);

    const res = await agent.post('/api/scrape').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(fakeScrapeResult);

    expect(runViralAgent).toHaveBeenCalledWith(expect.objectContaining({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['youtube_shorts', 'tiktok', 'instagram_reels'],
      weights: {}
    }));
  });

  it('passes through caller-supplied categoryId, timeRange, platforms, and weights', async () => {
    runViralAgent.mockResolvedValue(fakeScrapeResult);

    const body = {
      categoryId: 'gaming',
      timeRange: '24h',
      platforms: ['tiktok'],
      weights: { viewVelocity: 2 }
    };
    await agent.post('/api/scrape').send(body);

    expect(runViralAgent).toHaveBeenCalledWith(expect.objectContaining(body));
  });

  it('returns a 500 with the error message when the agent throws', async () => {
    runViralAgent.mockRejectedValue(new Error('boom'));

    const res = await agent.post('/api/scrape').send({});
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('boom');
  });
});

describe('GET /api/scrape-stream', () => {
  let agent;

  beforeEach(async () => {
    runViralAgent.mockReset();
    agent = request.agent(app);
    await agent.post('/api/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/scrape-stream');
    expect(res.status).toBe(401);
  });

  it('streams a complete event with the agent result', async () => {
    runViralAgent.mockImplementation(async ({ onProgress }) => {
      if (onProgress) onProgress({ message: 'working', percent: 50 });
      return fakeScrapeResult;
    });

    const res = await agent.get('/api/scrape-stream');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: progress');
    expect(res.text).toContain('event: complete');
    expect(res.text).toContain(JSON.stringify(fakeScrapeResult));
  });

  it('streams an error event when the agent throws', async () => {
    runViralAgent.mockRejectedValue(new Error('stream boom'));

    const res = await agent.get('/api/scrape-stream');
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('stream boom');
  });

  it('parses platforms and weights from query params', async () => {
    runViralAgent.mockResolvedValue(fakeScrapeResult);

    await agent
      .get('/api/scrape-stream')
      .query({ category: 'comedy', timeRange: '3d', platforms: 'tiktok,instagram_reels', weights: JSON.stringify({ likeRatio: 3 }) });

    expect(runViralAgent).toHaveBeenCalledWith(expect.objectContaining({
      categoryId: 'comedy',
      timeRange: '3d',
      platforms: ['tiktok', 'instagram_reels'],
      weights: { likeRatio: 3 }
    }));
  });

  it('ignores malformed weights JSON instead of failing', async () => {
    runViralAgent.mockResolvedValue(fakeScrapeResult);

    const res = await agent.get('/api/scrape-stream').query({ weights: '{not-json' });
    expect(res.status).toBe(200);
    expect(runViralAgent).toHaveBeenCalledWith(expect.objectContaining({ weights: {} }));
  });
});

describe('GET /api/export', () => {
  let agent;

  beforeEach(async () => {
    runViralAgent.mockReset();
    agent = request.agent(app);
    await agent.post('/api/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/export');
    expect(res.status).toBe(401);
  });

  it('returns JSON export after a successful scrape', async () => {
    runViralAgent.mockResolvedValue(fakeScrapeResult);
    await agent.post('/api/scrape').send({});

    const res = await agent.get('/api/export').query({ format: 'json' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual(fakeScrapeResult);
  });

  it('returns CSV export with escaped quotes in titles', async () => {
    runViralAgent.mockResolvedValue(fakeScrapeResult);
    await agent.post('/api/scrape').send({});

    const res = await agent.get('/api/export').query({ format: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('""quoted""');
    expect(res.text.split('\n')[0]).toContain('Rank,Platform,Title');
  });
});
