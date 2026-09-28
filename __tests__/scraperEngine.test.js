jest.mock('child_process', () => ({
  execFile: jest.fn()
}));

const { execFile } = require('child_process');
const { runViralAgent, calculateVirality, generateHookIntelligence } = require('../scraperEngine');

function mockYtDlpError() {
  execFile.mockImplementation((path, args, opts, cb) => cb(new Error('yt-dlp not found'), '', ''));
}

function mockYtDlpStdout(stdout) {
  execFile.mockImplementation((path, args, opts, cb) => cb(null, stdout, ''));
}

beforeEach(() => {
  execFile.mockReset();
});

describe('calculateVirality', () => {
  test('returns the expected shape', () => {
    const result = calculateVirality(100000, 10, 5000, 1000, 2000);
    expect(result).toEqual(
      expect.objectContaining({
        velocityScore: expect.any(Number),
        viewsPerHour: expect.any(Number),
        engagementRate: expect.any(Number),
        viralTier: expect.any(String),
        tierBadge: expect.any(String)
      })
    );
  });

  test('computes viewsPerHour and engagementRate from raw inputs', () => {
    const result = calculateVirality(120000, 24, 6000, 1200, 2400);
    expect(result.viewsPerHour).toBe(Math.round(120000 / 24));
    expect(result.engagementRate).toBeCloseTo(((6000 + 1200 + 2400) / 120000) * 100, 5);
  });

  test('floors hoursAgo at 0.5 to avoid division blowups', () => {
    const veryRecent = calculateVirality(10000, 0, 500, 100, 200);
    const halfHour = calculateVirality(10000, 0.5, 500, 100, 200);
    expect(veryRecent).toEqual(halfHour);
  });

  test('treats missing weights and empty weights object the same', () => {
    const withDefault = calculateVirality(50000, 12, 2000, 400, 800);
    const withEmpty = calculateVirality(50000, 12, 2000, 400, 800, {});
    expect(withDefault).toEqual(withEmpty);
  });

  test('clamps low-engagement old clips to the 45 floor and "Gaining Momentum" tier', () => {
    const result = calculateVirality(100, 720, 1, 0, 0);
    expect(result.velocityScore).toBe(45);
    expect(result.viralTier).toBe('📈 Gaining Momentum');
    expect(result.tierBadge).toBe('tier-momentum');
  });

  test('assigns "Gaining Momentum" for a moderate, non-clamped score', () => {
    const result = calculateVirality(50000, 150, 1500, 300, 600);
    expect(result.velocityScore).toBeGreaterThanOrEqual(45);
    expect(result.velocityScore).toBeLessThan(65);
    expect(result.viralTier).toBe('📈 Gaining Momentum');
    expect(result.tierBadge).toBe('tier-momentum');
  });

  test('assigns "Rising Star" in the 65-79.9 range', () => {
    const result = calculateVirality(80000, 100, 3000, 500, 1200);
    expect(result.velocityScore).toBeGreaterThanOrEqual(65);
    expect(result.velocityScore).toBeLessThan(80);
    expect(result.viralTier).toBe('⚡ Rising Star');
    expect(result.tierBadge).toBe('tier-rising');
  });

  test('assigns "Trending Fast" in the 80-91.9 range', () => {
    const result = calculateVirality(200000, 96, 8000, 1500, 3000);
    expect(result.velocityScore).toBeGreaterThanOrEqual(80);
    expect(result.velocityScore).toBeLessThan(92);
    expect(result.viralTier).toBe('🚀 Trending Fast');
    expect(result.tierBadge).toBe('tier-trending');
  });

  test('clamps very high engagement to the 99.8 ceiling and "Supernova Viral" tier', () => {
    const result = calculateVirality(50000000, 1, 3000000, 800000, 1000000);
    expect(result.velocityScore).toBe(99.8);
    expect(result.viralTier).toBe('🔥 Supernova Viral');
    expect(result.tierBadge).toBe('tier-supernova');
  });

  test('higher viewVelocity weight increases the score relative to the default', () => {
    const base = calculateVirality(50000, 150, 1500, 300, 600);
    const boosted = calculateVirality(50000, 150, 1500, 300, 600, { viewVelocity: 3 });
    expect(boosted.velocityScore).toBeGreaterThan(base.velocityScore);
  });

  test('zeroing out engagement weights removes their contribution', () => {
    const withEngagement = calculateVirality(50000, 150, 1500, 300, 600);
    const withoutEngagement = calculateVirality(50000, 150, 1500, 300, 600, {
      likeRatio: 0,
      commentRatio: 0,
      shareRatio: 0
    });
    expect(withoutEngagement.velocityScore).toBeLessThan(withEngagement.velocityScore);
  });
});

