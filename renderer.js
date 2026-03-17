let currentPage = 1;
let isLoading = false;
let currentType = 'latest'; // 'latest', 'search', 'genre', 'bookmark', 'format'
let currentQuery = '';
let currentGenre = '';
let currentFormat = '';
let allMangaData = []; // Store data objects to re-attach listeners on restore
const API_BASE = 'https://abahcode.com/api.php';

document.addEventListener('DOMContentLoaded', () => {
    fetchBanners();
    
    // Check if we should restore state (from Back button)
    const shouldRestore = sessionStorage.getItem('should_restore_state');
    if (shouldRestore === 'true') {
        restoreAppState();
        setupNavbar();
        setupInfiniteScroll();
        return;
    }

    // Check for URL parameters (genre or search redirection)
    const urlParams = new URLSearchParams(window.location.search);
    const genreParam = urlParams.get('genre');
    const searchParam = urlParams.get('search');
    
    if (genreParam) {
        currentGenre = genreParam;
        handleGenreSearch(genreParam);
    } else if (searchParam) {
        currentQuery = searchParam;
        handleSearch(searchParam);
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = searchParam;
    } else {
        fetchLatestReleases();
    }
    
    setupNavbar();
    setupInfiniteScroll();
    
    // Auto-sync if logged in
    if (localStorage.getItem('user_token')) {
        setInterval(syncDataToServer, 60000); // Every minute
        syncDataToServer(); // Initial sync
    }
});

async function syncDataToServer() {
    const token = localStorage.getItem('user_token');
    if (!token) return;
    
    let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '{}');
    let history = JSON.parse(localStorage.getItem('reading_history') || '{}');
    
    // Defensive check: ensure they are objects, not arrays
    if (Array.isArray(bookmarks)) bookmarks = {};
    if (Array.isArray(history)) history = {};
    
    try {
        const response = await fetch(`${API_BASE}?action=sync&token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookmarks, history })
        });
        const result = await response.json();
        console.log('Sync result:', result);
    } catch (e) {
        console.error('Sync failed', e);
    }
}

function saveAppState() {
    const state = {
        currentType,
        currentQuery,
        currentGenre,
        currentFormat,
        currentPage,
        allMangaData,
        scrollPos: window.scrollY,
        title: document.querySelector('.latest-section .section-title').textContent,
        bannerDisplay: document.querySelector('.banner-section').style.display,
        activeNavLinkId: document.querySelector('.nav-links a.active')?.id
    };
    sessionStorage.setItem('saved_app_state', JSON.stringify(state));
    sessionStorage.setItem('should_restore_state', 'true');
}

function restoreAppState() {
    const saved = sessionStorage.getItem('saved_app_state');
    if (!saved) return;
    
    const state = JSON.parse(saved);
    currentType = state.currentType;
    currentQuery = state.currentQuery;
    currentGenre = state.currentGenre;
    currentFormat = state.currentFormat;
    currentPage = state.currentPage;
    allMangaData = state.allMangaData || [];
    
    renderLatestReleases(allMangaData, false);
    
    document.querySelector('.latest-section .section-title').textContent = state.title;
    document.querySelector('.banner-section').style.display = state.bannerDisplay || 'block';
    
    // Restore active nav link
    document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    if (state.activeNavLinkId) {
        document.getElementById(state.activeNavLinkId)?.classList.add('active');
    }

    // Restore scroll position after a short delay to ensure DOM is ready
    setTimeout(() => {
        window.scrollTo(0, state.scrollPos);
        sessionStorage.removeItem('should_restore_state');
    }, 150);
}

function setupInfiniteScroll() {
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 800) {
            loadMore();
        }
    });
}

async function loadMore() {
    if (isLoading || currentType === 'bookmark') return;
    isLoading = true;
    currentPage++;
    
    console.log(`Loading more... Page ${currentPage} for type ${currentType}`);
    
    let url = '';
    if (currentType === 'latest') {
        url = `https://be.komikcast.cc/series?preset=rilisan_terbaru&take=20&takeChapter=3&page=${currentPage}`;
    } else if (currentType === 'search') {
        url = `https://be.komikcast.cc/series?filter=title=like=%22${encodeURIComponent(currentQuery)}%22,nativeTitle=like=%22${encodeURIComponent(currentQuery)}%22&takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=${currentPage}`;
    } else if (currentType === 'genre') {
        url = `https://be.komikcast.cc/series?genreIds=${encodeURIComponent(currentGenre)}&takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=${currentPage}`;
    } else if (currentType === 'format') {
        url = `https://be.komikcast.cc/series?format=${encodeURIComponent(currentFormat)}&takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=${currentPage}`;
    }

    try {
        const response = await fetch(url, API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data && json.data.length > 0) {
            renderLatestReleases(json.data, true); // true means append
        } else {
            console.log("No more results.");
        }
    } catch (e) {
        console.error('Error loading more:', e);
    } finally {
        isLoading = false;
    }
}

