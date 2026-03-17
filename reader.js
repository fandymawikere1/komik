document.addEventListener('DOMContentLoaded', () => {
    initReader();
});

const PROXY_URL = 'https://abahcode.com/proxy.php?url=';
const wrapProxy = (url) => url ? `${PROXY_URL}${encodeURIComponent(url)}` : url;

// Mobile API options (CORS)
const API_OPTIONS = {
    // No specific options needed when proxied
};

const API_BASE = 'https://abahcode.com/api.php';

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

let currentTitle = '';
let currentFormat = '';
let allChapters = [];
let currentChapterIndex = null;
let currentChapterImages = [];
let currentPageIndex = 0;
let isPagingMode = false;

async function initReader() {
    const urlParams = new URLSearchParams(window.location.search);
    currentSlug = urlParams.get('slug');
    currentTitle = urlParams.get('title') || 'Komikcast Reader';
    currentFormat = (urlParams.get('format') || '').toLowerCase();
    
    document.getElementById('series-title').textContent = currentTitle;
    document.title = currentTitle + ' - Read';
    
    // Auto-enable paging if format is manga
    if (currentFormat === 'manga') {
        isPagingMode = true;
    }
    updateModeUI();

    document.getElementById('back-btn').addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = `details.html?slug=${currentSlug}`;
        }
    });

    document.getElementById('mode-toggle').addEventListener('click', () => {
        isPagingMode = !isPagingMode;
        updateModeUI();
        currentPageIndex = 0; // Reset page index when switching
        renderImages(currentChapterImages);
    });

    // Hide/Show navbar on scroll
    let lastScrollTop = 0;
    const navbar = document.querySelector('.reader-navbar');
    
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Hide/Show navbar logic
        if (scrollTop > lastScrollTop && scrollTop > 50) {
            navbar.classList.add('navbar-hidden');
        } else {
            navbar.classList.remove('navbar-hidden');
        }
        lastScrollTop = scrollTop;
    });

    // Toggle navbar on click
    document.getElementById('image-container').addEventListener('click', (e) => {
        // Only toggle if not clicking for navigation in paging mode
        if (isPagingMode) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            // If clicking middle 40% of screen, toggle navbar
            if (x > rect.width * 0.3 && x < rect.width * 0.7) {
                navbar.classList.toggle('navbar-hidden');
            }
        } else {
            navbar.classList.toggle('navbar-hidden');
        }
    });
    
    if (!currentSlug || currentSlug === 'null') {
        showError('Invalid series slug.');
        return;
    }
    
    await fetchChapterList();
}

function updateModeUI() {
    const modeText = document.getElementById('mode-text');
    const pageInfo = document.getElementById('page-info');
    const container = document.getElementById('image-container');
    
    if (isPagingMode) {
        modeText.textContent = 'Comic Mode';
        pageInfo.style.display = 'block';
        container.classList.add('paging-mode');
    } else {
        modeText.textContent = 'Webtoon';
        pageInfo.style.display = 'none';
        container.classList.remove('paging-mode');
    }
}

async function fetchChapterList() {
    try {
        const res = await fetch(`https://be.komikcast.cc/series/${currentSlug}/chapters?take=1000`, API_OPTIONS);
        const json = await res.json();
        if (json.status === 200 && json.data) {
            allChapters = json.data;
            populateChapterSelect();
        } else {
            showError('Failed to load chapters.');
        }
    } catch (e) {
        showError('Network error loading chapters.');
    }
}

function populateChapterSelect() {
    const select = document.getElementById('chapter-select');
    select.innerHTML = '';
    
    if (allChapters.length === 0) {
        select.innerHTML = '<option value="">No chapters</option>';
        return;
    }
    
    allChapters.sort((a,b) => parseFloat(a.data.index) - parseFloat(b.data.index));
    
    allChapters.forEach(ch => {
        const option = document.createElement('option');
        option.value = ch.data.index;
        option.textContent = `Chapter ${ch.data.index}`;
        select.appendChild(option);
    });
    
    const urlParams = new URLSearchParams(window.location.search);
    const paramChapter = urlParams.get('chapter');
    currentChapterIndex = paramChapter ? parseFloat(paramChapter) : parseFloat(allChapters[0].data.index);
    
    const found = allChapters.find(c => parseFloat(c.data.index) === currentChapterIndex);
    if (!found) currentChapterIndex = parseFloat(allChapters[0].data.index);
    
    select.value = currentChapterIndex;
    select.onchange = (e) => loadChapter(e.target.value);
    
    document.getElementById('prev-chapter').onclick = () => navigateChapter(-1);
    document.getElementById('next-chapter').onclick = () => navigateChapter(1);
    document.getElementById('bottom-prev').onclick = () => navigateChapter(-1);
    document.getElementById('bottom-next').onclick = () => navigateChapter(1);
    
    loadChapter(currentChapterIndex);
}