describe('generateHookIntelligence', () => {
  const KNOWN_HOOK_TYPES = [
    'Pattern Interrupt',
    'Curiosity Gap',
    'High Stakes Warning',
    'Relatable Inversion',
    'Sensory ASMR / Satisfying'
  ];

  test('returns the expected shape', () => {
    const hook = generateHookIntelligence('Some viral title', 'Tech & AI', 'youtube');
    expect(hook).toEqual({
      hookType: expect.any(String),
      hookDescription: expect.any(String),
      retentionDriver: expect.any(String),
      psychologicalTrigger: expect.any(String),
      audioTrend: expect.any(String),
      creatorBlueprint: expect.any(String)
    });
    expect(KNOWN_HOOK_TYPES).toContain(hook.hookType);
  });

  test('is deterministic for the same title', () => {
    const first = generateHookIntelligence('The exact same title', 'Gaming', 'tiktok');
    const second = generateHookIntelligence('The exact same title', 'Gaming', 'tiktok');
    expect(second).toEqual(first);
  });

  test('embeds a truncated version of the title in the creator blueprint', () => {
    const title = 'A very long viral title that definitely exceeds thirty characters';
    const hook = generateHookIntelligence(title, 'Comedy', 'instagram');
    expect(hook.creatorBlueprint).toContain(title.slice(0, 30));
  });
});

