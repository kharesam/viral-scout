jest.mock('child_process');
const { execFile } = require('child_process');

const {
  runViralAgent,
  calculateVirality,
  generateHookIntelligence
} = require('../scraperEngine');

describe('calculateVirality', () => {
  it('returns a score clamped between 45.0 and 99.8', () => {
    const low = calculateVirality(1, 1000, 0, 0, 0);
    expect(low.velocityScore).toBeGreaterThanOrEqual(45.0);

    const high = calculateVirality(50_000_000, 1, 10_000_000, 5_000_000, 5_000_000);
    expect(high.velocityScore).toBeLessThanOrEqual(99.8);
  });

  it('computes viewsPerHour using an hours-ago floor of 0.5', () => {
    const result = calculateVirality(1000, 0, 100, 10, 5);
    expect(result.viewsPerHour).toBe(Math.round(1000 / 0.5));
  });

  it('computes engagementRate as a percentage of views', () => {
    const result = calculateVirality(1000, 10, 100, 20, 30);
    expect(result.engagementRate).toBeCloseTo(((100 + 20 + 30) / 1000) * 100, 5);
  });

  it('assigns viral tiers according to score thresholds', () => {
    expect(calculateVirality(100, 1000, 0, 0, 0).velocityScore).toBeLessThan(65);
    expect(calculateVirality(100, 1000, 0, 0, 0).viralTier).toBe('📈 Gaining Momentum');

    const supernova = calculateVirality(10_000_000, 1, 2_000_000, 1_000_000, 1_000_000);
    expect(supernova.velocityScore).toBeGreaterThanOrEqual(92);
    expect(supernova.viralTier).toBe('🔥 Supernova Viral');
  });

  it('increases the score when engagement weights increase, all else equal', () => {
    const base = calculateVirality(100_000, 24, 5000, 500, 1000, {
      viewVelocity: 1, likeRatio: 1, commentRatio: 1, shareRatio: 1
    });
    const boosted = calculateVirality(100_000, 24, 5000, 500, 1000, {
      viewVelocity: 1, likeRatio: 5, commentRatio: 5, shareRatio: 5
    });
    expect(boosted.velocityScore).toBeGreaterThanOrEqual(base.velocityScore);
  });

  it('defaults missing weights rather than throwing', () => {
    expect(() => calculateVirality(1000, 5, 10, 1, 1)).not.toThrow();
  });
});

describe('generateHookIntelligence', () => {
  it('is deterministic for the same title', () => {
    const a = generateHookIntelligence('Some Viral Title', 'Tech & AI', 'youtube');
    const b = generateHookIntelligence('Some Viral Title', 'Tech & AI', 'youtube');
    expect(a).toEqual(b);
  });

  it('returns a hook type from the known list', () => {
    const known = [
      'Pattern Interrupt',
      'Curiosity Gap',
      'High Stakes Warning',
      'Relatable Inversion',
      'Sensory ASMR / Satisfying'
    ];
    const result = generateHookIntelligence('Another Title', 'Gaming', 'tiktok');
    expect(known).toContain(result.hookType);
  });

  it('returns the full expected shape', () => {
    const result = generateHookIntelligence('Title Here', 'Comedy', 'instagram');
    expect(result).toEqual(expect.objectContaining({
      hookType: expect.any(String),
      hookDescription: expect.any(String),
      retentionDriver: expect.any(String),
      psychologicalTrigger: expect.any(String),
      audioTrend: expect.any(String),
      creatorBlueprint: expect.any(String)
    }));
  });

  it('truncates the title to 30 chars in the creator blueprint', () => {
    const longTitle = 'A'.repeat(50);
    const result = generateHookIntelligence(longTitle, 'Comedy', 'tiktok');
    expect(result.creatorBlueprint).toContain('A'.repeat(30) + '...');
  });

  it('handles an empty title without throwing', () => {
    expect(() => generateHookIntelligence('', 'Comedy', 'tiktok')).not.toThrow();
  });
});

