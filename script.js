// Updated script.js with IndexedDB storage solution

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
    let db; // IndexedDB reference

    // Initialize the IndexedDB
    initIndexedDB();

    function initIndexedDB() {
        const request = indexedDB.open('VideoPlayerDB', 1);
        
        request.onerror = function(event) {
            console.error('IndexedDB error:', event.target.errorCode);
            // Fall back to localStorage only mode
            loadSavedData();
        };
        
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            
            // Create object stores
            if (!db.objectStoreNames.contains('videos')) {
                const videoStore = db.createObjectStore('videos', { keyPath: 'id' });
                videoStore.createIndex('lastPlayed', 'lastPlayed', { unique: false });
            }
        };
        
        request.onsuccess = function(event) {
            db = event.target.result;
            console.log('IndexedDB initialized successfully');
            
            // Load saved metadata and then check for videos in IndexedDB
            loadSavedData();
            
            // Database connection closed unexpectedly
            db.onversionchange = function() {
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
            
            // Verify each video in recentVideos exists in IndexedDB
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
        if (!db) return;
        
        const transaction = db.transaction(['videos'], 'readonly');
        const videoStore = transaction.objectStore('videos');
        const pendingChecks = recentVideos.length;
        let completedChecks = 0;
        let validVideos = [];
        
        recentVideos.forEach((video, index) => {
            const request = videoStore.get(video.id);
            
            request.onsuccess = function(event) {
                completedChecks++;
                
                if (event.target.result) {
                    // Video exists in IndexedDB
                    validVideos.push(video);
                } else {
                    console.log(`Video ${video.name} not found in IndexedDB, removing from recents`);
                }
                
                // When all checks are done
                if (completedChecks === pendingChecks) {
                    recentVideos = validVideos;
                    saveData();
                    renderRecentVideos();
                }
            };
            
            request.onerror = function() {
                completedChecks++;
                console.error(`Error checking video ${video.name} in IndexedDB`);
                
                // When all checks are done
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
        if (isNaN(seconds) || seconds === Infinity) return '00:00';
        
        seconds = Math.floor(seconds);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // Generate a thumbnail for the video
    function generateThumbnail(videoFile) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            
            video.onloadedmetadata = function() {
                video.currentTime = Math.min(1, video.duration / 4);
            };
            
            video.onseeked = function() {
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 180;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
                URL.revokeObjectURL(video.src);
                resolve(thumbnail);
            };
            
            video.onerror = function() {
                // In case of error, provide a default thumbnail
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
            
            // Check if video already exists
            const checkTransaction = db.transaction(['videos'], 'readonly');
            const checkStore = checkTransaction.objectStore('videos');
            const checkRequest = checkStore.get(videoId);
            
            checkRequest.onsuccess = function(event) {
                if (event.target.result) {
                    // Video already exists, resolve immediately
                    resolve(true);
                    return;
                }
                
                // Video doesn't exist, add it
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
                
                request.onsuccess = function() {
                    console.log(`Video ${file.name} stored in IndexedDB`);
                    resolve(true);
                };
                
                request.onerror = function(event) {
                    console.error('Error storing video in IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
                
                transaction.oncomplete = function() {
                    console.log('Transaction completed');
                };
                
                transaction.onerror = function(event) {
                    console.error('Transaction error:', event.target.error);
                };
            };
            
            checkRequest.onerror = function(event) {
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
            
            request.onsuccess = function(event) {
                const videoData = event.target.result;
                if (videoData) {
                    resolve(videoData.file);
                } else {
                    reject('Video not found in IndexedDB');
                }
            };
            
            request.onerror = function(event) {
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
            
            request.onsuccess = function() {
                resolve(true);
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }

    // Load a video from IndexedDB and play it
    async function playVideoFromIndexedDB(videoId) {
        try {
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
                
                // Move to the top of recents list if not already there
                if (videoIndex > 0) {
                    recentVideos.splice(videoIndex, 1);
                    recentVideos.unshift(currentVideo);
                }
                
                // Update last played timestamp
                currentVideo.lastPlayed = new Date().toISOString();
                
                // Setup video playback
                const videoObjectURL = URL.createObjectURL(videoFile);
                videoPlayer.src = videoObjectURL;
                videoPlayer.style.display = 'block';
                
                videoPlayer.onloadedmetadata = function() {
                    // Remove loading state
                    noVideoMessage.classList.remove('loading-video');
                    noVideoMessage.style.display = 'none';
                    
                    // Set playback position if available
                    if (videoPlaybackPositions[currentVideo.id]) {
                        const savedPosition = videoPlaybackPositions[currentVideo.id];
                        // Only restore position if it's not at the end of the video
                        if (savedPosition < videoPlayer.duration - 5) {
                            videoPlayer.currentTime = savedPosition;
                        }
                    }
                    
                    videoPlayer.play().catch(err => console.log('Auto-play prevented:', err));
                    saveData();
                    renderRecentVideos();
                };
                
                videoPlayer.onerror = function() {
                    noVideoMessage.textContent = "Error playing video";
                    noVideoMessage.classList.remove('loading-video');
                    noVideoMessage.style.display = 'flex';
                    videoPlayer.style.display = 'none';
                    URL.revokeObjectURL(videoPlayer.src);
                };
                
                // Clean up object URL when video is done
                videoPlayer.onended = function() {
                    updatePlaybackPosition();
                    // We don't revoke URL here as user might want to replay
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
                
                // Move to the top of recents list
                if (existingIndex > 0) {
                    recentVideos.splice(existingIndex, 1);
                    recentVideos.unshift(currentVideo);
                }
                
                // Update last played timestamp
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
                
                // Add to the beginning of recents
                recentVideos.unshift(currentVideo);
                
                // Limit recent videos to 20
                if (recentVideos.length > 20) {
                    const removedVideo = recentVideos.pop();
                    // No need to delete from IndexedDB as we might want to keep them cached
                }
            }
            
            // Setup video playback
            const videoObjectURL = URL.createObjectURL(file);
            videoPlayer.src = videoObjectURL;
            videoPlayer.style.display = 'block';
            
            videoPlayer.onloadedmetadata = function() {
                // Remove loading state
                noVideoMessage.classList.remove('loading-video');
                noVideoMessage.style.display = 'none';
                
                currentVideo.duration = videoPlayer.duration;
                
                // Set playback position if available
                if (videoPlaybackPositions[currentVideo.id]) {
                    const savedPosition = videoPlaybackPositions[currentVideo.id];
                    // Only restore position if it's not at the end of the video
                    if (savedPosition < videoPlayer.duration - 5) {
                        videoPlayer.currentTime = savedPosition;
                    }
                }
                
                videoPlayer.play().catch(err => console.log('Auto-play prevented:', err));
                saveData();
                renderRecentVideos();
            };
            
            videoPlayer.onerror = function() {
                noVideoMessage.textContent = "Error loading video";
                noVideoMessage.classList.remove('loading-video');
                noVideoMessage.style.display = 'flex';
                videoPlayer.style.display = 'none';
                URL.revokeObjectURL(videoPlayer.src);
            };
            
            // Clean up object URL when source changes
            const currentSrc = videoPlayer.src;
            videoPlayer.addEventListener('emptied', function() {
                if (videoPlayer.src !== currentSrc) {
                    URL.revokeObjectURL(currentSrc);
                }
            }, { once: true });
            
        } catch (error) {
            console.error('Error storing video in IndexedDB:', error);
            
            // If IndexedDB fails, fall back to direct playback without storing
            const videoObjectURL = URL.createObjectURL(file);
            videoPlayer.src = videoObjectURL;
            videoPlayer.style.display = 'block';
            
            videoPlayer.onloadedmetadata = function() {
                noVideoMessage.classList.remove('loading-video');
                noVideoMessage.style.display = 'none';
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
            if (currentVideo && video.id === currentVideo.id) {
                videoItem.classList.add('selected');
            }
            videoItem.dataset.videoId = video.id;
            
            // Thumbnail container
            const thumbnailContainer = document.createElement('div');
            thumbnailContainer.style.position = 'relative';
            thumbnailContainer.style.width = '140px';
            
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
                videoItem.classList.toggle('selected');
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
            
            // Click event to play this video directly from IndexedDB
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

    // Event Listeners
    videoInput.addEventListener('change', () => {
        if (videoInput.files.length > 0) {
            const file = videoInput.files[0];
            loadVideo(file);
        }
    });

    // Update playback position periodically and when video is paused
    videoPlayer.addEventListener('timeupdate', () => {
        if (currentVideo && videoPlayer.currentTime > 0) {
            // Update position every 5 seconds to avoid excessive storage writes
            if (Math.floor(videoPlayer.currentTime) % 5 === 0) {
                updatePlaybackPosition();
                renderRecentVideos(); // Update the UI to show current position
            }
        }
    });

    videoPlayer.addEventListener('pause', updatePlaybackPosition);
    videoPlayer.addEventListener('ended', updatePlaybackPosition);

    // Clear selected videos
    clearSelectedBtn.addEventListener('click', async () => {
        const selectedItems = document.querySelectorAll('.recent-video-item.selected');
        
        if (selectedItems.length === 0) return;
        
        const deletePromises = [];
        
        selectedItems.forEach(item => {
            const videoId = item.dataset.videoId;
            const index = findVideoInRecents(videoId);
            
            if (index !== -1) {
                // Remove from recents
                recentVideos.splice(index, 1);
                
                // Remove playback position
                delete videoPlaybackPositions[videoId];
                
                // Delete from IndexedDB (we'll keep this non-blocking)
                deletePromises.push(deleteVideoFromIndexedDB(videoId));
                
                // If this is the current video, reset the player
                if (currentVideo && currentVideo.id === videoId) {
                    currentVideo = null;
                    URL.revokeObjectURL(videoPlayer.src);
                    videoPlayer.src = '';
                    videoPlayer.style.display = 'none';
                    noVideoMessage.style.display = 'flex';
                    noVideoMessage.textContent = 'Select a video to start watching';
                    noVideoMessage.classList.remove('loading-video');
                }
            }
        });
        
        // Wait for all deletes to complete, but don't block the UI
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
                    // Clear all videos from IndexedDB
                    const transaction = db.transaction(['videos'], 'readwrite');
                    const videoStore = transaction.objectStore('videos');
                    videoStore.clear();
                }
                
                recentVideos = [];
                videoPlaybackPositions = {};
                currentVideo = null;
                
                // Reset video player
                if (videoPlayer.src) {
                    URL.revokeObjectURL(videoPlayer.src);
                }
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

    // Before unloading the page, save the current playback position
    window.addEventListener('beforeunload', updatePlaybackPosition);

    // Calculate and monitor storage usage
    async function checkStorageUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                const usedMB = Math.round(estimate.usage / (1024 * 1024));
                const quotaMB = Math.round(estimate.quota / (1024 * 1024));
                const percentUsed = Math.round((usedMB / quotaMB) * 100);
                
                console.log(`Storage: ${usedMB}MB used out of ${quotaMB}MB (${percentUsed}%)`);
                
                // If storage is almost full (>80%), warn the user
                if (percentUsed > 80) {
                    console.warn('Storage is almost full. Consider clearing some videos.');
                }
            } catch (error) {
                console.error('Error checking storage usage:', error);
            }
        }
    }
    
    // Check storage usage periodically
    checkStorageUsage();
    setInterval(checkStorageUsage, 5 * 60 * 1000); // Check every 5 minutes
});