describe('runViralAgent', () => {
  test('falls back to generated clips when yt-dlp errors out', async () => {
    mockYtDlpError();

    const result = await runViralAgent({ categoryId: 'tech-ai', platforms: ['youtube_shorts'] });

    expect(result.clips).toHaveLength(4);
    result.clips.forEach((clip) => {
      expect(clip.platform).toBe('youtube_shorts');
      expect(clip.id).toMatch(/^yt_/);
    });
  });

  test('parses valid yt-dlp output and filters out bad entries', async () => {
    const lines = [
      JSON.stringify({
        id: 'abc123',
        title: 'Real clip one',
        duration: 30,
        view_count: 500000,
        uploader: 'RealUploader',
        uploader_id: 'realuploader'
      }),
      JSON.stringify({ id: 'toolong', title: 'Too long, should be filtered', duration: 200 }),
      'not-json-at-all',
      JSON.stringify({ title: 'missing id field' })
    ].join('\n');
    mockYtDlpStdout(lines);

    const result = await runViralAgent({ categoryId: 'tech-ai', platforms: ['youtube_shorts'] });

    expect(result.clips).toHaveLength(1);
    const clip = result.clips[0];
    expect(clip.id).toBe('yt_abc123');
    expect(clip.title).toBe('Real clip one');
    expect(clip.creator).toBe('RealUploader');
    expect(clip.creatorHandle).toBe('@realuploader');
    expect(clip.url).toContain('abc123');
  });

  test('falls back to generated clips when yt-dlp output has no usable entries', async () => {
    mockYtDlpStdout(JSON.stringify({ title: 'no id here' }));

    const result = await runViralAgent({ categoryId: 'tech-ai', platforms: ['youtube_shorts'] });

    expect(result.clips).toHaveLength(4);
    expect(result.clips[0].id).toMatch(/^yt_/);
  });

  test('uses the category-specific TikTok dataset when one exists', async () => {
    const result = await runViralAgent({ categoryId: 'gaming', platforms: ['tiktok'] });

    expect(result.clips).toHaveLength(3);
    result.clips.forEach((clip) => expect(clip.platform).toBe('tiktok'));
  });

  test('falls back to the generic TikTok pool for categories without a dataset', async () => {
    const result = await runViralAgent({ categoryId: 'food-cooking', platforms: ['tiktok'] });

    expect(result.clips).toHaveLength(2);
    expect(result.clips[0].title).toContain('Food & Recipes');
  });

  test('uses the category-specific Instagram Reels dataset when one exists', async () => {
    const result = await runViralAgent({ categoryId: 'fitness', platforms: ['instagram_reels'] });

    expect(result.clips).toHaveLength(2);
    result.clips.forEach((clip) => expect(clip.platform).toBe('instagram_reels'));
  });

  test('falls back to the generic Instagram Reels pool for categories without a dataset', async () => {
    const result = await runViralAgent({ categoryId: 'comedy', platforms: ['instagram_reels'] });

    expect(result.clips).toHaveLength(2);
    expect(result.clips[0].title).toContain('Comedy & Memes');
  });

  test('falls back to the first category when categoryId is unrecognized', async () => {
    const result = await runViralAgent({ categoryId: 'not-a-real-category', platforms: [] });
    expect(result.category.id).toBe('tech-ai');
  });

  test.each([
    ['24h', 24],
    ['3d', 72],
    ['7d', 168],
    ['30d', 720],
    [500, 500],
    ['unrecognized', 168]
  ])('converts timeRange %p into %p hours', async (timeRange, expectedHours) => {
    const result = await runViralAgent({ categoryId: 'tech-ai', timeRange, platforms: [] });
    expect(result.timeWindowHours).toBe(expectedHours);
    expect(result.clips).toEqual([]);
    expect(result.totalClips).toBe(0);
  });

  test('merges clips from every requested platform, ranks them, and rescoes with caller weights', async () => {
    mockYtDlpError();

    const weights = { viewVelocity: 2, likeRatio: 0.5, commentRatio: 0.5, shareRatio: 0.5 };
    const result = await runViralAgent({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['youtube_shorts', 'tiktok', 'instagram_reels'],
      weights
    });

    expect(result.totalClips).toBe(result.clips.length);
    expect(result.totalClips).toBeGreaterThan(0);

    const platformsSeen = new Set(result.clips.map((c) => c.platform));
    expect(platformsSeen).toEqual(new Set(['youtube_shorts', 'tiktok', 'instagram_reels']));

    for (let i = 1; i < result.clips.length; i++) {
      expect(result.clips[i - 1].velocityScore).toBeGreaterThanOrEqual(result.clips[i].velocityScore);
    }

    result.clips.forEach((clip, index) => {
      expect(clip.rank).toBe(index + 1);
      const expected = calculateVirality(clip.views, clip.hoursAgo, clip.likes, clip.comments, clip.shares, weights);
      expect(clip.velocityScore).toBe(expected.velocityScore);
      expect(clip.viralTier).toBe(expected.viralTier);
    });
  });

  test('invokes onProgress with incremental status updates up to 100%', async () => {
    mockYtDlpError();
    const updates = [];

    await runViralAgent({
      categoryId: 'tech-ai',
      platforms: ['youtube_shorts'],
      onProgress: (update) => updates.push(update)
    });

    expect(updates.length).toBeGreaterThan(0);
    expect(updates[updates.length - 1].percent).toBe(100);
    updates.forEach((update) => {
      expect(typeof update.message).toBe('string');
      expect(typeof update.timestamp).toBe('string');
    });
  });
});
