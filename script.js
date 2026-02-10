// Optimized script.js - Clean, consistent, and bug-free

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
    const INITIAL_VOLUME = 0.1; // Consistent initial volume
    let db; // IndexedDB reference

    // Initialize the IndexedDB
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

    // Verify that each video in recentVideos exists in IndexedDB
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
                    saveData();
                    renderRecentVideos();
                }
            };

            request.onerror = function () {
                completedChecks++;
                console.error(`Error checking video ${video.name} in IndexedDB`);

                if (completedChecks === pendingChecks) {
                    recentVideos = validVideos;
                    saveData();
                    renderRecentVideos();
                }
            };
        });
    }

    // Save data to localStorage
    function saveData() {
        const data = {
            positions: videoPlaybackPositions,
            recents: recentVideos
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    }

    // Generate a unique ID for a video file
    function generateVideoId(file) {
        return `${file.name}-${file.size}-${file.lastModified}`;
    }

    // Format time (seconds) to MM:SS or HH:MM:SS
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

    // Generate a thumbnail for the video
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

    // Find video in recents by ID
    function findVideoInRecents(videoId) {
        return recentVideos.findIndex(video => video.id === videoId);
    }

    // Store a video file in IndexedDB
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

    // Get a video file from IndexedDB
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

    // Delete a video from IndexedDB
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

    // Clean up previous video
    function cleanupPreviousVideo() {
        if (videoPlayer.src && videoPlayer.src.startsWith('blob:')) {
            URL.revokeObjectURL(videoPlayer.src);
        }
        videoPlayer.pause();
        videoPlayer.currentTime = 0;
    }

    // Load a video from IndexedDB and play it
    async function playVideoFromIndexedDB(videoId, isAutoplayTriggered = false) {
        try {
            // Clean up previous video
            cleanupPreviousVideo();

            // Show loading state
            noVideoMessage.textContent = "Loading video...";
            noVideoMessage.classList.add('loading-video');
            videoPlayer.style.display = 'none';

            // Get the video file from IndexedDB
            const videoFile = await getVideoFromIndexedDB(videoId);

            // Find the video in recents
            const videoIndex = findVideoInRecents(videoId);
            if (videoIndex !== -1) {
                currentVideo = recentVideos[videoIndex];

                // Only move to top and update timestamp if NOT triggered by autoplay
                if (!isAutoplayTriggered) {
                    if (videoIndex > 0) {
                        recentVideos.splice(videoIndex, 1);
                        recentVideos.unshift(currentVideo);
                    }

                    currentVideo.lastPlayed = new Date().toISOString();
                    saveData();
                    renderRecentVideos();
                }

                // Setup video playback
                const videoObjectURL = URL.createObjectURL(videoFile);
                videoPlayer.src = videoObjectURL;
                videoPlayer.style.display = 'block';

                videoPlayer.onloadedmetadata = function () {
                    noVideoMessage.classList.remove('loading-video');
                    noVideoMessage.style.display = 'none';
                    
                    // Set consistent initial volume
                    videoPlayer.volume = INITIAL_VOLUME;
                    
                    // Apply loop state
                    videoPlayer.loop = isLoopEnabled;

                    // Set playback position if available
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

    // Load a video when selected from file input
    async function loadVideo(file) {
        // Clean up previous video
        cleanupPreviousVideo();

        // Show loading state
        noVideoMessage.textContent = "Loading video...";
        noVideoMessage.classList.add('loading-video');
        videoPlayer.style.display = 'none';

        const videoId = generateVideoId(file);
        const existingIndex = findVideoInRecents(videoId);

        try {
            // Store the video in IndexedDB
            await storeVideoInIndexedDB(videoId, file);

            // Check if this video already exists in recents
            if (existingIndex !== -1) {
                currentVideo = recentVideos[existingIndex];

                if (existingIndex > 0) {
                    recentVideos.splice(existingIndex, 1);
                    recentVideos.unshift(currentVideo);
                }

                currentVideo.lastPlayed = new Date().toISOString();
            } else {
                // Create new video entry
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

                // Limit recent videos to 20
                if (recentVideos.length > 20) {
                    recentVideos.pop();
                }
            }

            // Setup video playback
            const videoObjectURL = URL.createObjectURL(file);
            videoPlayer.src = videoObjectURL;
            videoPlayer.style.display = 'block';

            videoPlayer.onloadedmetadata = function () {
                noVideoMessage.classList.remove('loading-video');
                noVideoMessage.style.display = 'none';
                
                // Set consistent initial volume
                videoPlayer.volume = INITIAL_VOLUME;
                
                // Apply loop state
                videoPlayer.loop = isLoopEnabled;

                currentVideo.duration = videoPlayer.duration;

                // Set playback position if available
                if (videoPlaybackPositions[currentVideo.id]) {
                    const savedPosition = videoPlaybackPositions[currentVideo.id];
                    if (savedPosition < videoPlayer.duration - 5) {
                        videoPlayer.currentTime = savedPosition;
                    }
                }

                videoPlayer.play().catch(err => console.log('Auto-play prevented:', err));
                saveData();
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

            // If IndexedDB fails, fall back to direct playback
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

    // Render the list of recent videos
    function renderRecentVideos() {
        recentVideosList.innerHTML = '';

        if (recentVideos.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-recents-message';
            emptyMessage.textContent = 'No recent videos';
            recentVideosList.appendChild(emptyMessage);
            return;
        }

        recentVideos.forEach(video => {
            const videoItem = document.createElement('div');
            videoItem.className = 'recent-video-item';
            
            // Use separate class for currently playing video
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

            // Video details container
            const details = document.createElement('div');
            details.className = 'video-details';

            // Video title
            const title = document.createElement('div');
            title.className = 'video-title';
            title.textContent = video.name;

            // Video metadata
            const metadata = document.createElement('div');
            metadata.className = 'video-metadata';

            const duration = document.createElement('span');
            duration.className = 'video-duration';
            duration.textContent = formatTime(video.duration);

            const lastPosition = document.createElement('span');
            lastPosition.className = 'video-last-position';
            lastPosition.textContent = `${progressPercentage}% watched`;

            // Timestamp
            const timestamp = document.createElement('div');
            timestamp.className = 'video-timestamp';
            const date = new Date(video.lastPlayed);
            timestamp.textContent = date.toLocaleString();

            // Checkbox for selection
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'video-checkbox';
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                // Checkbox manages its own state
            });

            // Append all elements
            metadata.appendChild(duration);
            metadata.appendChild(lastPosition);

            details.appendChild(title);
            details.appendChild(metadata);
            details.appendChild(timestamp);

            checkboxContainer.appendChild(checkbox);

            videoItem.appendChild(thumbnailContainer);
            videoItem.appendChild(details);
            videoItem.appendChild(checkboxContainer);

            // Click event to play this video
            videoItem.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    playVideoFromIndexedDB(video.id);
                }
            });

            recentVideosList.appendChild(videoItem);
        });
    }

    // Update video playback position
    function updatePlaybackPosition() {
        if (currentVideo && videoPlayer.currentTime > 0) {
            videoPlaybackPositions[currentVideo.id] = videoPlayer.currentTime;
            currentVideo.lastPlayed = new Date().toISOString();
            saveData();
        }
    }

    // ============================================
    // CUSTOM VIDEO PLAYER CONTROLS
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

    // Session-based settings (reset on page refresh)
    let isLoopEnabled = false;
    let isAutoplayEnabled = false;

    let controlsTimeout;
    let previousVolume = INITIAL_VOLUME; // Store previous volume before muting

    // Initialize volume slider to match INITIAL_VOLUME
    volumeSlider.value = INITIAL_VOLUME * 100;

    // Show controls temporarily (YouTube-like behavior)
    function showControls() {
        customControls.classList.add('show');
        videoContainer.classList.remove('hide-cursor');

        clearTimeout(controlsTimeout);
        
        if (!videoPlayer.paused && !videoPlayer.ended) {
            controlsTimeout = setTimeout(() => {
                customControls.classList.remove('show');
                videoContainer.classList.add('hide-cursor');
            }, 3000);
        }
    }
    
    // Hide controls immediately
    function hideControls() {
        if (!videoPlayer.paused && !videoPlayer.ended) {
            customControls.classList.remove('show');
            videoContainer.classList.add('hide-cursor');
        }
    }

    // Play/Pause Toggle
    playPauseBtn.addEventListener('click', togglePlayPause);
    
    // Click on video container to toggle play/pause
    videoContainer.addEventListener('click', (e) => {
        if (e.target === videoPlayer || e.target === videoContainer) {
            togglePlayPause();
        }
    });

    function togglePlayPause() {
        if (videoPlayer.paused || videoPlayer.ended) {
            videoPlayer.play();
        } else {
            videoPlayer.pause();
        }
    }

    // Update play/pause icon on play/pause events
    videoPlayer.addEventListener('play', () => {
        document.querySelector('.icon-play').style.display = 'none';
        document.querySelector('.icon-pause').style.display = 'block';
        showControls();
    });

    videoPlayer.addEventListener('pause', () => {
        document.querySelector('.icon-play').style.display = 'block';
        document.querySelector('.icon-pause').style.display = 'none';
        clearTimeout(controlsTimeout);
        customControls.classList.add('show');
        videoContainer.classList.remove('hide-cursor');
    });

    // Skip Backward 10 seconds
    skipBackBtn.addEventListener('click', () => {
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
        showControls();
    });

    // Skip Forward 10 seconds
    skipForwardBtn.addEventListener('click', () => {
        videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
        showControls();
    });

    // Update Progress Bar
    videoPlayer.addEventListener('timeupdate', () => {
        const percent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        progressBar.style.width = percent + '%';
        currentTimeDisplay.textContent = formatTime(videoPlayer.currentTime);

        if (!isNaN(videoPlayer.duration)) {
            durationDisplay.textContent = formatTime(videoPlayer.duration);
        }
    });

    // Click on progress bar to seek
    progressContainer.addEventListener('click', (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        videoPlayer.currentTime = percent * videoPlayer.duration;
        showControls();
    });

    // Volume Control
    volumeSlider.addEventListener('input', (e) => {
        const newVolume = e.target.value / 100;
        videoPlayer.volume = newVolume;
        if (newVolume > 0) {
            previousVolume = newVolume;
        }
        updateVolumeIcon();
    });

    // Update volume icon based on volume level
    function updateVolumeIcon() {
        const volumeIcon = volumeBtn.querySelector('.icon-volume');

        if (videoPlayer.volume === 0) {
            volumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        } else if (videoPlayer.volume < 0.5) {
            volumeIcon.innerHTML = '<path d="M7 9v6h4l5 5V4l-5 5H7z"/>';
        } else {
            volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
        }
    }

    // Sync volume slider when video volume changes
    videoPlayer.addEventListener('volumechange', () => {
        volumeSlider.value = videoPlayer.volume * 100;
        updateVolumeIcon();
    });

    volumeBtn.addEventListener('click', () => {
        if (videoPlayer.volume > 0) {
            previousVolume = videoPlayer.volume;
            videoPlayer.volume = 0;
        } else {
            videoPlayer.volume = previousVolume;
        }
    });

    // Initialize volume icon on load
    updateVolumeIcon();

    // Fullscreen Toggle
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    function toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement) {
            if (videoContainer.requestFullscreen) {
                videoContainer.requestFullscreen();
            } else if (videoContainer.webkitRequestFullscreen) {
                videoContainer.webkitRequestFullscreen();
            } else if (videoContainer.mozRequestFullScreen) {
                videoContainer.mozRequestFullScreen();
            }
            document.querySelector('.icon-fullscreen').style.display = 'none';
            document.querySelector('.icon-exit-fullscreen').style.display = 'block';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            }
            document.querySelector('.icon-fullscreen').style.display = 'block';
            document.querySelector('.icon-exit-fullscreen').style.display = 'none';
        }
    }

    // Loop Toggle Button
    loopBtn.addEventListener('click', () => {
        isLoopEnabled = !isLoopEnabled;
        videoPlayer.loop = isLoopEnabled;
        
        if (isLoopEnabled) {
            loopBtn.classList.add('active');
            loopBtn.querySelector('.icon-loop-off').style.display = 'none';
            loopBtn.querySelector('.icon-loop-on').style.display = 'block';
            loopBtn.title = 'Loop enabled - Click to disable';
            
            // If autoplay is enabled, disable it
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

    // Autoplay Next Toggle Button
    autoplayBtn.addEventListener('click', () => {
        isAutoplayEnabled = !isAutoplayEnabled;
        
        if (isAutoplayEnabled) {
            autoplayBtn.classList.add('active');
            autoplayBtn.querySelector('.icon-autoplay-off').style.display = 'none';
            autoplayBtn.querySelector('.icon-autoplay-on').style.display = 'block';
            autoplayBtn.title = 'Autoplay enabled - Click to disable';
            
            // If loop is enabled, disable it
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

    // Play next video in the recent videos list
    function playNextVideo() {
        if (!currentVideo || recentVideos.length === 0) return;
        
        const currentIndex = recentVideos.findIndex(v => v.id === currentVideo.id);
        
        if (currentIndex === -1) return;
        
        // Get next video (loop back to first if at the end)
        const nextIndex = (currentIndex + 1) % recentVideos.length;
        const nextVideo = recentVideos[nextIndex];
        
        // Play the next video with autoplay flag
        playVideoFromIndexedDB(nextVideo.id, true);
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in input fields
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
        
        // Handle based on loop/autoplay settings
        if (isLoopEnabled) {
            // Loop is handled by videoPlayer.loop
            return;
        }
        
        if (isAutoplayEnabled) {
            playNextVideo();
        } else {
            document.querySelector('.icon-play').style.display = 'block';
            document.querySelector('.icon-pause').style.display = 'none';
        }
    });

    // Event Listeners
    videoInput.addEventListener('change', () => {
        if (videoInput.files.length > 0) {
            const file = videoInput.files[0];
            loadVideo(file);
        }
    });

    // Update playback position periodically
    videoPlayer.addEventListener('timeupdate', () => {
        if (currentVideo && videoPlayer.currentTime > 0) {
            // Update every 5 seconds
            if (Math.floor(videoPlayer.currentTime) % 5 === 0) {
                updatePlaybackPosition();
                renderRecentVideos();
            }
        }
    });

    videoPlayer.addEventListener('pause', updatePlaybackPosition);
    videoPlayer.addEventListener('ended', updatePlaybackPosition);

    // Clear selected videos
    clearSelectedBtn.addEventListener('click', async () => {
        const checkedBoxes = document.querySelectorAll('.video-checkbox:checked');

        if (checkedBoxes.length === 0) return;

        const deletePromises = [];

        checkedBoxes.forEach(checkbox => {
            const videoItem = checkbox.closest('.recent-video-item');
            const videoId = videoItem.dataset.videoId;
            const index = findVideoInRecents(videoId);

            if (index !== -1) {
                recentVideos.splice(index, 1);
                delete videoPlaybackPositions[videoId];
                deletePromises.push(deleteVideoFromIndexedDB(videoId));

                // If this is the current video, reset the player
                if (currentVideo && currentVideo.id === videoId) {
                    cleanupPreviousVideo();
                    currentVideo = null;
                    videoPlayer.src = '';
                    videoPlayer.style.display = 'none';
                    noVideoMessage.style.display = 'flex';
                    noVideoMessage.textContent = 'Select a video to start watching';
                    noVideoMessage.classList.remove('loading-video');
                }
            }
        });

        Promise.allSettled(deletePromises)
            .then(results => {
                results.forEach(result => {
                    if (result.status === 'rejected') {
                        console.error('Error deleting video from IndexedDB:', result.reason);
                    }
                });
            });

        saveData();
        renderRecentVideos();
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

                saveData();
                renderRecentVideos();
            } catch (error) {
                console.error('Error clearing videos:', error);
                alert('Error clearing videos. Please try again.');
            }
        }
    });

    // Save position before page unload
    window.addEventListener('beforeunload', updatePlaybackPosition);

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
