document.addEventListener("DOMContentLoaded", function() {
    const audioPlayer = document.getElementById("audioPlayer");
    const volumeSlider = document.getElementById("masterVolume");
    const volumeValue = document.querySelector(".volume-value");
    let currentPlayingItem = null;
    const SKIP_TIME = 30; // 30 seconds

    // Theme toggle functionality
    const themeToggle = document.querySelector(".theme-toggle-slider");
    
    // Get theme from localStorage or default to dark
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    
    // Toggle theme function
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
    }
    
    // Add click event to theme toggle
    themeToggle.addEventListener("click", toggleTheme);
    
    // Format time as MM:SS
    function formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Reset all items to initial state
    function resetAllItems() {
        document.querySelectorAll(".file-item").forEach(item => {
            const iconElement = item.querySelector(".file-icon svg");
            const timeIndicator = item.querySelector(".time-indicator");
            
            // Reset expanded state
            item.classList.remove("expanded");

            if (iconElement) {
                iconElement.setAttribute("data-icon", "play");
            }

            if (timeIndicator) {
                timeIndicator.style.display = "none";
                timeIndicator.textContent = "00:00 / 00:00";
            }

            // Reset play button in expanded player
            const expandedPlayBtn = item.querySelector(".play-pause-btn svg");
            if (expandedPlayBtn) {
                expandedPlayBtn.setAttribute("data-icon", "play");
            }

            // Reset progress bar
            const progressFilled = item.querySelector(".progress-filled");
            if (progressFilled) {
                progressFilled.style.width = "0%";
            }
        });
        currentPlayingItem = null;
    }

    // Play a track
    function playTrack(item) {
        const link = item.querySelector(".episode-link");
        const src = link.getAttribute("href");
        const iconElement = item.querySelector(".file-icon svg");
        const timeIndicator = item.querySelector(".time-indicator");
        const expandedPlayBtn = item.querySelector(".play-pause-btn svg");

        // If clicking on currently playing item
        if (currentPlayingItem === item) {
            if (audioPlayer.paused) {
                audioPlayer.play();
            } else {
                audioPlayer.pause();
            }
            updateIcon(item);
            return;
        }

        // Reset all items and set new current item
        resetAllItems();
        audioPlayer.src = src;
        audioPlayer.play();
        currentPlayingItem = item;
        
        // Apply current volume setting
        audioPlayer.volume = volumeSlider.value / 100;
        
        // Expand the item
        item.classList.add("expanded");
        
        // Update UI
        updateIcon(item);
        if (timeIndicator) {
            timeIndicator.style.display = "block";
        }
    }

    // Update play/pause icons
    function updateIcon(item) {
        if (!item) return;
        const iconElement = item.querySelector(".file-icon svg");
        const expandedPlayBtn = item.querySelector(".play-pause-btn svg");
        
        if (audioPlayer.paused) {
            if (iconElement) iconElement.setAttribute("data-icon", "play");
            if (expandedPlayBtn) expandedPlayBtn.setAttribute("data-icon", "play");
        } else {
            if (iconElement) iconElement.setAttribute("data-icon", "pause");
            if (expandedPlayBtn) expandedPlayBtn.setAttribute("data-icon", "pause");
        }
    }

    // Update time display and progress bar
    function updateTime() {
        if (!currentPlayingItem) return;
        
        const timeIndicator = currentPlayingItem.querySelector(".time-indicator");
        const currentTimeEl = currentPlayingItem.querySelector(".current-time");
        const durationTimeEl = currentPlayingItem.querySelector(".duration-time");
        const progressFilled = currentPlayingItem.querySelector(".progress-filled");
        
        const currentTime = formatTime(audioPlayer.currentTime);
        const duration = formatTime(audioPlayer.duration);
        
        // Update compact display
        if (timeIndicator) {
            timeIndicator.textContent = `${currentTime} / ${duration}`;
        }
        
        // Update expanded player display
        if (currentTimeEl) currentTimeEl.textContent = currentTime;
        if (durationTimeEl) durationTimeEl.textContent = duration;
        
        // Update progress bar
        if (progressFilled && !isNaN(audioPlayer.duration)) {
            const progressPercentage = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progressFilled.style.width = `${progressPercentage}%`;
        }
    }
    
    // Handle volume change
    volumeSlider.addEventListener("input", function() {
        // Update volume display
        volumeValue.textContent = `${volumeSlider.value}%`;
        
        // Update audio player volume
        if (audioPlayer) {
            audioPlayer.volume = volumeSlider.value / 100;
        }
        
        // Save to localStorage
        localStorage.setItem("volume", volumeSlider.value);
    });
    
    // Load saved volume
    const savedVolume = localStorage.getItem("volume");
    if (savedVolume !== null) {
        volumeSlider.value = savedVolume;
        volumeValue.textContent = `${savedVolume}%`;
        if (audioPlayer) {
            audioPlayer.volume = savedVolume / 100;
        }
    }

    // Set up featured tags
    document.querySelectorAll('.file-featured').forEach(item => {
        const mobileTag = item.querySelector('.file-number-container .feat-tag');
        if (mobileTag) mobileTag.style.display = 'inline-flex';
        const rightTag = item.querySelector('.right-elements .feat-tag');
        if (rightTag) rightTag.style.display = 'none';
    });

    // Set up click handlers for list items
    document.querySelectorAll(".file-item").forEach(item => {
        const episodeLink = item.querySelector(".episode-link");
        
        episodeLink.addEventListener("click", function(e) {
            e.preventDefault();
            playTrack(item);
        });
        
        // Set up progress bar click handler
        const progressBar = item.querySelector(".progress-bar");
        if (progressBar) {
            progressBar.addEventListener("click", function(e) {
                if (currentPlayingItem !== item) return;
                
                const rect = progressBar.getBoundingClientRect();
                const clickPosition = (e.clientX - rect.left) / rect.width;
                audioPlayer.currentTime = clickPosition * audioPlayer.duration;
                updateTime();
            });
        }
        
        // Set up control buttons
        const rewindBtn = item.querySelector(".rewind-btn");
        const forwardBtn = item.querySelector(".forward-btn");
        const playPauseBtn = item.querySelector(".play-pause-btn");
        
        if (rewindBtn) {
            rewindBtn.addEventListener("click", function(e) {
                e.stopPropagation(); // Prevent bubbling to parent
                if (currentPlayingItem !== item) return;
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - SKIP_TIME);
                updateTime();
            });
        }
        
        if (forwardBtn) {
            forwardBtn.addEventListener("click", function(e) {
                e.stopPropagation(); // Prevent bubbling to parent
                if (currentPlayingItem !== item) return;
                audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + SKIP_TIME);
                updateTime();
            });
        }
        
        if (playPauseBtn) {
            playPauseBtn.addEventListener("click", function(e) {
                e.stopPropagation(); // Prevent bubbling to parent
                if (currentPlayingItem !== item) {
                    playTrack(item);
                } else {
                    if (audioPlayer.paused) {
                        audioPlayer.play();
                    } else {
                        audioPlayer.pause();
                    }
                    updateIcon(item);
                }
            });
        }
    });

    // Audio player event listeners
    audioPlayer.addEventListener("timeupdate", updateTime);
    audioPlayer.addEventListener("ended", resetAllItems);
    audioPlayer.addEventListener("loadedmetadata", updateTime);
    audioPlayer.addEventListener("play", function() {
        if (currentPlayingItem) {
            updateIcon(currentPlayingItem);
        }
    });
    audioPlayer.addEventListener("pause", function() {
        if (currentPlayingItem) {
            updateIcon(currentPlayingItem);
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Space - toggle play/pause for current track
        if (e.code === 'Space' && currentPlayingItem) {
            e.preventDefault();
            if (audioPlayer.paused) {
                audioPlayer.play();
            } else {
                audioPlayer.pause();
            }
            updateIcon(currentPlayingItem);
        }
        
        // Theme toggle with 'T' key
        if (e.code === 'KeyT') {
            toggleTheme();
        }
        
        // Arrow left/right for volume control
        if (e.code === 'ArrowUp' && volumeSlider.value < 100) {
            volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
            volumeSlider.dispatchEvent(new Event('input'));
        }
        
        if (e.code === 'ArrowDown' && volumeSlider.value > 0) {
            volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
            volumeSlider.dispatchEvent(new Event('input'));
        }
    });
});