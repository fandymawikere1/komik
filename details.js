document.addEventListener('DOMContentLoaded', () => {
    initDetails();
});

function handleGenreClick(genreName) {
    // Redirect to home with genre filter (simulated via query param)
    window.location.href = `index.html?genre=${encodeURIComponent(genreName)}`;
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
}

function timeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diffInMs = now - past;
    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInWeeks = Math.floor(diffInDays / 7);
    const diffInMonths = Math.floor(diffInDays / 30);
    const diffInYears = Math.floor(diffInDays / 365);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    if (diffInWeeks < 4) return `${diffInWeeks}w ago`;
    if (diffInMonths < 12) return `${diffInMonths}mo ago`;
    return `${diffInYears}y ago`;
}

let currentSlug = '';
const PROXY_URL = 'https://abahcode.com/proxy.php?url=';
const wrapProxy = (url) => url ? `${PROXY_URL}${encodeURIComponent(url)}` : url;
let currentSeries = null;
let allChapters = [];

async function initDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');
    
    if (!slug) {
        showError('No series selected. Please go back.');
        return;
    }
    
    currentSlug = slug;
    await fetchDetails();
}

async function fetchDetails() {
    const content = document.getElementById('details-content');
    const loading = document.getElementById('loading');
    
    try {
        // Use direct slug endpoint which works correctly
        const response = await fetch(`https://be.komikcast.cc/series/${currentSlug}`);
        const json = await response.json();
        
        if (json.status === 200 && json.data) {
            // According to confirmed structure: json.data is the wrapper, json.data.data is the content
            currentSeries = json.data.data;
            renderDetails(currentSeries);

            // Fetch chapters using the slug
            try {
                const chRes = await fetch(`https://be.komikcast.cc/series/${currentSlug}/chapters?take=1000`);
                const chJson = await chRes.json();
                if (chJson.status === 200 && chJson.data) {
                    allChapters = chJson.data;
                    renderChapters(allChapters);
                    updateReadingStatus();
                } else {
                    renderChapters([]);
                }
            } catch (ce) {
                console.error('Chapter fetch error:', ce);
                renderChapters([]);
            }
            
            loading.style.display = 'none';
            content.style.display = 'block';
        } else {
            showError('Failed to load series details. Series not found.');
        }
    } catch (e) {
        showError('Network error loading details.');
        console.error(e);
    }
}

function renderDetails(data) {
    document.title = `${data.title} - Komikcast`;
    
    // Fill cover
    const coverImg = document.getElementById('detail-cover');
    coverImg.src = wrapProxy(data.coverImage);
    
    document.getElementById('detail-title').textContent = data.title;
    document.getElementById('detail-native').textContent = data.nativeTitle || '';
    document.getElementById('detail-format').textContent = data.format;
    document.getElementById('detail-rating').textContent = `⭐ ${data.rating || 'N/A'}`;
    document.getElementById('detail-status').textContent = data.status;
    
    // Add view stats
    const metaContainer = document.querySelector('.detail-meta');
    // Clear old stats if any
    const oldStats = metaContainer.querySelectorAll('.view-stat');
    oldStats.forEach(s => s.remove());
    
    if (currentSeries.views) {
        const views = currentSeries.views;
        const statsHtml = `
            <span class="meta-badge views view-stat">👁️ ${formatNumber(views.total)} Total</span>
            <span class="meta-badge views-history view-stat">📜 ${formatNumber(views.history)} Hist</span>
            <span class="meta-badge views-analytics view-stat">📊 ${formatNumber(views.analytics)} Anal</span>
        `;
        metaContainer.insertAdjacentHTML('beforeend', statsHtml);
    }
    
    const genresContainer = document.getElementById('detail-genres');
    genresContainer.innerHTML = '';
    if (data.genres) {
        data.genres.forEach(g => {
            const span = document.createElement('span');
            span.className = 'genre-tag clickable';
            span.textContent = g.data.name;
            span.onclick = () => handleGenreClick(g.data.name);
            genresContainer.appendChild(span);
        });
    }
    
    document.getElementById('detail-synopsis').textContent = data.synopsis || 'No synopsis available.';
}

function renderChapters(chapters) {
    const list = document.getElementById('chapter-list');
    list.innerHTML = '';
    
    if (!chapters || chapters.length === 0) {
        list.innerHTML = '<div style="color:#94a3b8; padding: 20px;">No chapters found for this series.</div>';
        return;
    }
    
    // Sort chapters by index descending (latest first)
    const sorted = [...chapters].sort((a,b) => parseFloat(b.data.index) - parseFloat(a.data.index));
    
    // Check history for highlighting
    const history = JSON.parse(localStorage.getItem('reading_history') || '{}');
    const lastRead = history[currentSlug];

    sorted.forEach(ch => {
        const idx = ch.data.index;
        // Compare as numbers
        const isLastRead = lastRead && parseFloat(lastRead) === parseFloat(idx);
        
        const item = document.createElement('div');
        item.className = 'chapter-item' + (isLastRead ? ' last-read' : '');
        
        item.innerHTML = `
            <div class="ch-left">
                <span class="ch-name">Chapter ${idx}</span>
                <span class="ch-date">${timeAgo(ch.createdAt)}</span>
            </div>
            ${isLastRead ? '<span class="read-tag">Last Read</span>' : ''}
        `;
        
        item.onclick = () => {
            window.location.href = `reader.html?slug=${encodeURIComponent(currentSlug)}&title=${encodeURIComponent(currentSeries.title)}&chapter=${idx}&format=${encodeURIComponent(currentSeries.format)}`;
        };
        
        list.appendChild(item);
    });
}

function updateReadingStatus() {
    const history = JSON.parse(localStorage.getItem('reading_history') || '{}');
    const lastRead = history[currentSlug];
    const btn = document.getElementById('start-reading-btn');
    
    if (lastRead) {
        btn.textContent = `Continue: Chapter ${lastRead}`;
        btn.onclick = () => {
             window.location.href = `reader.html?slug=${encodeURIComponent(currentSlug)}&title=${encodeURIComponent(currentSeries.title)}&chapter=${lastRead}&format=${encodeURIComponent(currentSeries.format)}`;
        };
    } else if (allChapters.length > 0) {
        // Default to first chapter (lowest index)
        const sortedAsc = [...allChapters].sort((a,b) => parseFloat(a.data.index) - parseFloat(b.data.index));
        const first = sortedAsc[0];
        btn.textContent = `Start Reading: Chapter ${first.data.index}`;
        btn.onclick = () => {
             window.location.href = `reader.html?slug=${encodeURIComponent(currentSlug)}&title=${encodeURIComponent(currentSeries.title)}&chapter=${first.data.index}&format=${encodeURIComponent(currentSeries.format)}`;
        };
    }
}

function showError(msg) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.textContent = msg;
        loading.style.color = '#ef4444';
        loading.style.display = 'block';
    }
    const content = document.getElementById('details-content');
    if (content) content.style.display = 'none';
}