const BANNER_API = 'https://be.komikcast.cc/series?preset=banner&includeMeta=true';
const LATEST_API = 'https://be.komikcast.cc/series?preset=rilisan_terbaru&take=20&takeChapter=3&page=1';

// Proxy Helper
const PROXY_URL = 'https://abahcode.com/proxy.php?url=';
const wrapProxy = (url) => url ? `${PROXY_URL}${encodeURIComponent(url)}` : url;

// Mobile API options (CORS)
const API_OPTIONS = {
    // No specific options needed when proxied through abahcode
};

async function fetchLatestReleases() {
    currentType = 'latest';
    currentPage = 1;
    try {
        const response = await fetch(LATEST_API, API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            allLatest = json.data;
            renderLatestReleases(allLatest, false);
        }
    } catch (e) {
        console.error('Error fetching latest:', e);
    }
}

async function handleSearch(query) {
    currentType = 'search';
    currentQuery = query;
    currentPage = 1;
    
    const grid = document.getElementById('latest-grid');
    const gridTitle = document.querySelector('.latest-section .section-title');
    gridTitle.textContent = `Search: ${query}`;
    grid.innerHTML = '<div class="loading-state">Searching...</div>';
    
    const searchUrl = `https://be.komikcast.cc/series?filter=title=like=%22${encodeURIComponent(query)}%22,nativeTitle=like=%22${encodeURIComponent(query)}%22&takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=1`;
    try {
        const response = await fetch(searchUrl, API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            renderLatestReleases(json.data, false);
        } else {
            grid.innerHTML = '<div class="loading-state">No results found.</div>';
        }
    } catch (e) {
        grid.innerHTML = '<div class="loading-state">Failed to fetch search results.</div>';
    }
}

async function handleGenreSearch(genreName) {
    currentType = 'genre';
    currentGenre = genreName;
    currentPage = 1;
    
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    document.querySelector('.banner-section').style.display = 'none';
    const grid = document.getElementById('latest-grid');
    const gridTitle = document.querySelector('.latest-section .section-title');
    gridTitle.textContent = `Genre: ${genreName}`;
    grid.innerHTML = '<div class="loading-state">Filtering by genre...</div>';
    
    const url = `https://be.komikcast.cc/series?genreIds=${encodeURIComponent(genreName)}&takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=1`;
    try {
        const response = await fetch(url, API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            renderLatestReleases(json.data, false);
        } else {
            grid.innerHTML = '<div class="loading-state">No series found for this genre.</div>';
        }
    } catch (e) {
        grid.innerHTML = '<div class="loading-state">Failed to fetch genre results.</div>';
    }
}

