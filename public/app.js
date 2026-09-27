/**
 * ViralPulse Agent Frontend Controller
 */

// Application State
const state = {
  categories: [],
  selectedCategory: 'tech-ai',
  selectedTimeRange: '7d',
  selectedPlatforms: ['youtube_shorts', 'tiktok', 'instagram_reels'],
  weights: {
    viewVelocity: 1.0,
    likeRatio: 1.2,
    commentRatio: 1.5,
    shareRatio: 1.8
  },
  currentResults: null,
  activeFilter: 'all',
  currentView: 'grid',
  isScraping: false
};

// DOM Elements
const elements = {
  categoriesGrid: document.getElementById('categoriesGrid'),
  timeRangeContainer: document.getElementById('timeRangeContainer'),
  platformsContainer: document.getElementById('platformsContainer'),
  summaryCategory: document.getElementById('summaryCategory'),
  summaryTime: document.getElementById('summaryTime'),
  startScrapeBtn: document.getElementById('startScrapeBtn'),
  terminalSection: document.getElementById('terminalSection'),
  terminalLogs: document.getElementById('terminalLogs'),
  terminalProgressBar: document.getElementById('terminalProgressBar'),
  terminalPercent: document.getElementById('terminalPercent'),
  agentStatusBadge: document.getElementById('agentStatusBadge'),
  agentStatusText: document.getElementById('agentStatusText'),
  resultsSection: document.getElementById('resultsSection'),
  resultsSubtitle: document.getElementById('resultsSubtitle'),
  clipsGrid: document.getElementById('clipsGrid'),
  clipsTableContainer: document.getElementById('clipsTableContainer'),
  clipsTableBody: document.getElementById('clipsTableBody'),
  platformFilterPills: document.getElementById('platformFilterPills'),
  viewGridBtn: document.getElementById('viewGridBtn'),
  viewTableBtn: document.getElementById('viewTableBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  tuningToggleBtn: document.getElementById('tuningToggleBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  clipModal: document.getElementById('clipModal'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  // Stats
  statTotalClips: document.getElementById('statTotalClips'),
  statTopScore: document.getElementById('statTopScore'),
  statTopTier: document.getElementById('statTopTier'),
  statPeakVelocity: document.getElementById('statPeakVelocity'),
  statDominantHook: document.getElementById('statDominantHook'),
  // Tuning Sliders
  weightVelocity: document.getElementById('weightVelocity'),
  valVelocity: document.getElementById('valVelocity'),
  weightLikes: document.getElementById('weightLikes'),
  valLikes: document.getElementById('valLikes'),
  weightComments: document.getElementById('weightComments'),
  valComments: document.getElementById('valComments'),
  weightShares: document.getElementById('weightShares'),
  valShares: document.getElementById('valShares')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadCategories();
});

// Setup Events
function setupEventListeners() {
  // Time period pills
  elements.timeRangeContainer.addEventListener('click', (e) => {
    const pill = e.target.closest('.time-pill');
    if (!pill) return;
    document.querySelectorAll('.time-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.selectedTimeRange = pill.dataset.range;
    elements.summaryTime.textContent = pill.querySelector('.pill-title').textContent;
  });

  // Platforms Checkboxes
  elements.platformsContainer.addEventListener('change', (e) => {
    const chip = e.target.closest('.platform-chip');
    if (!chip) return;
    const checkbox = chip.querySelector('input[type="checkbox"]');
    if (checkbox.checked) {
      chip.classList.add('active');
      chip.querySelector('.chip-status').textContent = 'Active';
    } else {
      chip.classList.remove('active');
      chip.querySelector('.chip-status').textContent = 'Off';
    }

    const checked = Array.from(document.querySelectorAll('#platformsContainer input[type="checkbox"]:checked')).map(i => i.value);
    if (checked.length === 0) {
      // Prevent unchecking all
      checkbox.checked = true;
      chip.classList.add('active');
      chip.querySelector('.chip-status').textContent = 'Active';
      return;
    }
    state.selectedPlatforms = checked;
  });

  // Tuning Accordion
  elements.tuningToggleBtn.addEventListener('click', () => {
    elements.tuningToggleBtn.parentElement.classList.toggle('open');
  });

  // Tuning Sliders
  const setupSlider = (slider, display, key) => {
    slider.addEventListener('input', () => {
      display.textContent = `${slider.value}x`;
      state.weights[key] = parseFloat(slider.value);
    });
  };
  setupSlider(elements.weightVelocity, elements.valVelocity, 'viewVelocity');
  setupSlider(elements.weightLikes, elements.valLikes, 'likeRatio');
  setupSlider(elements.weightComments, elements.valComments, 'commentRatio');
  setupSlider(elements.weightShares, elements.valShares, 'shareRatio');

  // Start Scrape Button
  elements.startScrapeBtn.addEventListener('click', startViralScraping);

  // Platform Filter Pills in Results
  elements.platformFilterPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.activeFilter = pill.dataset.filter;
    renderClips();
  });

  // View switch (Grid vs Table)
  elements.viewGridBtn.addEventListener('click', () => {
    state.currentView = 'grid';
    elements.viewGridBtn.classList.add('active');
    elements.viewTableBtn.classList.remove('active');
    elements.clipsGrid.style.display = 'grid';
    elements.clipsTableContainer.style.display = 'none';
  });

  elements.viewTableBtn.addEventListener('click', () => {
    state.currentView = 'table';
    elements.viewTableBtn.classList.add('active');
    elements.viewGridBtn.classList.remove('active');
    elements.clipsGrid.style.display = 'none';
    elements.clipsTableContainer.style.display = 'block';
  });

  // Modal events
  elements.modalCloseBtn.addEventListener('click', closeModal);
  elements.clipModal.addEventListener('click', (e) => {
    if (e.target === elements.clipModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Export handlers
  elements.exportCsvBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = `/api/export?format=csv`;
  });
  elements.exportJsonBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = `/api/export?format=json`;
  });

  // Logout
  elements.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

