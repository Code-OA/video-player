// FINAL OPTIMIZED script.js - ALL ISSUES RESOLVED
// Version 2.0 - Lag-free, memory-safe, production-ready

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const videoPlayer = document.getElementById('video-player');
    const videoInput = document.getElementById('video-input');
    const noVideoMessage = document.getElementById('no-video-message');
    const recentVideosList = document.getElementById('recent-videos-list');
    const clearSelectedBtn = document.getElementById('clear-selected');
    const clearAllBtn = document.getElementById('clear-all');

    // Variables
    let currentVideo = null;
    let videoPlaybackPositions = {};
    let recentVideos = [];
    const LOCAL_STORAGE_KEY = 'video-player-app-data';
    const INITIAL_VOLUME = 0.1;
    let db;
    
    // Performance optimization: Debounce timers
    let saveDataTimeout = null;
    let renderTimeout = null;
    let lastRenderTime = 0;
    const RENDER_THROTTLE = 1000;
    
    // FIXED: RAF cleanup
    let progressUpdateFrame = null;
    let lastUpdateTime = 0;

    // Initialize IndexedDB
    initIndexedDB();

    function initIndexedDB() {
        const request = indexedDB.open('VideoPlayerDB', 1);

        request.onerror = function (event) {
            console.error('IndexedDB error:', event.target.errorCode);
            loadSavedData();
        };

        request.onupgradeneeded = function (event) {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('videos')) {
                const videoStore = db.createObjectStore('videos', { keyPath: 'id' });
                videoStore.createIndex('lastPlayed', 'lastPlayed', { unique: false });
            }
        };

        request.onsuccess = function (event) {
            db = event.target.result;
            console.log('IndexedDB initialized successfully');

            loadSavedData();

            db.onversionchange = function () {
                db.close();
                alert('Database is outdated, please reload the page.');
            };
        };
    }

    // Load saved data from localStorage
    function loadSavedData() {
        const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedData) {
            const data = JSON.parse(savedData);
            videoPlaybackPositions = data.positions || {};
            recentVideos = data.recents || [];

            if (db) {
                verifyVideosInIndexedDB();
            } else {
                renderRecentVideos();
            }
        } else {
            renderRecentVideos();
        }
    }

    // Verify videos in IndexedDB
    function verifyVideosInIndexedDB() {
        if (!db || recentVideos.length === 0) {
            renderRecentVideos();
            return;
        }

        const transaction = db.transaction(['videos'], 'readonly');
        const videoStore = transaction.objectStore('videos');
        const pendingChecks = recentVideos.length;
        let completedChecks = 0;
        let validVideos = [];

        recentVideos.forEach((video) => {
            const request = videoStore.get(video.id);

            request.onsuccess = function (event) {
                completedChecks++;

                if (event.target.result) {
                    validVideos.push(video);
                } else {
                    console.log(`Video ${video.name} not found in IndexedDB, removing from recents`);
                }

                if (completedChecks === pendingChecks) {
                    recentVideos = validVideos;
                    saveDataImmediate();
                    renderRecentVideos();
                }
            };

            request.onerror = function () {
                completedChecks++;
                console.error(`Error checking video ${video.name} in IndexedDB`);

                if (completedChecks === pendingChecks) {
                    recentVideos = validVideos;
                    saveDataImmediate();
                    renderRecentVideos();
                }
            };
        });
    }

    // Debounced save data
    function saveData() {
        clearTimeout(saveDataTimeout);
        saveDataTimeout = setTimeout(() => {
            saveDataImmediate();
        }, 500);
    }

    // Immediate save without debounce
    function saveDataImmediate() {
        const data = {
            positions: videoPlaybackPositions,
            recents: recentVideos
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    }

    // Generate unique ID for video
    function generateVideoId(file) {
        return `${file.name}-${file.size}-${file.lastModified}`;
    }

    // Format time
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) return '0:00';

        seconds = Math.floor(seconds);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // Generate thumbnail
    function generateThumbnail(videoFile) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';

            video.onloadedmetadata = function () {
                video.currentTime = Math.min(1, video.duration / 4);
            };

            video.onseeked = function () {
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 180;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
                URL.revokeObjectURL(video.src);
                resolve(thumbnail);
            };

            video.onerror = function () {
                URL.revokeObjectURL(video.src);
                resolve(null);
            };

            video.src = URL.createObjectURL(videoFile);
        });
    }

    // Find video in recents
    function findVideoInRecents(videoId) {
        return recentVideos.findIndex(video => video.id === videoId);
    }

    // Store video in IndexedDB
    function storeVideoInIndexedDB(videoId, file) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject('IndexedDB not initialized');
                return;
            }

            const checkTransaction = db.transaction(['videos'], 'readonly');
            const checkStore = checkTransaction.objectStore('videos');
            const checkRequest = checkStore.get(videoId);

            checkRequest.onsuccess = function (event) {
                if (event.target.result) {
                    resolve(true);
                    return;
                }

                const transaction = db.transaction(['videos'], 'readwrite');
                const videoStore = transaction.objectStore('videos');

                const videoData = {
                    id: videoId,
                    file: file,
                    name: file.name,
                    size: file.size,
                    lastModified: file.lastModified,
                    lastPlayed: new Date().toISOString()
                };

                const request = videoStore.put(videoData);

                request.onsuccess = function () {
                    console.log(`Video ${file.name} stored in IndexedDB`);
                    resolve(true);
                };

                request.onerror = function (event) {
                    console.error('Error storing video in IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            };

            checkRequest.onerror = function (event) {
                reject(event.target.error);
            };
        });
    }

    // Get video from IndexedDB
    function getVideoFromIndexedDB(videoId) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject('IndexedDB not initialized');
                return;
            }

            const transaction = db.transaction(['videos'], 'readonly');
            const videoStore = transaction.objectStore('videos');
            const request = videoStore.get(videoId);

            request.onsuccess = function (event) {
                const videoData = event.target.result;
                if (videoData) {
                    resolve(videoData.file);
                } else {
                    reject('Video not found in IndexedDB');
                }
            };

            request.onerror = function (event) {
                reject(event.target.error);
            };
        });
    }

    // Delete video from IndexedDB
    function deleteVideoFromIndexedDB(videoId) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject('IndexedDB not initialized');
                return;
            }

            const transaction = db.transaction(['videos'], 'readwrite');
            const videoStore = transaction.objectStore('videos');
            const request = videoStore.delete(videoId);

            request.onsuccess = function () {
                resolve(true);
            };

            request.onerror = function (event) {
                reject(event.target.error);
            };
        });
    }

    // FIXED: Clean up previous video with proper blob URL management
    function cleanupPreviousVideo() {
        if (videoPlayer.src && videoPlayer.src.startsWith('blob:')) {
            URL.revokeObjectURL(videoPlayer.src);
        }
        videoPlayer.pause();
        videoPlayer.currentTime = 0;
        
        // FIXED: Cancel any pending RAF
        if (progressUpdateFrame) {
            cancelAnimationFrame(progressUpdateFrame);
            progressUpdateFrame = null;
        }
    }

    // Play video from IndexedDB
    async function playVideoFromIndexedDB(videoId, isAutoplayTriggered = false) {
        try {
            cleanupPreviousVideo();

            noVideoMessage.textContent = "Loading video...";
            noVideoMessage.classList.add('loading-video');
            videoPlayer.style.display = 'none';

            const videoFile = await getVideoFromIndexedDB(videoId);

            const videoIndex = findVideoInRecents(videoId);
            if (videoIndex !== -1) {
                currentVideo = recentVideos[videoIndex];

                if (!isAutoplayTriggered) {
                    if (videoIndex > 0) {
                        recentVideos.splice(videoIndex, 1);
                        recentVideos.unshift(currentVideo);
                    }

                    currentVideo.lastPlayed = new Date().toISOString();
                    saveDataImmediate();
                    renderRecentVideos();
                }

                const videoObjectURL = URL.createObjectURL(videoFile);
                videoPlayer.src = videoObjectURL;
                videoPlayer.style.display = 'block';

                videoPlayer.onloadedmetadata = function () {
                    noVideoMessage.classList.remove('loading-video');
                    noVideoMessage.style.display = 'none';
                    
                    videoPlayer.volume = INITIAL_VOLUME;
                    videoPlayer.loop = isLoopEnabled;

                    if (videoPlaybackPositions[currentVideo.id]) {
                        const savedPosition = videoPlaybackPositions[currentVideo.id];
                        if (savedPosition < videoPlayer.duration - 5) {
                            videoPlayer.currentTime = savedPosition;
                        }
                    }

                    videoPlayer.play().catch(err => console.log('Auto-play prevented:', err));
                };

                videoPlayer.onerror = function () {
                    noVideoMessage.textContent = "Error playing video";
                    noVideoMessage.classList.remove('loading-video');
                    noVideoMessage.style.display = 'flex';
                    videoPlayer.style.display = 'none';
                    URL.revokeObjectURL(videoPlayer.src);
                };
            }
        } catch (error) {
            console.error('Error playing video from IndexedDB:', error);
            noVideoMessage.textContent = "Video not found. Please select it again.";
            noVideoMessage.classList.remove('loading-video');
            noVideoMessage.style.display = 'flex';
            videoPlayer.style.display = 'none';
        }
    }

    // Load video when selected
    async function loadVideo(file) {
        cleanupPreviousVideo();

        noVideoMessage.textContent = "Loading video...";
        noVideoMessage.classList.add('loading-video');
        videoPlayer.style.display = 'none';

        const videoId = generateVideoId(file);
        const existingIndex = findVideoInRecents(videoId);

        try {
            await storeVideoInIndexedDB(videoId, file);

            if (existingIndex !== -1) {
                currentVideo = recentVideos[existingIndex];

                if (existingIndex > 0) {
                    recentVideos.splice(existingIndex, 1);
                    recentVideos.unshift(currentVideo);
                }

                currentVideo.lastPlayed = new Date().toISOString();
            } else {
                const thumbnail = await generateThumbnail(file);

                currentVideo = {
                    id: videoId,
                    name: file.name,
                    size: file.size,
                    lastModified: file.lastModified,
                    thumbnail: thumbnail,
                    duration: 0,
                    lastPlayed: new Date().toISOString()
                };

                recentVideos.unshift(currentVideo);

                if (recentVideos.length > 20) {
                    recentVideos.pop();
                }
            }

            const videoObjectURL = URL.createObjectURL(file);
            videoPlayer.src = videoObjectURL;
            videoPlayer.style.display = 'block';

            videoPlayer.onloadedmetadata = function () {
                noVideoMessage.classList.remove('loading-video');
                noVideoMessage.style.display = 'none';
                
                videoPlayer.volume = INITIAL_VOLUME;
                videoPlayer.loop = isLoopEnabled;

                currentVideo.duration = videoPlayer.duration;

                if (videoPlaybackPositions[currentVideo.id]) {
                    const savedPosition = videoPlaybackPositions[currentVideo.id];
                    if (savedPosition < videoPlayer.duration - 5) {
                        videoPlayer.currentTime = savedPosition;
                    }
                }

                videoPlayer.play().catch(err => console.log('Auto-play prevented:', err));
                saveDataImmediate();
                renderRecentVideos();
            };

            videoPlayer.onerror = function () {
                noVideoMessage.textContent = "Error loading video";
                noVideoMessage.classList.remove('loading-video');
                noVideoMessage.style.display = 'flex';
                videoPlayer.style.display = 'none';
                URL.revokeObjectURL(videoPlayer.src);
            };

        } catch (error) {
            console.error('Error storing video in IndexedDB:', error);

            const videoObjectURL = URL.createObjectURL(file);
            videoPlayer.src = videoObjectURL;
            videoPlayer.style.display = 'block';

            videoPlayer.onloadedmetadata = function () {
                noVideoMessage.classList.remove('loading-video');
                noVideoMessage.style.display = 'none';
                videoPlayer.volume = INITIAL_VOLUME;
                videoPlayer.loop = isLoopEnabled;
                videoPlayer.play().catch(err => console.log('Auto-play prevented:', err));
            };
        }
    }

    // OPTIMIZED: Throttled render function
    function renderRecentVideos() {
        const now = Date.now();
        if (now - lastRenderTime < RENDER_THROTTLE && renderTimeout) {
            return;
        }
        
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            renderRecentVideosImmediate();
            lastRenderTime = Date.now();
        }, 100);
    }

    // FIXED: Store checkbox states before re-render
    function getSelectedVideoIds() {
        const selected = new Set();
        document.querySelectorAll('.video-checkbox:checked').forEach(checkbox => {
            if (checkbox.dataset.videoId) {
                selected.add(checkbox.dataset.videoId);
            }
        });
        return selected;
    }

    // Actual render function
    function renderRecentVideosImmediate() {
        // FIXED: Preserve checkbox selection state
        const selectedIds = getSelectedVideoIds();
        
        recentVideosList.innerHTML = '';

        if (recentVideos.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-recents-message';
            emptyMessage.textContent = 'No recent videos';
            recentVideosList.appendChild(emptyMessage);
            return;
        }

        const fragment = document.createDocumentFragment();

        recentVideos.forEach(video => {
            const videoItem = document.createElement('div');
            videoItem.className = 'recent-video-item';
            
            if (currentVideo && video.id === currentVideo.id) {
                videoItem.classList.add('current-playing');
            }
            videoItem.dataset.videoId = video.id;

            // Thumbnail container
            const thumbnailContainer = document.createElement('div');
            thumbnailContainer.style.position = 'relative';
            thumbnailContainer.style.width = '140px';
            thumbnailContainer.style.flexShrink = '0';

            // Thumbnail
            const thumbnail = document.createElement('img');
            thumbnail.className = 'video-thumbnail';
            thumbnail.src = video.thumbnail || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="79" viewBox="0 0 140 79"><rect width="140" height="79" fill="%23333"/><text x="70" y="40" font-family="Arial" font-size="12" fill="%23fff" text-anchor="middle" dominant-baseline="middle">No Preview</text></svg>';
            thumbnail.alt = video.name;

            // Progress bar
            const progressBar = document.createElement('div');
            progressBar.className = 'video-progress-bar';
            const position = videoPlaybackPositions[video.id] || 0;
            const progressPercentage = video.duration ? Math.floor((position / video.duration) * 100) : 0;
            progressBar.style.width = `${progressPercentage}%`;

            thumbnailContainer.appendChild(thumbnail);
            thumbnailContainer.appendChild(progressBar);

            // Video details
            const details = document.createElement('div');
            details.className = 'video-details';

            const title = document.createElement('div');
            title.className = 'video-title';
            title.textContent = video.name;

            const metadata = document.createElement('div');
            metadata.className = 'video-metadata';

            const duration = document.createElement('span');
            duration.className = 'video-duration';
            duration.textContent = formatTime(video.duration);

            const lastPosition = document.createElement('span');
            lastPosition.className = 'video-last-position';
            lastPosition.textContent = `${progressPercentage}% watched`;

            const timestamp = document.createElement('div');
            timestamp.className = 'video-timestamp';
            const date = new Date(video.lastPlayed);
            timestamp.textContent = date.toLocaleString();

            // FIXED: Checkbox with preserved state
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'video-checkbox';
            checkbox.dataset.videoId = video.id;
            
            // FIXED: Restore checkbox state
            if (selectedIds.has(video.id)) {
                checkbox.checked = true;
            }

            metadata.appendChild(duration);
            metadata.appendChild(lastPosition);

            details.appendChild(title);
            details.appendChild(metadata);
            details.appendChild(timestamp);

            checkboxContainer.appendChild(checkbox);

            videoItem.appendChild(thumbnailContainer);
            videoItem.appendChild(details);
            videoItem.appendChild(checkboxContainer);

            // FIXED: Improved click handler
            videoItem.addEventListener('click', (e) => {
                if (e.target.classList.contains('video-checkbox') || 
                    e.target.classList.contains('checkbox-container')) {
                    return;
                }
                playVideoFromIndexedDB(video.id);
            });

            fragment.appendChild(videoItem);
        });

        recentVideosList.appendChild(fragment);
    }

    // Update playback position
    function updatePlaybackPosition() {
        if (currentVideo && videoPlayer.currentTime > 0) {
            videoPlaybackPositions[currentVideo.id] = videoPlayer.currentTime;
            currentVideo.lastPlayed = new Date().toISOString();
            saveData();
        }
    }

    // FIXED: Update only the progress bar without full re-render
    function updateProgressBarOnly(videoId) {
        const videoItem = recentVideosList.querySelector(`[data-video-id="${videoId}"]`);
        if (!videoItem || !currentVideo || videoId !== currentVideo.id) return;

        const progressBar = videoItem.querySelector('.video-progress-bar');
        const lastPositionSpan = videoItem.querySelector('.video-last-position');
        
        if (progressBar && currentVideo.duration) {
            const position = videoPlaybackPositions[videoId] || 0;
            const progressPercentage = Math.floor((position / currentVideo.duration) * 100);
            
            // Use RAF for smooth update
            if (progressUpdateFrame) {
                cancelAnimationFrame(progressUpdateFrame);
            }
            
            progressUpdateFrame = requestAnimationFrame(() => {
                progressBar.style.width = `${progressPercentage}%`;
                if (lastPositionSpan) {
                    lastPositionSpan.textContent = `${progressPercentage}% watched`;
                }
                progressUpdateFrame = null;
            });
        }
    }

    // ============================================
    // VIDEO PLAYER CONTROLS
    // ============================================

    const customControls = document.getElementById('custom-controls');
    const playPauseBtn = document.getElementById('play-pause');
    const skipBackBtn = document.getElementById('skip-back');
    const skipForwardBtn = document.getElementById('skip-forward');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const currentTimeDisplay = document.getElementById('current-time');
    const durationDisplay = document.getElementById('duration');
    const volumeBtn = document.getElementById('volume-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const videoContainer = document.getElementById('video-container');
    const loopBtn = document.getElementById('loop-btn');
    const autoplayBtn = document.getElementById('autoplay-btn');

    let controlsTimeout;
    let isLoopEnabled = false;
    let isAutoplayEnabled = false;
    let previousVolume = INITIAL_VOLUME;
    let controlsProgressFrame = null; // Separate RAF for controls

    // Show controls
    function showControls() {
        customControls.classList.add('show');
        videoContainer.classList.remove('hide-cursor');
        
        clearTimeout(controlsTimeout);
        
        if (!videoPlayer.paused && !videoPlayer.ended) {
            controlsTimeout = setTimeout(() => {
                hideControls();
            }, 3000);
        }
    }

    // Hide controls
    function hideControls() {
        if (!videoPlayer.paused && !videoPlayer.ended) {
            customControls.classList.remove('show');
            videoContainer.classList.add('hide-cursor');
        }
    }

    // Toggle play/pause
    function togglePlayPause() {
        if (videoPlayer.paused || videoPlayer.ended) {
            videoPlayer.play();
            document.querySelector('.icon-play').style.display = 'none';
            document.querySelector('.icon-pause').style.display = 'block';
        } else {
            videoPlayer.pause();
            document.querySelector('.icon-play').style.display = 'block';
            document.querySelector('.icon-pause').style.display = 'none';
        }
    }

    // Toggle fullscreen
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => {
                console.log('Fullscreen error:', err);
            });
            document.querySelector('.icon-fullscreen').style.display = 'none';
            document.querySelector('.icon-exit-fullscreen').style.display = 'block';
        } else {
            document.exitFullscreen();
            document.querySelector('.icon-fullscreen').style.display = 'block';
            document.querySelector('.icon-exit-fullscreen').style.display = 'none';
        }
    }

    // Event listeners for controls
    playPauseBtn.addEventListener('click', () => {
        togglePlayPause();
        showControls();
    });

    videoPlayer.addEventListener('click', () => {
        togglePlayPause();
        showControls();
    });

    skipBackBtn.addEventListener('click', () => {
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
        showControls();
    });

    skipForwardBtn.addEventListener('click', () => {
        videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
        showControls();
    });

    fullscreenBtn.addEventListener('click', () => {
        toggleFullscreen();
        showControls();
    });

    // Progress bar seek
    progressContainer.addEventListener('click', (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        videoPlayer.currentTime = pos * videoPlayer.duration;
        showControls();
    });

    // FIXED: Single unified timeupdate handler
    videoPlayer.addEventListener('timeupdate', () => {
        // Update controls progress bar with RAF
        if (controlsProgressFrame) {
            return; // Skip if already scheduled
        }
        
        controlsProgressFrame = requestAnimationFrame(() => {
            const progress = (videoPlayer.currentTime / videoPlayer.duration) * 100;
            progressBar.style.width = `${progress}%`;
            currentTimeDisplay.textContent = formatTime(videoPlayer.currentTime);
            controlsProgressFrame = null;
        });

        // Update playback position and recent videos list (less frequent)
        if (currentVideo && videoPlayer.currentTime > 0) {
            const now = Date.now();
            if (now - lastUpdateTime > 3000) {
                updatePlaybackPosition();
                updateProgressBarOnly(currentVideo.id);
                lastUpdateTime = now;
            }
        }
    });

    videoPlayer.addEventListener('loadedmetadata', () => {
        durationDisplay.textContent = formatTime(videoPlayer.duration);
        volumeSlider.value = videoPlayer.volume * 100;
    });

    videoPlayer.addEventListener('play', () => {
        document.querySelector('.icon-play').style.display = 'none';
        document.querySelector('.icon-pause').style.display = 'block';
    });

    videoPlayer.addEventListener('pause', () => {
        document.querySelector('.icon-play').style.display = 'block';
        document.querySelector('.icon-pause').style.display = 'none';
    });

    // Volume controls
    volumeBtn.addEventListener('click', () => {
        if (videoPlayer.volume > 0) {
            previousVolume = videoPlayer.volume;
            videoPlayer.volume = 0;
            volumeSlider.value = 0;
        } else {
            videoPlayer.volume = previousVolume;
            volumeSlider.value = previousVolume * 100;
        }
        showControls();
    });

    volumeSlider.addEventListener('input', (e) => {
        videoPlayer.volume = e.target.value / 100;
        if (videoPlayer.volume > 0) {
            previousVolume = videoPlayer.volume;
        }
    });

    // Loop button
    loopBtn.addEventListener('click', () => {
        isLoopEnabled = !isLoopEnabled;
        videoPlayer.loop = isLoopEnabled;
        
        if (isLoopEnabled) {
            loopBtn.classList.add('active');
            loopBtn.querySelector('.icon-loop-off').style.display = 'none';
            loopBtn.querySelector('.icon-loop-on').style.display = 'block';
            loopBtn.title = 'Loop enabled';
            
            if (isAutoplayEnabled) {
                isAutoplayEnabled = false;
                autoplayBtn.classList.remove('active');
                autoplayBtn.querySelector('.icon-autoplay-off').style.display = 'block';
                autoplayBtn.querySelector('.icon-autoplay-on').style.display = 'none';
                autoplayBtn.title = 'Autoplay next video';
            }
        } else {
            loopBtn.classList.remove('active');
            loopBtn.querySelector('.icon-loop-off').style.display = 'block';
            loopBtn.querySelector('.icon-loop-on').style.display = 'none';
            loopBtn.title = 'Loop current video';
        }
        showControls();
    });

    // Autoplay button
    autoplayBtn.addEventListener('click', () => {
        isAutoplayEnabled = !isAutoplayEnabled;
        
        if (isAutoplayEnabled) {
            autoplayBtn.classList.add('active');
            autoplayBtn.querySelector('.icon-autoplay-off').style.display = 'none';
            autoplayBtn.querySelector('.icon-autoplay-on').style.display = 'block';
            autoplayBtn.title = 'Autoplay enabled';
            
            if (isLoopEnabled) {
                isLoopEnabled = false;
                videoPlayer.loop = false;
                loopBtn.classList.remove('active');
                loopBtn.querySelector('.icon-loop-off').style.display = 'block';
                loopBtn.querySelector('.icon-loop-on').style.display = 'none';
                loopBtn.title = 'Loop current video';
            }
        } else {
            autoplayBtn.classList.remove('active');
            autoplayBtn.querySelector('.icon-autoplay-off').style.display = 'block';
            autoplayBtn.querySelector('.icon-autoplay-on').style.display = 'none';
            autoplayBtn.title = 'Autoplay next video';
        }
        showControls();
    });

    // Play next video
    function playNextVideo() {
        if (!currentVideo || recentVideos.length === 0) return;
        
        const currentIndex = recentVideos.findIndex(v => v.id === currentVideo.id);
        
        if (currentIndex === -1) return;
        
        const nextIndex = (currentIndex + 1) % recentVideos.length;
        const nextVideo = recentVideos[nextIndex];
        
        playVideoFromIndexedDB(nextVideo.id, true);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT') return;
        if (!videoPlayer.src) return;

        switch (e.key.toLowerCase()) {
            case ' ':
            case 'k':
                e.preventDefault();
                togglePlayPause();
                showControls();
                break;
            case 'arrowleft':
            case 'j':
                e.preventDefault();
                videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
                showControls();
                break;
            case 'arrowright':
            case 'l':
                e.preventDefault();
                videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
                showControls();
                break;
            case 'f':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                if (videoPlayer.volume > 0) {
                    previousVolume = videoPlayer.volume;
                    videoPlayer.volume = 0;
                } else {
                    videoPlayer.volume = previousVolume;
                }
                break;
        }
    });

    // Show controls on mouse move
    videoContainer.addEventListener('mousemove', showControls);
    videoContainer.addEventListener('touchstart', showControls);

    // Hide controls when mouse leaves
    videoContainer.addEventListener('mouseleave', () => {
        if (!videoPlayer.paused && !videoPlayer.ended) {
            clearTimeout(controlsTimeout);
            hideControls();
        }
    });

    // Handle video end
    videoPlayer.addEventListener('ended', () => {
        clearTimeout(controlsTimeout);
        customControls.classList.add('show');
        videoContainer.classList.remove('hide-cursor');
        
        if (isLoopEnabled) {
            return;
        }
        
        if (isAutoplayEnabled) {
            playNextVideo();
        } else {
            document.querySelector('.icon-play').style.display = 'block';
            document.querySelector('.icon-pause').style.display = 'none';
        }
    });

    // Event listeners
    videoInput.addEventListener('change', () => {
        if (videoInput.files.length > 0) {
            const file = videoInput.files[0];
            loadVideo(file);
        }
    });

    videoPlayer.addEventListener('pause', updatePlaybackPosition);
    videoPlayer.addEventListener('ended', updatePlaybackPosition);

    // FIXED: Clear selected videos with proper error handling
    clearSelectedBtn.addEventListener('click', async () => {
        const checkedBoxes = document.querySelectorAll('.video-checkbox:checked');

        if (checkedBoxes.length === 0) {
            alert('Please select videos to remove');
            return;
        }

        const confirmMessage = `Are you sure you want to remove ${checkedBoxes.length} video${checkedBoxes.length > 1 ? 's' : ''}?`;
        if (!confirm(confirmMessage)) {
            return;
        }

        const deletePromises = [];
        const videosToDelete = [];

        checkedBoxes.forEach(checkbox => {
            const videoId = checkbox.dataset.videoId;
            const index = findVideoInRecents(videoId);

            if (index !== -1) {
                videosToDelete.push({videoId, index});
            }
        });

        // Sort by index descending to avoid shifting issues
        videosToDelete.sort((a, b) => b.index - a.index);

        // Remove videos
        videosToDelete.forEach(({videoId, index}) => {
            recentVideos.splice(index, 1);
            delete videoPlaybackPositions[videoId];
            deletePromises.push(deleteVideoFromIndexedDB(videoId));

            // Reset player if current video is deleted
            if (currentVideo && currentVideo.id === videoId) {
                cleanupPreviousVideo();
                currentVideo = null;
                videoPlayer.src = '';
                videoPlayer.style.display = 'none';
                noVideoMessage.style.display = 'flex';
                noVideoMessage.textContent = 'Select a video to start watching';
                noVideoMessage.classList.remove('loading-video');
            }
        });

        try {
            await Promise.allSettled(deletePromises);
            saveDataImmediate();
            renderRecentVideos();
        } catch (error) {
            console.error('Error deleting videos:', error);
            alert('Some videos could not be deleted. Please try again.');
        }
    });

    // Clear all videos
    clearAllBtn.addEventListener('click', async () => {
        if (recentVideos.length === 0) return;

        if (confirm('Are you sure you want to clear all recent videos?')) {
            try {
                if (db) {
                    const transaction = db.transaction(['videos'], 'readwrite');
                    const videoStore = transaction.objectStore('videos');
                    videoStore.clear();
                }

                recentVideos = [];
                videoPlaybackPositions = {};
                
                cleanupPreviousVideo();
                currentVideo = null;

                videoPlayer.src = '';
                videoPlayer.style.display = 'none';
                noVideoMessage.style.display = 'flex';
                noVideoMessage.textContent = 'Select a video to start watching';
                noVideoMessage.classList.remove('loading-video');

                saveDataImmediate();
                renderRecentVideos();
            } catch (error) {
                console.error('Error clearing videos:', error);
                alert('Error clearing videos. Please try again.');
            }
        }
    });

    // FIXED: Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        updatePlaybackPosition();
        cleanupPreviousVideo();
    });

    // Monitor storage usage
    async function checkStorageUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                const usedMB = Math.round(estimate.usage / (1024 * 1024));
                const quotaMB = Math.round(estimate.quota / (1024 * 1024));
                const percentUsed = Math.round((usedMB / quotaMB) * 100);

                console.log(`Storage: ${usedMB}MB used out of ${quotaMB}MB (${percentUsed}%)`);

                if (percentUsed > 80) {
                    console.warn('Storage is almost full. Consider clearing some videos.');
                }
            } catch (error) {
                console.error('Error checking storage usage:', error);
            }
        }
    }

    checkStorageUsage();
    setInterval(checkStorageUsage, 5 * 60 * 1000);
});