describe('runViralAgent', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('falls back to generated YouTube clips when yt-dlp fails', async () => {
    execFile.mockImplementation((_bin, _args, _opts, cb) => {
      cb(new Error('yt-dlp not found'));
    });

    const result = await runViralAgent({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['youtube_shorts']
    });

    expect(result.clips.length).toBeGreaterThan(0);
    expect(result.clips.every(c => c.platform === 'youtube_shorts')).toBe(true);
  });

  it('parses successful yt-dlp --dump-json output', async () => {
    const ytdlpLine = JSON.stringify({
      id: 'abc123',
      title: 'A real scraped short',
      uploader: 'Real Channel',
      uploader_id: 'realchannel',
      view_count: 500000,
      duration: 40
    });

    execFile.mockImplementation((_bin, _args, _opts, cb) => {
      cb(null, ytdlpLine + '\n', '');
    });

    const result = await runViralAgent({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['youtube_shorts']
    });

    expect(result.clips.length).toBe(1);
    expect(result.clips[0].title).toBe('A real scraped short');
    expect(result.clips[0].creatorHandle).toBe('@realchannel');
    expect(result.clips[0].url).toBe('https://www.youtube.com/shorts/abc123');
  });

  it('falls back when yt-dlp succeeds but returns no usable lines', async () => {
    execFile.mockImplementation((_bin, _args, _opts, cb) => {
      cb(null, '', '');
    });

    const result = await runViralAgent({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['youtube_shorts']
    });

    expect(result.clips.length).toBeGreaterThan(0);
  });

  it('only fetches requested platforms', async () => {
    const result = await runViralAgent({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['tiktok']
    });

    expect(execFile).not.toHaveBeenCalled();
    expect(result.clips.every(c => c.platform === 'tiktok')).toBe(true);
    expect(result.platforms).toEqual(['tiktok']);
  });

  it('falls back to the first category when categoryId is unknown', async () => {
    const categories = require('../categories');
    const result = await runViralAgent({
      categoryId: 'does-not-exist',
      timeRange: '7d',
      platforms: ['tiktok']
    });

    expect(result.category).toEqual(categories[0]);
  });

  it('maps timeRange strings to the correct hour windows', async () => {
    const cases = { '24h': 24, '3d': 72, '7d': 168, '30d': 720 };
    for (const [timeRange, hours] of Object.entries(cases)) {
      const result = await runViralAgent({
        categoryId: 'tech-ai',
        timeRange,
        platforms: ['tiktok']
      });
      expect(result.timeWindowHours).toBe(hours);
    }
  });

  it('ranks clips in descending order of velocityScore and assigns sequential ranks', async () => {
    const result = await runViralAgent({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['tiktok', 'instagram_reels']
    });

    for (let i = 1; i < result.clips.length; i++) {
      expect(result.clips[i - 1].velocityScore).toBeGreaterThanOrEqual(result.clips[i].velocityScore);
    }
    result.clips.forEach((clip, idx) => {
      expect(clip.rank).toBe(idx + 1);
    });
  });

  it('reports totalClips consistent with clips length', async () => {
    const result = await runViralAgent({
      categoryId: 'gaming',
      timeRange: '24h',
      platforms: ['tiktok', 'instagram_reels']
    });
    expect(result.totalClips).toBe(result.clips.length);
  });

  it('invokes onProgress callback with increasing percent values', async () => {
    const progressEvents = [];
    await runViralAgent({
      categoryId: 'tech-ai',
      timeRange: '7d',
      platforms: ['tiktok'],
      onProgress: (evt) => progressEvents.push(evt)
    });

    expect(progressEvents.length).toBeGreaterThan(0);
    progressEvents.forEach(evt => {
      expect(typeof evt.message).toBe('string');
      expect(typeof evt.percent).toBe('number');
    });
    expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
  });

  it('applies caller-supplied weights to the final scores', async () => {
    const resultDefault = await runViralAgent({
      categoryId: 'finance-crypto',
      timeRange: '7d',
      platforms: ['tiktok']
    });
    const resultWeighted = await runViralAgent({
      categoryId: 'finance-crypto',
      timeRange: '7d',
      platforms: ['tiktok'],
      weights: { viewVelocity: 0.1, likeRatio: 0.1, commentRatio: 0.1, shareRatio: 0.1 }
    });

    // Lower weights should never produce a higher score than the default weights,
    // for the same underlying clip data (score is monotonic in the weights here).
    expect(resultWeighted.clips[0].velocityScore).toBeLessThanOrEqual(resultDefault.clips[0].velocityScore);
  });

  it('falls back to the generic TikTok/Reels pool for a valid category with no hardcoded dataset', async () => {
    // 'lifestyle-travel' is a real category but has no entry in the
    // per-category tiktok/reels datasets, so this exercises the generic pool.
    const result = await runViralAgent({
      categoryId: 'lifestyle-travel',
      timeRange: '7d',
      platforms: ['tiktok', 'instagram_reels']
    });
    expect(result.clips.length).toBeGreaterThan(0);
    result.clips.forEach(clip => {
      expect(clip.title).toContain('Travel & Luxury');
    });
  });
});