// Fetch wrapper that redirects to /login on a 401 (unauthenticated) response
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = '/login';
    return null;
  }
  return res;
}

// Load Categories
async function loadCategories() {
  try {
    const res = await apiFetch('/api/categories');
    if (!res) return;
    const data = await res.json();
    if (data.success && data.categories) {
      state.categories = data.categories;
      renderCategories();
    }
  } catch (error) {
    console.error('Failed to load categories:', error);
    elements.categoriesGrid.innerHTML = `<div class="error-msg">Failed to load categories. Please check server.</div>`;
  }
}

// Render Categories Grid
function renderCategories() {
  elements.categoriesGrid.innerHTML = '';
  state.categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = `category-card ${cat.id === state.selectedCategory ? 'selected' : ''}`;
    card.dataset.categoryId = cat.id;

    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="card-icon">${cat.icon}</span>
          <div class="selection-indicator"></div>
        </div>
        <h3>${cat.name}</h3>
        <p>${cat.description}</p>
      </div>
      <div class="tag-list">
        ${cat.tags.slice(0, 3).map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedCategory = cat.id;
      elements.summaryCategory.textContent = cat.name;
    });

    elements.categoriesGrid.appendChild(card);
  });
}

// Start Autonomous Scraping with SSE
function startViralScraping() {
  if (state.isScraping) return;
  state.isScraping = true;

  // Update UI to running state
  elements.startScrapeBtn.disabled = true;
  elements.startScrapeBtn.innerHTML = `
    <span class="btn-icon">⏳</span>
    <span>Agent Scraping in Progress...</span>
  `;
  elements.agentStatusBadge.classList.add('busy');
  elements.agentStatusText.textContent = 'Agent Crawling Feeds';

  // Show Terminal
  elements.terminalSection.style.display = 'block';
  elements.terminalLogs.innerHTML = '';
  elements.terminalProgressBar.style.width = '5%';
  elements.terminalPercent.textContent = '5%';
  elements.terminalSection.scrollIntoView({ behavior: 'smooth' });

  // Connect SSE
  const queryParams = new URLSearchParams({
    category: state.selectedCategory,
    timeRange: state.selectedTimeRange,
    platforms: state.selectedPlatforms.join(','),
    weights: JSON.stringify(state.weights)
  });

  const eventSource = new EventSource(`/api/scrape-stream?${queryParams.toString()}`);

  eventSource.addEventListener('progress', (e) => {
    const data = JSON.parse(e.data);
    appendLog(data.message, data.percent);
  });

  eventSource.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    eventSource.close();
    onScrapeComplete(data);
  });

  eventSource.addEventListener('error', (e) => {
    eventSource.close();
    appendLog('[Error] Stream disconnected or error occurred. Retrying fallback...', 100);
    // Fallback to POST /api/scrape
    apiFetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: state.selectedCategory,
        timeRange: state.selectedTimeRange,
        platforms: state.selectedPlatforms,
        weights: state.weights
      })
    })
      .then(r => r ? r.json() : null)
      .then(res => {
        if (res && res.success) onScrapeComplete(res.data);
      })
      .catch(err => {
        appendLog(`[Fatal Error] Scraper failed: ${err.message}`, 100);
        resetScrapeButton();
      });
  });
}

