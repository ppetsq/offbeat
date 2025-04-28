document.addEventListener("DOMContentLoaded", function() {
    const audioPlayer = document.getElementById("audioPlayer");
    const volumeSlider = document.getElementById("masterVolume");
    const volumeValue = document.querySelector(".volume-value");
    const filterSlider = document.getElementById("masterFilter");
    const knobWrapper = document.querySelector('.knob-wrapper'); // Get the knob wrapper
    let currentPlayingItem = null;
    const SKIP_TIME = 30;

    // --- Web Audio API Setup ---
    let audioContext;
    let gainNode;
    let filterNode;
    let audioSource;
    let isAudioContextInitialized = false;

    function initializeAudioContext() {
        if (isAudioContextInitialized) return;

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioContext.createGain();
            filterNode = audioContext.createBiquadFilter();
            audioSource = audioContext.createMediaElementSource(audioPlayer);

            audioSource.connect(gainNode);
            gainNode.connect(filterNode);
            filterNode.connect(audioContext.destination);

            applyVolume(); // Apply initial volume immediately after context creation
            applyAudioFilter(); // Apply initial *audio* filter state

            isAudioContextInitialized = true;
            console.log("Audio Context Initialized");
        } catch (e) {
            console.error("Web Audio API is not supported or could not be initialized.", e);
            // Optionally disable filter/volume controls if context fails
        }
    }

    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(e => console.error("Error resuming AudioContext:", e));
        }
    }
    // --- End Web Audio API Setup ---

    // Theme toggle functionality
    const themeToggle = document.querySelector(".theme-toggle-slider");
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
    }
    themeToggle.addEventListener("click", toggleTheme);

    function formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function resetAllItems() {
        document.querySelectorAll(".file-item").forEach(item => {
            item.classList.remove("expanded");
            const iconElement = item.querySelector(".file-icon svg");
            const timeIndicator = item.querySelector(".time-indicator");
            if (iconElement) iconElement.setAttribute("data-icon", "play");
            if (timeIndicator) {
                timeIndicator.style.display = "none";
                timeIndicator.textContent = "00:00 / 00:00";
            }
            const expandedPlayBtn = item.querySelector(".play-pause-btn svg");
            if (expandedPlayBtn) expandedPlayBtn.setAttribute("data-icon", "play");
            const progressFilled = item.querySelector(".progress-filled");
            if (progressFilled) progressFilled.style.width = "0%";
        });
        currentPlayingItem = null;
    }

    function playTrack(item) {
        if (!isAudioContextInitialized) {
            initializeAudioContext();
        }
        resumeAudioContext(); // Call resume *before* playing

        const link = item.querySelector(".episode-link");
        const src = link.getAttribute("href");

        if (currentPlayingItem === item) {
            if (audioPlayer.paused) {
                audioPlayer.play().catch(error => console.error("Error playing audio:", error));
            } else {
                audioPlayer.pause();
            }
            updateIcon(item);
            return;
        }

        resetAllItems();
        audioPlayer.src = src;
        audioPlayer.play().catch(error => console.error("Error playing audio:", error));
        currentPlayingItem = item;

        // Volume/Filter audio should be applied already by initializeAudioContext or their respective handlers
        // applyVolume();
        // applyAudioFilter();

        item.classList.add("expanded");
        updateIcon(item);
        const timeIndicator = item.querySelector(".time-indicator");
        if (timeIndicator) {
            timeIndicator.style.display = "block";
        }
    }

    function updateIcon(item) {
        if (!item) return;
        const iconElement = item.querySelector(".file-icon svg");
        const expandedPlayBtn = item.querySelector(".play-pause-btn svg");
        const isPaused = audioPlayer.paused;

        if (iconElement) iconElement.setAttribute("data-icon", isPaused ? "play" : "pause");
        if (expandedPlayBtn) expandedPlayBtn.setAttribute("data-icon", isPaused ? "play" : "pause");
    }

    function updateTime() {
        if (!currentPlayingItem || !audioPlayer.duration) return;

        const timeIndicator = currentPlayingItem.querySelector(".time-indicator");
        const currentTimeEl = currentPlayingItem.querySelector(".current-time");
        const durationTimeEl = currentPlayingItem.querySelector(".duration-time");
        const progressFilled = currentPlayingItem.querySelector(".progress-filled");

        const currentTime = formatTime(audioPlayer.currentTime);
        const duration = formatTime(audioPlayer.duration);

        if (timeIndicator) timeIndicator.textContent = `${currentTime} / ${duration}`;
        if (currentTimeEl) currentTimeEl.textContent = currentTime;
        if (durationTimeEl) durationTimeEl.textContent = duration;

        if (progressFilled) {
            const progressPercentage = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progressFilled.style.width = `${progressPercentage}%`;
        }
    }

    // --- Volume Control ---
    function applyVolume() {
        const value = parseInt(volumeSlider.value);
        volumeValue.textContent = `${value}%`;
        if (gainNode) {
             const volume = Math.pow(value / 100, 2); // Non-linear curve
             gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        }
    }

    volumeSlider.addEventListener("input", function() {
        // Resume context if user interacts with volume while suspended
        resumeAudioContext();
        applyVolume();
        localStorage.setItem("volume", volumeSlider.value);
    });

    const savedVolume = localStorage.getItem("volume");
    volumeSlider.value = savedVolume !== null ? savedVolume : 100;
    volumeValue.textContent = `${volumeSlider.value}%`; // Update initial display

    // --- Filter Control ---

    // Function to update ONLY the visual rotation of the knob
    function updateKnobVisual(value) {
         const knobIndicator = document.querySelector('.knob-indicator');
         if (knobIndicator) {
             const rotationRange = 270; // e.g., -135 to +135 degrees
             const degree = ((value / 100) * rotationRange) - (rotationRange / 2);
             knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
         }
    }

    // Function to update ONLY the audio filter effect
    function applyAudioFilter() {
        if (!filterNode || !isAudioContextInitialized) return; // Don't apply if audio context not ready

        const value = parseInt(filterSlider.value);
        const maxFreq = audioContext.sampleRate / 2;
        const minFreq = 20;

        if (value === 50) {
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(maxFreq, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);
        } else if (value < 50) {
            filterNode.type = 'lowpass';
            const normalizedValue = (49 - value) / 49;
            const freq = Math.max(minFreq, Math.pow(maxFreq, 1 - normalizedValue) * Math.pow(minFreq, normalizedValue));
            filterNode.frequency.setValueAtTime(freq, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1 + normalizedValue * 5, audioContext.currentTime);
        } else { // value > 50
            filterNode.type = 'highpass';
            const normalizedValue = (value - 51) / 49;
            const freq = Math.max(minFreq, Math.pow(maxFreq, normalizedValue) * Math.pow(minFreq, 1 - normalizedValue));
            filterNode.frequency.setValueAtTime(freq, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1 + normalizedValue * 5, audioContext.currentTime);
        }
        // console.log(`Audio Filter Applied - Value: ${value}, Type: ${filterNode.type}, Freq: ${filterNode.frequency.value.toFixed(2)}`);
    }

    // --- Custom Knob Drag Logic ---
    let isDragging = false;
    let startX, startY, startValue;
    const sensitivity = 0.4; // Lower value = "stiffer" control (more pixels per value unit)

    function getEventCoords(e) {
        if (e.touches) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function handleDragStart(e) {
        // Prevent text selection during drag
        // e.preventDefault(); // Be cautious with preventDefault on touchstart, can break scrolling elsewhere

        isDragging = true;
        const coords = getEventCoords(e);
        startX = coords.x;
        startY = coords.y;
        startValue = parseInt(filterSlider.value);
        knobWrapper.style.cursor = 'grabbing'; // Change cursor

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('touchmove', handleDragMove, { passive: false }); // Need passive: false to prevent scroll
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('mouseleave', handleDragEnd); // Stop if mouse leaves window
    }

    function handleDragMove(e) {
        if (!isDragging) return;
        e.preventDefault(); // Prevent scrolling ONLY when dragging

        const coords = getEventCoords(e);
        const deltaX = coords.x - startX;
        const deltaY = coords.y - startY;

        // Combine horizontal and vertical movement (invert vertical)
        // Adjust sensitivity here
        const change = (deltaX - deltaY) * sensitivity;

        let newValue = Math.round(startValue + change);
        // Clamp value between 0 and 100
        newValue = Math.max(0, Math.min(100, newValue));

        if (newValue !== parseInt(filterSlider.value)) {
            filterSlider.value = newValue;
            // Manually trigger the 'input' event for filterSlider
            // This ensures both visual and audio updates happen via the listener
            filterSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function handleDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        knobWrapper.style.cursor = 'grab'; // Restore cursor

        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('mouseleave', handleDragEnd);
    }

    knobWrapper.addEventListener('mousedown', handleDragStart);
    knobWrapper.addEventListener('touchstart', handleDragStart, { passive: true }); // Allow default scroll initially


    // --- Filter Slider Event Listener ---
    // This listener now handles BOTH visual and audio updates when the value changes
    filterSlider.addEventListener("input", function() {
        const currentValue = parseInt(filterSlider.value);
        updateKnobVisual(currentValue); // Update visual immediately
        // Resume context if user interacts with filter while suspended
        resumeAudioContext();
        applyAudioFilter(); // Apply audio effect (only if context is ready)
        // Optional: Save filter value
        // localStorage.setItem("filter", currentValue);
    });

    // --- Initialize Filter ---
    // Optional: Load saved filter value
    /*
    const savedFilter = localStorage.getItem("filter");
    filterSlider.value = savedFilter !== null ? savedFilter : 50;
    */
    filterSlider.value = 50; // Default center position
    updateKnobVisual(filterSlider.value); // Set initial visual state immediately on load
    // Initial audio filter state will be set if/when audio context initializes
    // --- End Filter Initialization ---

    // Set up featured tags
    document.querySelectorAll('.file-featured').forEach(item => {
        const mobileTag = item.querySelector('.file-number-container .feat-tag');
        if (mobileTag) mobileTag.style.display = 'inline-flex';
    });

    // Set up click handlers for list items
    document.querySelectorAll(".file-item").forEach(item => {
        const episodeLink = item.querySelector(".episode-link");

        episodeLink.addEventListener("click", function(e) {
            e.preventDefault();
            playTrack(item);
        });

        const progressBar = item.querySelector(".progress-bar");
        if (progressBar) {
            progressBar.addEventListener("click", function(e) {
                if (currentPlayingItem !== item || !audioPlayer.duration) return;
                resumeAudioContext();
                const rect = progressBar.getBoundingClientRect();
                const clickPosition = (e.clientX - rect.left) / rect.width;
                audioPlayer.currentTime = clickPosition * audioPlayer.duration;
                updateTime();
            });
        }

        const rewindBtn = item.querySelector(".rewind-btn");
        const forwardBtn = item.querySelector(".forward-btn");
        const playPauseBtn = item.querySelector(".play-pause-btn");

        if (rewindBtn) {
            rewindBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                if (currentPlayingItem !== item) return;
                resumeAudioContext();
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - SKIP_TIME);
                updateTime();
            });
        }

        if (forwardBtn) {
            forwardBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                if (currentPlayingItem !== item || !audioPlayer.duration) return;
                resumeAudioContext();
                audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + SKIP_TIME);
                updateTime();
            });
        }

        if (playPauseBtn) {
            playPauseBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                if (currentPlayingItem !== item) {
                    playTrack(item); // This will handle resume context
                } else {
                    resumeAudioContext();
                    if (audioPlayer.paused) {
                        audioPlayer.play().catch(error => console.error("Error playing audio:", error));
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
        resumeAudioContext(); // Ensure context is running
        if (currentPlayingItem) updateIcon(currentPlayingItem);
    });
    audioPlayer.addEventListener("pause", function() {
        if (currentPlayingItem) updateIcon(currentPlayingItem);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Space - toggle play/pause
        if (e.code === 'Space' && !e.target.closest('input, button')) { // Avoid interfering with inputs/buttons
            if (currentPlayingItem) {
                e.preventDefault();
                resumeAudioContext(); // Needed before play/pause action
                if (audioPlayer.paused) {
                    audioPlayer.play().catch(error => console.error("Error playing audio:", error));
                } else {
                    audioPlayer.pause();
                }
                updateIcon(currentPlayingItem);
            }
        }

        // Theme toggle with 'T'
        if (e.code === 'KeyT' && !e.target.closest('input')) {
            toggleTheme();
        }

        // Arrow Up/Down for volume
        if (e.code === 'ArrowUp' && !e.target.closest('input')) {
             e.preventDefault();
             if (parseInt(volumeSlider.value) < 100) {
                 volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
                 volumeSlider.dispatchEvent(new Event('input')); // Trigger listener
             }
        }
        if (e.code === 'ArrowDown' && !e.target.closest('input')) {
             e.preventDefault();
             if (parseInt(volumeSlider.value) > 0) {
                volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
                volumeSlider.dispatchEvent(new Event('input')); // Trigger listener
             }
        }

         // Arrow Left/Right for filter (using existing input listener)
         if (e.code === 'ArrowLeft' && !e.target.closest('input')) {
              e.preventDefault();
              if (parseInt(filterSlider.value) > 0) {
                 filterSlider.value = Math.max(0, parseInt(filterSlider.value) - 2); // Smaller steps
                 filterSlider.dispatchEvent(new Event('input')); // Trigger listener
              }
         }
         if (e.code === 'ArrowRight' && !e.target.closest('input')) {
              e.preventDefault();
              if (parseInt(filterSlider.value) < 100) {
                  filterSlider.value = Math.min(100, parseInt(filterSlider.value) + 2); // Smaller steps
                  filterSlider.dispatchEvent(new Event('input')); // Trigger listener
              }
         }
    });
});