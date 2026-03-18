let currentPage = 1;
let isLoading = false;
let currentType = 'latest'; // 'latest', 'search', 'genre', 'bookmark', 'format'
let currentQuery = '';
let currentFormat = '';
let currentGenres = [];
let currentStatus = '';
let currentSort = 'latest';
let currentSortOrder = 'desc';
let allMangaData = []; // Store data objects to re-attach listeners on restore
const API_BASE = 'https://abahcode.com/api.php';

async function fetchLatestReleases() {
    currentType = 'latest';
    currentPage = 1;
    applyFilters();
}

async function refreshUserData() {
    const token = localStorage.getItem('user_token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}?action=get_data&token=${encodeURIComponent(token)}`);
        const result = await response.json();
        
        if (result && result.status === 200 && result.data) {
            let bookmarks = result.data.bookmarks || {};
            let history = result.data.history || {};
            
            // Defensive check
            if (Array.isArray(bookmarks)) bookmarks = {};
            if (Array.isArray(history)) history = {};
            
            localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
            localStorage.setItem('reading_history', JSON.stringify(history));
            console.log('User data refreshed from server');
        }
    } catch (e) {
        console.error('Failed to refresh user data:', e);
    }
}

async function apiPost(action, data) {
    const token = localStorage.getItem('user_token');
    if (!token) return null;
    try {
        const response = await fetch(`${API_BASE}?action=${action}&token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (e) {
        console.error(`API Error (${action}):`, e);
        return null;
    }
}

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
        currentGenres = [genreParam];
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
    setupFilters();
    fetchGenres();
    
    // Initial data refresh from server
    refreshUserData();
});

function saveAppState() {
    try {
        const titleEl = document.querySelector('.latest-section .section-title');
        const bannerEl = document.querySelector('.banner-section');
        const activeLink = document.querySelector('.nav-links a.active');
        
        const state = {
            currentType,
            currentQuery,
            currentGenres,
            currentFormat,
            currentPage,
            allMangaData,
            scrollPos: window.scrollY,
            title: titleEl ? titleEl.textContent : 'Series',
            bannerDisplay: bannerEl ? bannerEl.style.display : 'block',
            activeNavLinkId: activeLink ? activeLink.id : null
        };
        sessionStorage.setItem('saved_app_state', JSON.stringify(state));
        sessionStorage.setItem('should_restore_state', 'true');
    } catch (e) {
        console.error('Failed to save app state:', e);
    }
}

function restoreAppState() {
    const saved = sessionStorage.getItem('saved_app_state');
    if (!saved) return;
    
    const state = JSON.parse(saved);
    currentType = state.currentType;
    currentQuery = state.currentQuery;
    currentGenres = state.currentGenres || [];
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
    const filterParams = getFilterParams();

    if (currentType === 'latest') {
        url = `https://be.komikcast.cc/series?preset=rilisan_terbaru&take=20&takeChapter=3&page=${currentPage}${filterParams}`;
    } else if (currentType === 'search') {
        url = `https://be.komikcast.cc/series?filter=title=like=%22${encodeURIComponent(currentQuery)}%22,nativeTitle=like=%22${encodeURIComponent(currentQuery)}%22&takeChapter=2&includeMeta=true&take=12&page=${currentPage}${filterParams}`;
    } else if (currentType === 'genre') {
        url = `https://be.komikcast.cc/series?takeChapter=2&includeMeta=true&take=12&page=${currentPage}${filterParams}`;
    } else if (currentType === 'format') {
        url = `https://be.komikcast.cc/series?format=${encodeURIComponent(currentFormat)}&takeChapter=2&includeMeta=true&take=12&page=${currentPage}${filterParams}`;
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

async function handleSearch(query) {
    currentQuery = query;
    currentType = 'search';
    currentPage = 1;
    applyFilters();
}

async function handleGenreSearch(genreName) {
    currentGenres = [genreName];
    currentType = 'genre';
    currentPage = 1;
    applyFilters();
}

async function handleFormatSearch(formatName) {
    currentFormat = formatName.toLowerCase();
    currentType = 'format';
    currentPage = 1;
    applyFilters();
}

function applyFilters() {
    document.querySelector('.banner-section').style.display = 'none';
    const grid = document.getElementById('latest-grid');
    const gridTitle = document.querySelector('.latest-section .section-title');
    
    let title = 'Series';
    if (currentType === 'latest') title = 'Latest Releases';
    if (currentType === 'search') title = `Search: ${currentQuery}`;
    if (currentType === 'genre') title = currentGenres.length > 0 ? `Genres: ${currentGenres.join(', ')}` : 'Genres: All';
    if (currentType === 'format') title = `Type: ${currentFormat}`;
    if (currentType === 'bookmark') title = 'My Bookmarks';
    
    gridTitle.textContent = title;
    grid.innerHTML = '<div class="loading-state">Loading...</div>';
    
    if (currentType === 'bookmark' || currentType === 'latest') {
        document.getElementById('filter-section').style.display = 'none';
    } else {
        document.getElementById('filter-section').style.display = 'flex';
    }

    if (currentType === 'bookmark') {
        viewBookmarks();
        return;
    }

    const filterParams = getFilterParams();
    let url = '';
    if (currentType === 'latest') {
        url = `https://be.komikcast.cc/series?preset=rilisan_terbaru&take=20&takeChapter=3&page=1${filterParams}`;
    } else if (currentType === 'search') {
        url = `https://be.komikcast.cc/series?filter=title=like=%22${encodeURIComponent(currentQuery)}%22,nativeTitle=like=%22${encodeURIComponent(currentQuery)}%22&takeChapter=2&includeMeta=true&take=12&page=1${filterParams}`;
    } else if (currentType === 'genre') {
        url = `https://be.komikcast.cc/series?takeChapter=2&includeMeta=true&take=12&page=1${filterParams}`;
    } else if (currentType === 'format') {
        url = `https://be.komikcast.cc/series?format=${encodeURIComponent(currentFormat)}&takeChapter=2&includeMeta=true&take=12&page=1${filterParams}`;
    }

    fetch(url, API_OPTIONS)
        .then(res => res.json())
        .then(json => {
            if (json.status === 200 && json.data) {
                renderLatestReleases(json.data, false);
            } else {
                grid.innerHTML = '<div class="loading-state">No series found.</div>';
            }
        })
        .catch(e => {
            grid.innerHTML = '<div class="loading-state">Error fetching data.</div>';
        });
}

function getFilterParams() {
    let params = `&sort=${currentSort}&sortOrder=${currentSortOrder}`;
    if (currentStatus) params += `&status=${currentStatus}`;
    if (currentGenres.length > 0) {
        currentGenres.forEach(g => {
            params += `&genreIds=${encodeURIComponent(g)}`;
        });
    }
    return params;
}

function setupFilters() {
    // Desktop Selects (Used on both desktop and mobile now)
    const ids = ['filter-status', 'filter-sort', 'filter-order', 'filter-genres'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            currentStatus = document.getElementById('filter-status').value;
            currentSort = document.getElementById('filter-sort').value;
            currentSortOrder = document.getElementById('filter-order').value;
            
            if (e.target.id === 'filter-genres') {
                const val = e.target.value;
                if (val) {
                    currentGenres = [val];
                    currentType = 'genre';
                } else {
                    currentGenres = [];
                    currentType = 'latest';
                }
            }
            
            currentPage = 1;
            applyFilters();
        });
    });
}