async function loadChapter(index) {
    currentChapterIndex = parseFloat(index);
    document.getElementById('chapter-select').value = currentChapterIndex;
    updateNavigationButtons();
    
    // Save history
    try {
        const history = JSON.parse(localStorage.getItem('reading_history') || '{}');
        history[currentSlug] = currentChapterIndex;
        localStorage.setItem('reading_history', JSON.stringify(history));
        apiPost('update_history', { slug: currentSlug, last_chapter: currentChapterIndex });
    } catch(e) {}
    
    const container = document.getElementById('image-container');
    container.innerHTML = '<div class="reader-loading-state">Loading images...</div>';
    document.getElementById('bottom-controls').style.display = 'none';
    
    try {
        const res = await fetch(`https://be.komikcast.cc/series/${currentSlug}/chapters/${currentChapterIndex}`, API_OPTIONS);
        const json = await res.json();
        
        if (json.status === 200 && json.data?.data?.images) {
            currentChapterImages = json.data.data.images;
            currentPageIndex = 0;
            renderImages(currentChapterImages);
        } else {
            container.innerHTML = `<div class="reader-loading-state">Failed to load content.</div>`;
        }
    } catch(e) {
        container.innerHTML = `<div class="reader-loading-state">Network error.</div>`;
    }
}

async function renderImages(images) {
    const container = document.getElementById('image-container');
    container.innerHTML = '';
    
    if (!images || images.length === 0) {
        container.innerHTML = '<div class="reader-loading-state">No images found.</div>';
        return;
    }

    // Prepare all image elements but don't set src yet
    const imgElements = images.map((imgUrl, i) => {
        const img = document.createElement('img');
        img.className = 'manga-page';
        if (isPagingMode) {
            img.classList.toggle('active', i === currentPageIndex);
            img.onclick = (e) => {
                e.stopPropagation(); // Prevent bubbling to container toggle
                if (img.dataset.failed === 'true') {
                    // Handled by the listener added in setupImageLoading
                    return;
                }
                const rect = img.getBoundingClientRect();
                const x = e.clientX - rect.left;
                if (x > rect.width / 2) navigatePage(1);
                else navigatePage(-1);
            };
        } else {
            img.loading = 'lazy';
        }
        container.appendChild(img);
        return { element: img, url: wrapProxy(imgUrl) };
    });

    if (isPagingMode) {
        updatePageInfo();
        document.getElementById('bottom-controls').style.display = 'none';
    } else {
        document.getElementById('bottom-controls').style.display = 'flex';
    }

    // PRIORITY LOADING LOGIC
    // 1. Load the first 3 images immediately to show content fast
    const initialBatch = 3;
    for (let i = 0; i < Math.min(initialBatch, imgElements.length); i++) {
        setupImageLoading(imgElements[i].element, imgElements[i].url);
    }

    // 2. Load the rest sequentially in the background
    // This prioritizes bandwidth for current/starting pages
    async function loadRemaining() {
        for (let i = initialBatch; i < imgElements.length; i++) {
            // Sequential loading: wait for current image to start loading before next
            await new Promise(resolve => {
                const img = imgElements[i].element;
                const oldOnload = img.onload;
                const oldOnerror = img.onerror;
                
                img.onload = () => {
                    if (oldOnload) oldOnload();
                    resolve();
                };
                img.onerror = () => {
                    if (oldOnerror) oldOnerror();
                    resolve();
                };
                setupImageLoading(img, imgElements[i].url);
                
                // timeout as failsafe so we don't hang the loop
                setTimeout(resolve, 1000); 
            });
        }
    }

    loadRemaining();
    window.scrollTo(0, 0);
    
    // Allow next chapter scroll after a 2000ms delay to prevent immediate skips
    window.isChapterReadyForNext = false;
    setTimeout(() => { window.isChapterReadyForNext = true; }, 2000);
}

