jest.mock('../users', () => ([
  { username: 'testuser', passwordHash: require('bcryptjs').hashSync('testpass', 10) }
]));

const mockRunViralAgent = jest.fn();
jest.mock('../scraperEngine', () => ({
  runViralAgent: (...args) => mockRunViralAgent(...args),
  calculateVirality: jest.fn()
}));

const request = require('supertest');
const app = require('../server');

const fakeResult = {
  category: { id: 'tech-ai', name: 'Tech & AI' },
  timeRange: '7d',
  timeWindowHours: 168,
  platforms: ['tiktok'],
  totalClips: 1,
  clips: [
    {
      rank: 1,
      platform: 'tiktok',
      platformName: 'TikTok',
      title: 'A "quoted" viral title',
      creator: 'Someone',
      creatorHandle: '@someone',
      velocityScore: 88.5,
      viralTier: '🚀 Trending Fast',
      views: 100000,
      viewsPerHour: 5000,
      likes: 8000,
      comments: 900,
      shares: 1200,
      engagementRate: 10.1,
      durationSeconds: 30,
      uploadTimeAgo: '2 hours ago',
      hook: { hookType: 'Curiosity Gap', audioTrend: 'Synthwave Nostalgia Hook #9' },
      url: 'https://example.com/clip'
    }
  ],
  timestamp: new Date().toISOString()
};

describe('authentication', () => {
  test('GET /login serves the login page without a session', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  test('protected pages redirect to /login when unauthenticated', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('protected API routes return 401 JSON when unauthenticated', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Not authenticated' });
  });

  test('POST /api/login rejects an unknown username', async () => {
    const res = await request(app).post('/api/login').send({ username: 'nope', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/login rejects a wrong password', async () => {
    const res = await request(app).post('/api/login').send({ username: 'testuser', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/login rejects a missing body gracefully', async () => {
    const res = await request(app).post('/api/login').send();
    expect(res.status).toBe(401);
  });

  test('POST /api/login accepts correct credentials and starts a session', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/login').send({ username: 'testuser', password: 'testpass' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const categoriesRes = await agent.get('/api/categories');
    expect(categoriesRes.status).toBe(200);
  });

  test('POST /api/logout destroys the session so protected routes 401 again', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username: 'testuser', password: 'testpass' });
    await agent.get('/api/categories').expect(200);

    const logoutRes = await agent.post('/api/logout');
    expect(logoutRes.body).toEqual({ success: true });

    const afterLogout = await agent.get('/api/categories');
    expect(afterLogout.status).toBe(401);
  });
});

describe('authenticated API routes', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent.post('/api/login').send({ username: 'testuser', password: 'testpass' });
  });

  beforeEach(() => {
    mockRunViralAgent.mockReset();
  });

  test('GET /api/categories returns the static category list', async () => {
    const categories = require('../categories');
    const res = await agent.get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.categories).toHaveLength(categories.length);
  });

  test('GET /api/export with no prior scrape returns 400', async () => {
    const res = await agent.get('/api/export');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/scrape runs the agent and returns its result', async () => {
    mockRunViralAgent.mockResolvedValueOnce(fakeResult);

    const res = await agent.post('/api/scrape').send({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['tiktok'],
      weights: {}
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: fakeResult });
    expect(mockRunViralAgent).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'tech-ai', timeRange: '7d', platforms: ['tiktok'] })
    );
  });

  test('POST /api/scrape applies defaults when fields are omitted', async () => {
    mockRunViralAgent.mockResolvedValueOnce(fakeResult);

    const res = await agent.post('/api/scrape').send({});

    expect(res.status).toBe(200);
    expect(mockRunViralAgent).toHaveBeenCalledWith({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['youtube_shorts', 'tiktok', 'instagram_reels'],
      weights: {}
    });
  });

  test('POST /api/scrape returns 500 when the agent throws', async () => {
    mockRunViralAgent.mockRejectedValueOnce(new Error('boom'));

    const res = await agent.post('/api/scrape').send({});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'boom' });
  });

  test('GET /api/export?format=json returns the last scrape session as JSON', async () => {
    mockRunViralAgent.mockResolvedValueOnce(fakeResult);
    await agent.post('/api/scrape').send({});

    const res = await agent.get('/api/export?format=json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.headers['content-disposition']).toContain('viral_clips_tech-ai_7d.json');
    expect(res.body).toEqual(fakeResult);
  });

  test('GET /api/export?format=csv returns escaped CSV content', async () => {
    mockRunViralAgent.mockResolvedValueOnce(fakeResult);
    await agent.post('/api/scrape').send({});

    const res = await agent.get('/api/export?format=csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('viral_clips_tech-ai_7d.csv');
    expect(res.text).toContain('Rank,Platform,Title');
    expect(res.text).toContain('A ""quoted"" viral title');
  });

  test('GET /api/scrape-stream streams progress and a final complete event', async () => {
    mockRunViralAgent.mockImplementationOnce(async ({ onProgress }) => {
      onProgress({ message: 'working', percent: 50, timestamp: new Date().toISOString() });
      return fakeResult;
    });

    const res = await agent.get('/api/scrape-stream').query({ category: 'tech-ai', timeRange: '7d' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('event: progress');
    expect(res.text).toContain('event: complete');
  });

  test('GET /api/scrape-stream parses platforms and weights from the query string', async () => {
    mockRunViralAgent.mockResolvedValueOnce(fakeResult);

    await agent.get('/api/scrape-stream').query({
      category: 'gaming',
      platforms: 'tiktok,instagram_reels',
      weights: JSON.stringify({ viewVelocity: 2 })
    });

    expect(mockRunViralAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 'gaming',
        platforms: ['tiktok', 'instagram_reels'],
        weights: { viewVelocity: 2 }
      })
    );
  });

  test('GET /api/scrape-stream ignores malformed weights JSON', async () => {
    mockRunViralAgent.mockResolvedValueOnce(fakeResult);

    await agent.get('/api/scrape-stream').query({ weights: '{not-json' });

    expect(mockRunViralAgent).toHaveBeenCalledWith(expect.objectContaining({ weights: {} }));
  });

  test('GET /api/scrape-stream emits an error event when the agent rejects', async () => {
    mockRunViralAgent.mockRejectedValueOnce(new Error('stream boom'));

    const res = await agent.get('/api/scrape-stream');

    expect(res.text).toContain('event: error');
    expect(res.text).toContain('stream boom');
  });
});