async function fetchGenres() {
    const GENRE_API = 'https://be.komikcast.cc/genres';
    try {
        const response = await fetch(GENRE_API);
        const json = await response.json();
        if (json.status === 200 && json.data) {
            const select = document.getElementById('filter-genres');
            if (select) {
                select.innerHTML = '<option value="">Genre: All</option>';
                json.data.forEach(genre => {
                    const name = genre.data.name;
                    const opt = document.createElement('option');
                    opt.value = name; 
                    opt.textContent = name;
                    select.appendChild(opt);
                });
            }
        }
    } catch (e) {
        console.error('Error fetching genres:', e);
    }
}

async function handleImageError(img, slug) {
    if (img.dataset.repaired) return;
    img.dataset.repaired = 'true';
    
    console.log(`Repairing cover for ${slug}`);
    try {
        const detailUrl = `https://be.komikcast.cc/series/${slug}`;
        const response = await fetch(detailUrl);
        const json = await response.json();
        if (json.status === 200 && json.data && json.data.coverImage) {
            const newCover = json.data.coverImage;
            img.src = newCover;
            
            // Update local storage bookmark
            const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '{}');
            if (bookmarks[slug]) {
                bookmarks[slug].cover = newCover;
                localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
                
                // Optional: update on server
                const token = localStorage.getItem('user_token');
                if (token) {
                    const title = bookmarks[slug].title;
                    const format = bookmarks[slug].format;
                    apiPost('add_bookmark', {
                        slug: slug,
                        title: title,
                        cover: newCover,
                        format: format
                    });
                }
            }
        }
    } catch (e) {
        console.error('Failed to repair cover image', e);
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
                    currentType = 'bookmark';
                    applyFilters();
                }
            }
        });
    });

    // Add User Profile / Login button to navbar if not exists
    const navLinks = document.querySelector('.nav-links');
    if (!document.getElementById('nav-user')) {
        const userProfile = JSON.parse(localStorage.getItem('user_profile') || 'null');
        const token = localStorage.getItem('user_token');
        let username = userProfile ? userProfile.username : null;
        
        // Robust recovery: if profile is missing but token exists, decode it
        if (!username && token) {
            try {
                username = atob(token);
                // Also save it back for future use
                localStorage.setItem('user_profile', JSON.stringify({ username }));
            } catch (e) {
                console.error('Failed to decode token for username', e);
            }
        }
        
        const userLink = document.createElement('a');
        userLink.id = 'nav-user';
        userLink.href = username ? '#' : 'login.html';
        userLink.innerHTML = username ? 
            `<i class="fa-solid fa-user nav-icon"></i><span class="nav-text" style="max-width: 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${username}</span>` : 
            `<i class="fa-solid fa-right-to-bracket nav-icon"></i><span class="nav-text">Login</span>`;
        
        if (username) {
            userLink.onclick = () => {
                if (confirm('Logout?')) {
                    localStorage.removeItem('user_token');
                    localStorage.removeItem('user_profile');
                    localStorage.removeItem('bookmarks');
                    localStorage.removeItem('reading_history');
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

async function viewBookmarks() {
    await refreshUserData();
    document.querySelector('.banner-section').style.display = 'none';
    const gridTitle = document.querySelector('.latest-section .section-title');
    gridTitle.textContent = 'My Bookmarks';
    const grid = document.getElementById('latest-grid');
    grid.innerHTML = '<div class="loading-state">Loading your bookmarks...</div>';
    
    // Hide filters explicitly here as well, just in case
    document.getElementById('filter-section').style.display = 'none';

    currentPage = 1;
    
    const bookmarksRaw = localStorage.getItem('bookmarks');
    let bookmarks = {};
    try {
        bookmarks = JSON.parse(bookmarksRaw || '{}');
        // Handle unexpected primitive or null types
        if (!bookmarks || typeof bookmarks !== 'object' || Array.isArray(bookmarks)) {
            bookmarks = {};
        }
    } catch (e) {
        bookmarks = {};
    }
    
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



// --- Banner Logic ---


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

        const viewCount = !isBookmarkView ? `<span><i class="fa-solid fa-eye" style="font-size: 0.75rem; margin-right: 2px;"></i> ${formatNumber(item.dataMetadata?.totalViewsComputed || 0)}</span>` : '';

        card.innerHTML = `
            <div class="card-image-wrap">
                <img src="${d.coverImage}" alt="${d.title}" class="card-image" loading="lazy" onerror="handleImageError(this, '${d.slug}')">
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