async function handleFormatSearch(formatName) {
    currentType = 'format';
    currentFormat = formatName.toLowerCase();
    currentPage = 1;
    
    document.querySelector('.banner-section').style.display = 'none';
    const grid = document.getElementById('latest-grid');
    const gridTitle = document.querySelector('.latest-section .section-title');
    gridTitle.textContent = `Type: ${formatName}`;
    grid.innerHTML = '<div class="loading-state">Filtering by format...</div>';
    
    const url = `https://be.komikcast.cc/series?format=${encodeURIComponent(currentFormat)}&takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=1`;
    try {
        const response = await fetch(url, API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            renderLatestReleases(json.data, false);
        } else {
            grid.innerHTML = '<div class="loading-state">No series found for this format.</div>';
        }
    } catch (e) {
        grid.innerHTML = '<div class="loading-state">Failed to fetch format results.</div>';
    }
}

// --- Banner Logic ---
async function fetchBanners() {
    try {
        const response = await fetch(BANNER_API, API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            allBanners = json.data;
            renderBanners(allBanners);
        }
    } catch (e) {
        console.error('Error fetching banners:', e);
    }
}
const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
};

// --- Navbar Logic ---
function setupNavbar() {
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const id = target.id;
            if (!id) return;
            
            e.preventDefault();
            document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
            target.classList.add('active');
            
            if (id === 'nav-home') {
                sessionStorage.removeItem('should_restore_state');
                sessionStorage.removeItem('saved_app_state');
                window.location.reload();
            } else if (id === 'nav-manga') {
                handleFormatSearch('Manga');
            } else if (id === 'nav-manhwa') {
                handleFormatSearch('Manhwa');
            } else if (id === 'nav-manhua') {
                handleFormatSearch('Manhua');
            } else if (id === 'nav-webtoon') {
                handleFormatSearch('Webtoon');
            } else if (id === 'nav-bookmark') {
                if (!localStorage.getItem('user_token')) {
                    window.location.href = 'login.html';
                } else {
                    viewBookmarks();
                }
            }
        });
    });

    // Add User Profile / Login button to navbar if not exists
    const navLinks = document.querySelector('.nav-links');
    if (!document.getElementById('nav-user')) {
        const username = localStorage.getItem('username');
        const userLink = document.createElement('a');
        userLink.id = 'nav-user';
        userLink.href = username ? '#' : 'login.html';
        userLink.innerHTML = username ? 
            `<i class="fa-solid fa-user nav-icon"></i><span class="nav-text">${username}</span>` : 
            `<i class="fa-solid fa-right-to-bracket nav-icon"></i><span class="nav-text">Login</span>`;
        if (username) {
            userLink.onclick = () => {
                if (confirm('Logout?')) {
                    localStorage.removeItem('user_token');
                    localStorage.removeItem('username');
                    window.location.reload();
                }
            };
        }
        navLinks.appendChild(userLink);
    }
    
    // Search Functionality
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = e.target.value.trim();
                handleSearch(query);
            }
        });
    }
}

function viewBookmarks() {
    document.querySelector('.banner-section').style.display = 'none';
    const gridTitle = document.querySelector('.latest-section .section-title');
    gridTitle.textContent = 'My Bookmarks';
    const grid = document.getElementById('latest-grid');
    grid.innerHTML = '<div class="loading-state">Loading your bookmarks...</div>';
    
    currentType = 'bookmark';
    currentPage = 1;
    
    const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '{}');
    const list = Object.values(bookmarks);
    
    if (list.length === 0) {
        grid.innerHTML = '<div class="loading-state" style="grid-column: 1 / -1;">You haven\'t bookmarked any series yet.</div>';
        return;
    }
    
    // Convert bookmark format to match latest release format for render
    const mappedList = list.map(b => ({
        data: {
            slug: b.slug,
            title: b.title,
            coverImage: b.cover,
            format: b.format,
            rating: null
        },
        chapters: []
    }));
    
    renderLatestReleases(mappedList, false, true); // Added isBookmarkView flag
}

