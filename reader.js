document.addEventListener('DOMContentLoaded', () => {
    initReader();
});

const PROXY_URL = 'https://abahcode.com/proxy.php?url=';
const wrapProxy = (url) => url ? `${PROXY_URL}${encodeURIComponent(url)}` : url;

// Mobile API options (CORS)
const API_OPTIONS = {
    // No specific options needed when proxied
};

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
        window.location.href = `details.html?slug=${currentSlug}`;
    });

    document.getElementById('mode-toggle').addEventListener('click', () => {
        isPagingMode = !isPagingMode;
        updateModeUI();
        currentPageIndex = 0; // Reset page index when switching
        renderImages(currentChapterImages);
    });

    // Auto-next chapter on scroll (Webtoon mode)
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

        if (!isPagingMode && currentChapterImages.length > 0) {
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;
            
            // If scrolled to bottom (within 50px buffer)
            if (scrollTop + clientHeight >= scrollHeight - 50) {
                // Throttle a bit to prevent multiple triggers
                if (!window.nextChapterLoading) {
                    window.nextChapterLoading = true;
                    setTimeout(() => {
                        navigateChapter(1);
                        window.nextChapterLoading = false;
                    }, 500);
                }
            }
        }
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
        const res = await fetch(wrapProxy(`https://be.komikcast.cc/series/${currentSlug}/chapters?take=1000`), API_OPTIONS);
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
    } catch(e) {}
    
    const container = document.getElementById('image-container');
    container.innerHTML = '<div class="reader-loading-state">Loading images...</div>';
    document.getElementById('bottom-controls').style.display = 'none';
    
    try {
        const res = await fetch(wrapProxy(`https://be.komikcast.cc/series/${currentSlug}/chapters/${currentChapterIndex}`), API_OPTIONS);
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
        imgElements[i].element.src = imgElements[i].url;
    }

    // 2. Load the rest sequentially in the background
    // This prioritizes bandwidth for current/starting pages
    async function loadRemaining() {
        for (let i = initialBatch; i < imgElements.length; i++) {
            // Sequential loading: wait for current image to start loading before next
            await new Promise(resolve => {
                const img = imgElements[i].element;
                img.onload = img.onerror = resolve;
                img.src = imgElements[i].url;
                
                // timeout as failsafe so we don't hang the loop
                setTimeout(resolve, 1000); 
            });
        }
    }

    loadRemaining();
    window.scrollTo(0, 0);
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