function appendLog(message, percent = 0) {
  const line = document.createElement('div');
  line.className = 'log-line';
  if (percent >= 90) line.classList.add('highlight');
  line.textContent = message;
  elements.terminalLogs.appendChild(line);
  elements.terminalLogs.scrollTop = elements.terminalLogs.scrollHeight;

  if (percent > 0) {
    elements.terminalProgressBar.style.width = `${percent}%`;
    elements.terminalPercent.textContent = `${percent}%`;
  }
}

function onScrapeComplete(result) {
  state.currentResults = result;
  resetScrapeButton();
  elements.agentStatusBadge.classList.remove('busy');
  elements.agentStatusText.textContent = `Completed (${result.totalClips} Clips)`;

  // Show Results Section
  elements.resultsSection.style.display = 'block';
  elements.resultsSubtitle.textContent = `Discovered and scored ${result.totalClips} clips for ${result.category.name} in ${state.selectedTimeRange}.`;

  // Update Summary Metrics
  updateMetricsBanner(result);

  // Render Clips
  renderClips();

  // Scroll to results
  setTimeout(() => {
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
  }, 400);
}

function resetScrapeButton() {
  state.isScraping = false;
  elements.startScrapeBtn.disabled = false;
  elements.startScrapeBtn.innerHTML = `
    <span class="btn-icon">⚡</span>
    <span>Launch Viral Agent Scraper</span>
  `;
}

function updateMetricsBanner(result) {
  const clips = result.clips;
  elements.statTotalClips.textContent = clips.length;

  if (clips.length > 0) {
    const topClip = clips[0];
    elements.statTopScore.textContent = topClip.velocityScore.toFixed(1);
    elements.statTopTier.textContent = topClip.viralTier;

    const maxVelocity = Math.max(...clips.map(c => c.viewsPerHour));
    elements.statPeakVelocity.textContent = formatNumber(maxVelocity);

    // Find dominant hook
    const hookCounts = {};
    clips.forEach(c => {
      const h = c.hook?.hookType || 'Pattern Interrupt';
      hookCounts[h] = (hookCounts[h] || 0) + 1;
    });
    const dominant = Object.entries(hookCounts).sort((a, b) => b[1] - a[1])[0];
    elements.statDominantHook.textContent = dominant ? dominant[0] : 'Pattern Interrupt';
  }
}

// Render Clips in Active View & Filter
function renderClips() {
  if (!state.currentResults || !state.currentResults.clips) return;

  let filtered = state.currentResults.clips;
  if (state.activeFilter !== 'all') {
    filtered = filtered.filter(c => c.platform === state.activeFilter);
  }

  // Render Grid
  elements.clipsGrid.innerHTML = '';
  if (filtered.length === 0) {
    elements.clipsGrid.innerHTML = `<div class="empty-state">No clips found for this platform filter.</div>`;
  } else {
    filtered.forEach(clip => {
      elements.clipsGrid.appendChild(createClipCard(clip));
    });
  }

  // Render Table
  elements.clipsTableBody.innerHTML = '';
  filtered.forEach(clip => {
    elements.clipsTableBody.appendChild(createTableRow(clip));
  });
}