async function handleSearch(query) {
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    document.querySelector('.banner-section').style.display = 'none';
    const grid = document.getElementById('latest-grid');
    grid.innerHTML = '<div class="loading-state">Searching...</div>';
    
    if (!query) {
        document.querySelector('.banner-section').style.display = 'block';
        document.getElementById('nav-home').classList.add('active');
        fetchLatestReleases();
        return;
    }
    
    const searchUrl = `https://be.komikcast.cc/series?filter=title=like=%22${encodeURIComponent(query)}%22,nativeTitle=like=%22${encodeURIComponent(query)}%22&takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=1`;
    try {
        const response = await fetch(wrapProxy(searchUrl), API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            renderLatestReleases(json.data);
        } else {
            grid.innerHTML = '<div class="loading-state">No results found.</div>';
        }
    } catch (e) {
        grid.innerHTML = '<div class="loading-state">Failed to fetch search results.</div>';
    }
}

async function handleGenreSearch(genreName) {
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    document.querySelector('.banner-section').style.display = 'none';
    const grid = document.getElementById('latest-grid');
    const gridTitle = document.querySelector('.latest-section .section-title');
    gridTitle.textContent = `Genre: ${genreName}`;
    grid.innerHTML = '<div class="loading-state">Filtering by genre...</div>';
    
    // Using the exact URL format provided by user for genre filtering
    const url = `https://be.komikcast.cc/series?genreIds=${encodeURIComponent(genreName)}&takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=1`;
    try {
        const response = await fetch(url, API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            renderLatestReleases(json.data);
        } else {
            grid.innerHTML = '<div class="loading-state">No series found for this genre.</div>';
        }
    } catch (e) {
        grid.innerHTML = '<div class="loading-state">Failed to fetch genre results.</div>';
    }
}

// --- Banner Logic ---
async function fetchBanners() {
    try {
        const response = await fetch(BANNER_API, API_OPTIONS);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            allBanners = json.data;
            renderBanners(allBanners);
        } else {
            showError('banner-track', 'Failed to load trending series.');
        }
    } catch (error) {
        showError('banner-track', 'Network error.');
    }
}

function renderBanners(seriesList) {
    const track = document.getElementById('banner-track');
    const indicators = document.getElementById('banner-indicators');
    if (!seriesList.length) {
        track.innerHTML = '<div class="loading-state">No trending series found.</div>';
        return;
    }

    track.innerHTML = '';
    indicators.innerHTML = '';
    
    seriesList.sort((a, b) => (a.data.bannerIndex || 999) - (b.data.bannerIndex || 999));

    seriesList.forEach((item, index) => {
        const data = item.data;
        const slide = document.createElement('div');
        slide.className = 'banner-item';
        slide.style.cursor = 'pointer';
        slide.onclick = () => {
            saveAppState();
            window.location.href = `details.html?slug=${encodeURIComponent(data.slug)}`;
        };
        
        slide.innerHTML = `
            <img src="${data.backgroundImage || data.coverImage}" alt="BG" class="banner-bg">
            <div class="banner-overlay"></div>
            <div class="banner-content">
                <img src="${data.coverImage}" alt="Cover" class="banner-cover">
                <div class="banner-info">
                    ${data.isHot ? '<span class="badge hot">HOT</span>' : ''}
                    <span class="badge type">${data.format}</span>
                    <h2 class="banner-title">${data.title}</h2>
                    <div class="banner-meta">
                        <span class="meta-item rating-star">★ ${data.rating || '-'}</span>
                        <span class="meta-item">|</span>
                        <span class="meta-item">${data.totalChapters ? data.totalChapters + ' Chapters' : 'Ongoing'}</span>
                    </div>
                    <p class="banner-synopsis">${data.synopsis || 'No synopsis.'}</p>
                    <button class="read-btn" onclick="event.stopPropagation(); saveAppState(); window.location.href='reader.html?slug=${encodeURIComponent(data.slug)}&title=${encodeURIComponent(data.title)}'">Read Now</button>
                </div>
            </div>
        `;
        track.appendChild(slide);

        const indicator = document.createElement('div');
        indicator.className = `indicator ${index === 0 ? 'active' : ''}`;
        indicator.onclick = (e) => { e.stopPropagation(); goToSlide(index); };
        indicators.appendChild(indicator);
    });

    setupCarousel(seriesList.length);
}