function setupImageLoading(img, url) {
    img.onerror = function() {
        this.dataset.failed = 'true';
        this.onerror = null; // Prevent infinite loop on the fallback image
        // A simple inline SVG showing a retry button
        this.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100%25" height="300px" viewBox="0 0 100 100" preserveAspectRatio="none"%3E%3Crect width="100" height="100" fill="%231e293b" /%3E%3Ctext x="50" y="45" font-family="sans-serif" font-size="5" fill="%23ef4444" text-anchor="middle" dominant-baseline="middle"%3EFailed to load image.%3C/text%3E%3Ctext x="50" y="55" font-family="sans-serif" font-size="4" fill="%23fff" text-anchor="middle" dominant-baseline="middle"%3EClick to reload%3C/text%3E%3C/svg%3E';
    };
    
    img.addEventListener('click', function(e) {
        if (this.dataset.failed === 'true') {
            e.stopPropagation();
            this.dataset.failed = 'false';
            
            // Re-attach original onerror and reload
            this.onerror = function() {
                this.dataset.failed = 'true';
                this.onerror = null;
                this.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100%25" height="300px" viewBox="0 0 100 100" preserveAspectRatio="none"%3E%3Crect width="100" height="100" fill="%231e293b" /%3E%3Ctext x="50" y="45" font-family="sans-serif" font-size="5" fill="%23ef4444" text-anchor="middle" dominant-baseline="middle"%3EFailed to load image.%3C/text%3E%3Ctext x="50" y="55" font-family="sans-serif" font-size="4" fill="%23fff" text-anchor="middle" dominant-baseline="middle"%3EClick to reload%3C/text%3E%3C/svg%3E';
            };
            this.src = url;
        }
    });
    
    img.src = url;
}

function navigatePage(dir) {
    if (!isPagingMode) return;
    
    const newIdx = currentPageIndex + dir;
    if (newIdx >= 0 && newIdx < currentChapterImages.length) {
        currentPageIndex = newIdx;
        const pages = document.querySelectorAll('.manga-page');
        pages.forEach((p, i) => p.classList.toggle('active', i === currentPageIndex));
        updatePageInfo();
        window.scrollTo(0, 0);
    } else if (newIdx >= currentChapterImages.length) {
        // Go to next chapter
        navigateChapter(1);
    } else if (newIdx < 0) {
        // Go to prev chapter
        navigateChapter(-1);
    }
}

function updatePageInfo() {
    const info = document.getElementById('page-info');
    info.textContent = `Page ${currentPageIndex + 1} / ${currentChapterImages.length}`;
}

function navigateChapter(direction) {
    const sortedIndices = allChapters.map(c => parseFloat(c.data.index));
    const currentIndexPos = sortedIndices.indexOf(currentChapterIndex);
    if (currentIndexPos !== -1) {
        const nextPos = currentIndexPos + direction;
        if (nextPos >= 0 && nextPos < sortedIndices.length) {
            loadChapter(sortedIndices[nextPos]);
        }
    }
}

function updateNavigationButtons() {
    const sortedIndices = allChapters.map(c => parseFloat(c.data.index));
    const currentIndexPos = sortedIndices.indexOf(currentChapterIndex);
    const hasPrev = currentIndexPos > 0;
    const hasNext = currentIndexPos < sortedIndices.length - 1;
    
    document.getElementById('prev-chapter').disabled = !hasPrev;
    document.getElementById('next-chapter').disabled = !hasNext;
    document.getElementById('bottom-prev').disabled = !hasPrev;
    document.getElementById('bottom-next').disabled = !hasNext;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (isPagingMode) {
        if (e.key === 'ArrowRight') navigatePage(1);
        if (e.key === 'ArrowLeft') navigatePage(-1);
    }
});

function showError(msg) {
    document.getElementById('image-container').innerHTML = `<div class="reader-loading-state" style="color: #ef4444;">${msg}</div>`;
}