// Create Clip Card Element
function createClipCard(clip) {
  const card = document.createElement('div');
  card.className = 'clip-card';

  const rankClass = clip.rank === 1 ? 'rank-1' : clip.rank === 2 ? 'rank-2' : clip.rank === 3 ? 'rank-3' : '';

  card.innerHTML = `
    <div class="clip-thumb-container">
      <img src="${clip.thumbnail}" alt="${clip.title}" class="clip-thumb" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&fit=crop&q=80'">
      <div class="rank-badge ${rankClass}">#${clip.rank}</div>
      <div class="platform-badge badge-${clip.platform}">
        ${clip.platformIcon} ${clip.platformName}
      </div>
      <div class="duration-pill">${formatDuration(clip.durationSeconds)}</div>
      <div class="clip-play-overlay" data-clip-id="${clip.id}">
        <div class="play-circle">▶</div>
      </div>
    </div>

    <div class="clip-info">
      <div class="velocity-score-strip">
        <div class="score-tag">
          <span class="score-num">${clip.velocityScore.toFixed(1)}</span>
          <span class="score-label">Virality Index</span>
        </div>
        <span class="tier-badge ${clip.tierBadge}">${clip.viralTier}</span>
      </div>

      <h4 class="clip-title" title="${clip.title}">${clip.title}</h4>
      <div class="clip-creator">
        <span>By</span>
        <strong>${clip.creator}</strong>
        <span style="color:var(--text-subtle)">(${clip.creatorHandle})</span>
      </div>

      <div class="clip-stats-grid">
        <div class="stat-item">
          <span class="val">${formatNumber(clip.views)}</span>
          <span class="lbl">Views</span>
        </div>
        <div class="stat-item">
          <span class="val">${formatNumber(clip.viewsPerHour)}/h</span>
          <span class="lbl">Velocity</span>
        </div>
        <div class="stat-item">
          <span class="val">${formatNumber(clip.likes)}</span>
          <span class="lbl">Likes</span>
        </div>
      </div>

      <div class="hook-tag">
        <div class="hook-header">🪝 Hook: ${clip.hook.hookType}</div>
        <div class="hook-text">${clip.hook.psychologicalTrigger}</div>
      </div>

      <div class="card-actions">
        <button class="btn btn-secondary btn-sm preview-btn" data-clip-id="${clip.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
          Watch Preview
        </button>
        <button class="btn btn-primary btn-sm breakdown-btn" data-clip-id="${clip.id}">
          <span>AI Breakdown</span>
        </button>
      </div>
    </div>
  `;

  // Event handlers
  card.querySelector('.clip-play-overlay').addEventListener('click', () => openModal(clip));
  card.querySelector('.preview-btn').addEventListener('click', () => openModal(clip));
  card.querySelector('.breakdown-btn').addEventListener('click', () => openModal(clip));

  return card;
}