// --- Carousel ---
let currentSlide = 0;
let totalSlides = 0;
let autoSlideInterval;

function setupCarousel(total) {
    totalSlides = total;
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    // Clear old listeners by cloning
    const newPrev = prevBtn.cloneNode(true);
    const newNext = nextBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrev, prevBtn);
    nextBtn.parentNode.replaceChild(newNext, nextBtn);

    newPrev.onclick = () => { currentSlide = (currentSlide - 1 + totalSlides) % totalSlides; updateCarousel(); resetAutoSlide(); };
    newNext.onclick = () => { nextSlide(); resetAutoSlide(); };

    startAutoSlide();
}

function goToSlide(index) {
    currentSlide = index;
    updateCarousel();
    resetAutoSlide();
}

function nextSlide() {
    if (totalSlides === 0) return;
    currentSlide = (currentSlide + 1) % totalSlides;
    updateCarousel();
}

function updateCarousel() {
    const track = document.getElementById('banner-track');
    const indicators = document.querySelectorAll('.indicator');
    if (track) track.style.transform = `translateX(-${currentSlide * 100}%)`;
    indicators.forEach((ind, i) => ind.classList.toggle('active', i === currentSlide));
}

function startAutoSlide() {
    clearInterval(autoSlideInterval);
    autoSlideInterval = setInterval(nextSlide, 5000);
}

function resetAutoSlide() {
    startAutoSlide();
}

// --- Latest ---
// Removed duplicate fetchLatestReleases to fix Proxy issue.

function renderLatestReleases(list, append = false, isBookmarkView = false) {
    const grid = document.getElementById('latest-grid');
    if (!append) {
        grid.innerHTML = '';
        allMangaData = [];
    }
    
    if (!list || !list.length) {
        if (!append) grid.innerHTML = '<div class="loading-state">No releases found.</div>';
        return;
    }

    if (append) {
        allMangaData = [...allMangaData, ...list];
    } else {
        allMangaData = [...list];
    }

    // Get history for 'Last Read' info
    const history = isBookmarkView ? JSON.parse(localStorage.getItem('reading_history') || '{}') : {};

    list.forEach(item => {
        const d = item.data;
        const card = document.createElement('div');
        card.className = 'comic-card';
        card.onclick = () => {
            saveAppState();
            window.location.href = `details.html?slug=${encodeURIComponent(d.slug)}`;
        };
        
        let labelText = 'Ch. ?';
        if (isBookmarkView) {
            const lastRead = history[d.slug];
            labelText = lastRead ? `Last: Ch. ${lastRead}` : 'Unread';
        } else if (item.chapters && item.chapters.length > 0) {
            labelText = `Ch. ${item.chapters[0].chapterIndex}`;
        }

        const viewCount = !isBookmarkView ? `<span>👁 ${formatNumber(item.dataMetadata?.totalViewsComputed || 0)}</span>` : '';

        card.innerHTML = `
            <div class="card-image-wrap">
                <img src="${d.coverImage}" alt="${d.title}" class="card-image" loading="lazy">
                <div class="card-overlay"></div>
                ${d.format ? `<div class="card-format">${d.format}</div>` : ''}
                <div class="card-rating rating-star">★ ${d.rating || '-'}</div>
            </div>
            <div class="card-content">
                <h3 class="card-title">${d.title}</h3>
                <div class="card-chapter">
                    <span class="chapter-badge">${labelText}</span>
                    ${viewCount}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function showError(id, msg) {
    const c = document.getElementById(id);
    if(c) c.innerHTML = `<div class="error-state">${msg}</div>`;
}