// Create Table Row Element
function createTableRow(clip) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><strong>#${clip.rank}</strong></td>
    <td><span class="platform-badge badge-${clip.platform}">${clip.platformIcon} ${clip.platformName}</span></td>
    <td style="max-width: 260px;">
      <div style="font-weight:700; color:#fff; margin-bottom: 0.2rem;">${clip.title}</div>
      <div style="font-size:0.75rem; color:var(--text-muted);">${clip.creator} • ${clip.uploadTimeAgo}</div>
    </td>
    <td>
      <div style="font-family:var(--font-heading); font-size:1.15rem; font-weight:800; color:var(--secondary);">${clip.velocityScore.toFixed(1)}</div>
      <span class="tier-badge ${clip.tierBadge}" style="font-size:0.65rem;">${clip.viralTier}</span>
    </td>
    <td>
      <div style="font-weight:700;">${formatNumber(clip.views)}</div>
      <div style="font-size:0.72rem; color:var(--accent-emerald); font-family:var(--font-mono);">${formatNumber(clip.viewsPerHour)}/hr</div>
    </td>
    <td>
      <div style="font-size:0.8rem;">❤️ ${formatNumber(clip.likes)}</div>
      <div style="font-size:0.72rem; color:var(--text-subtle);">💬 ${formatNumber(clip.comments)}</div>
    </td>
    <td>
      <span class="tag-pill" style="color:var(--primary); font-size:0.72rem;">${clip.hook.hookType}</span>
    </td>
    <td>
      <button class="btn btn-secondary btn-sm preview-table-btn" data-clip-id="${clip.id}">Inspect</button>
    </td>
  `;

  tr.querySelector('.preview-table-btn').addEventListener('click', () => openModal(clip));
  return tr;
}

// Modal Functions
function openModal(clip) {
  const playerWrapper = document.getElementById('playerWrapper');

  if (clip.platform === 'youtube_shorts' && clip.videoId) {
    playerWrapper.innerHTML = `
      <iframe 
        src="https://www.youtube.com/embed/${clip.videoId}?autoplay=1&rel=0&modestbranding=1" 
        title="${clip.title}" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen>
      </iframe>
    `;
  } else {
    // Simulated mobile vertical video frame with direct link
    playerWrapper.innerHTML = `
      <div class="player-simulated">
        <img src="${clip.thumbnail}" alt="${clip.title}" class="simulated-bg">
        <div class="simulated-content">
          <div style="font-size: 3rem; margin-bottom: 1rem;">${clip.platformIcon}</div>
          <h4 style="margin-bottom: 0.5rem; color:#fff;">${clip.platformName} Clip Preview</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">Due to platform cross-origin policies, open directly on ${clip.platformName} to view full audio stream.</p>
          <a href="${clip.url}" target="_blank" class="btn btn-primary btn-glow">
            Watch Original Video
          </a>
        </div>
      </div>
    `;
  }

  // Populate Meta
  document.getElementById('modalPlatformBadge').textContent = `${clip.platformIcon} ${clip.platformName}`;
  document.getElementById('modalTierBadge').textContent = clip.viralTier;
  document.getElementById('modalDuration').textContent = formatDuration(clip.durationSeconds);
  document.getElementById('modalTitle').textContent = clip.title;
  document.getElementById('modalCreator').textContent = clip.creator;
  document.getElementById('modalHandle').textContent = clip.creatorHandle;
  document.getElementById('modalTimeAgo').textContent = clip.uploadTimeAgo;

  document.getElementById('modalViews').textContent = formatNumber(clip.views);
  document.getElementById('modalViewsPerHour').textContent = `${formatNumber(clip.viewsPerHour)}/h`;
  document.getElementById('modalLikes').textContent = formatNumber(clip.likes);
  document.getElementById('modalComments').textContent = formatNumber(clip.comments);

  document.getElementById('modalHookType').textContent = `${clip.hook.hookType} — ${clip.hook.hookDescription}`;
  document.getElementById('modalRetention').textContent = clip.hook.retentionDriver;
  document.getElementById('modalTrigger').textContent = clip.hook.psychologicalTrigger;
  document.getElementById('modalAudio').textContent = clip.hook.audioTrend;
  document.getElementById('modalBlueprint').textContent = clip.hook.creatorBlueprint;

  const externalLink = document.getElementById('modalExternalLink');
  externalLink.href = clip.url;

  const copyBtn = document.getElementById('modalCopyBtn');
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(clip.url).then(() => {
      copyBtn.textContent = 'Copied to Clipboard!';
      setTimeout(() => { copyBtn.textContent = 'Copy Clip Link'; }, 2000);
    });
  };

  elements.clipModal.style.display = 'flex';
}

function closeModal() {
  elements.clipModal.style.display = 'none';
  document.getElementById('playerWrapper').innerHTML = '';
}

// Helpers
function formatNumber(num) {
  if (!num && num !== 0) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatDuration(sec) {
  if (!sec) return '0:30';
  const mins = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${mins}:${remSec < 10 ? '0' : ''}${remSec}`;
}
