document.addEventListener("DOMContentLoaded", function() {
    const audioPlayer = document.getElementById("audioPlayer");
    const volumeSlider = document.getElementById("masterVolume");
    const volumeValue = document.querySelector(".volume-value");
    const filterSlider = document.getElementById("masterFilter");
    const reverbSlider = document.getElementById("masterReverb");
    const filterKnobWrapper = document.querySelector('.filter-container .knob-wrapper');
    const reverbKnobWrapper = document.querySelector('.reverb-container .knob-wrapper');
    const filterToggleBtn = document.querySelector('.filter-toggle');
    const reverbToggleBtn = document.querySelector('.reverb-toggle');
    
    let filterActive = false; // Start with filter inactive
    let reverbActive = false; // Start with reverb inactive
    let currentPlayingItem = null;
    const SKIP_TIME = 30;
    const sensitivity = 0.15; // Lower value = "stiffer" control (more pixels per value unit)

    // --- Web Audio API Setup ---
    let audioContext;
    let gainNode;
    let filterNode;
    let convolver;
    let dryGainNode;
    let wetGainNode;
    let reverbBypassNode;
    let isAudioContextInitialized = false;

// Update the initializeAudioContext function to change the signal chain order
// Reverb should come before filter

function initializeAudioContext() {
    if (isAudioContextInitialized) return;

    try {
        // Create context first
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create nodes
        gainNode = audioContext.createGain(); // Master volume
        filterNode = audioContext.createBiquadFilter(); // Filter
        
        // Reverb nodes
        dryGainNode = audioContext.createGain(); // Dry signal path
        wetGainNode = audioContext.createGain(); // Wet signal path
        convolver = audioContext.createConvolver(); // Reverb effect
        reverbBypassNode = audioContext.createGain(); // Bypass node for reverb
        
        // Set initial wet gain to 0 (no reverb)
        wetGainNode.gain.value = 0;
        
        // Create impulse response for reverb
        createReverbImpulse();
        
        // Get audio source from HTML audio element
        const audioSourceNode = audioContext.createMediaElementSource(audioPlayer);
        
        // ===== NEW SIGNAL CHAIN (REVERB THEN FILTER) =====
        
        // Source to master volume gain
        audioSourceNode.connect(gainNode);
        
        // Split signal after master volume into dry/wet paths for reverb
        gainNode.connect(dryGainNode);  // Dry path (no reverb)
        gainNode.connect(wetGainNode);  // Wet path (with reverb)
        
        // Process wet path through convolver (reverb)
        wetGainNode.connect(convolver);
        
        // Recombine paths - both dry and wet go to a common point
        // This is where the reverb effect is complete
        const reverbMixNode = audioContext.createGain();
        dryGainNode.connect(reverbMixNode);
        convolver.connect(reverbMixNode);
        
        // Now send the mixed reverb signal to the filter
        reverbMixNode.connect(filterNode);
        
        // Filter to output
        filterNode.connect(audioContext.destination);
        
        // Apply initial volume setting
        applyVolume();
        
        // Set filter to bypass mode initially
        filterNode.type = 'allpass';
        filterNode.frequency.setValueAtTime(audioContext.sampleRate / 2, audioContext.currentTime);
        filterNode.Q.setValueAtTime(1, audioContext.currentTime);
        
        isAudioContextInitialized = true;
        console.log("Audio Context Initialized with Reverb → Filter signal chain");
    } catch (e) {
        console.error("Web Audio API is not supported or could not be initialized.", e);
    }
}

    function createReverbImpulse() {
        if (!audioContext || !convolver) return;
        
        // Create a longer, richer impulse response (3 seconds)
        const sampleRate = audioContext.sampleRate;
        const length = 3 * sampleRate; // 3 seconds for longer tail
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        
        // Generate reverb impulse with early reflections and slower decay
        const attack = 0.01; // Quick attack
        const earlyDecay = 0.1; // Early reflections decay
        const lateDecay = 0.5; // Late reflections decay slower
        
        for (let i = 0; i < length; i++) {
            // Time position (0 to 1)
            const time = i / length;
            
            // Early reflections (first 15% of the impulse)
            if (time < 0.15) {
                // More pronounced early reflections
                const amplitude = Math.pow((1 - time / 0.15), earlyDecay);
                left[i] = (Math.random() * 2 - 1) * amplitude;
                right[i] = (Math.random() * 2 - 1) * amplitude;
            } 
            // Late reflections
            else {
                // Slower decay for late reflections (more reverb tail)
                const amplitude = Math.pow((1 - (time - 0.15) / 0.85), lateDecay);
                left[i] = (Math.random() * 2 - 1) * amplitude * 0.5; // Slightly quieter
                right[i] = (Math.random() * 2 - 1) * amplitude * 0.5;
            }
        }
        
        // Apply a gentle low-pass filter effect to the impulse by smoothing
        const smoothingFactor = 0.2;
        for (let i = 1; i < length; i++) {
            left[i] = left[i] * (1 - smoothingFactor) + left[i-1] * smoothingFactor;
            right[i] = right[i] * (1 - smoothingFactor) + right[i-1] * smoothingFactor;
        }
        
        convolver.buffer = impulse;
        console.log("Enhanced reverb impulse created");
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
    volumeSlider.value = savedVolume !== null ? savedVolume : 80;
    volumeValue.textContent = `${volumeSlider.value}%`; // Update initial display

    // --- Filter Control ---

    // Toggle filter on/off
    function toggleFilter() {
        filterActive = !filterActive;
        filterToggleBtn.classList.toggle('active', filterActive);
        
        // If filter is turned off, set to neutral/bypass mode
        if (!filterActive) {
            filterNode.type = 'allpass';
            filterNode.frequency.setValueAtTime(audioContext.sampleRate / 2, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);
        } else {
            // Re-apply the current filter setting if active
            applyAudioFilter();
        }
    }

    // Function to update ONLY the visual rotation of the filter knob
    function updateFilterKnobVisual(value) {
         const knobIndicator = document.querySelector('.filter-container .knob-indicator');
         if (knobIndicator) {
             const rotationRange = 270; // e.g., -135 to +135 degrees
             const degree = ((value / 100) * rotationRange) - (rotationRange / 2);
             knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
         }
    }

    // Function to update ONLY the audio filter effect
    function applyAudioFilter() {
        if (!filterNode || !isAudioContextInitialized) return; // Don't apply if audio context not ready
        
        // Skip filter application if filter is not active
        if (!filterActive) return;

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

    // Reset filter knob to center position
    function resetFilterKnobToCenter() {
        filterSlider.value = 50;
        filterSlider.dispatchEvent(new Event('input'));
    }
    
    // --- Reverb Control ---
    
    // Toggle reverb on/off
    function toggleReverb() {
        reverbActive = !reverbActive;
        reverbToggleBtn.classList.toggle('active', reverbActive);
        
        // If reverb is turned off, set wet gain to 0
        if (!reverbActive) {
            wetGainNode.gain.setValueAtTime(0, audioContext.currentTime);
            dryGainNode.gain.setValueAtTime(1, audioContext.currentTime);
        } else {
            // Re-apply the current reverb setting if active
            applyReverb();
        }
    }
    
    // Function to update ONLY the visual rotation of the reverb knob
    function updateReverbKnobVisual(value) {
        const knobIndicator = document.querySelector('.reverb-container .knob-indicator');
        if (knobIndicator) {
            const rotationRange = 270; // e.g., -135 to +135 degrees
            const degree = ((value / 100) * rotationRange) - (rotationRange / 2);
            knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
        }
    }
    
    function applyReverb() {
        if (!convolver || !isAudioContextInitialized) return;
        
        // Skip reverb application if reverb is not active
        if (!reverbActive) return;
        
        const value = parseInt(reverbSlider.value);
        
        // Calculate wet/dry mix with enhanced curve
        // Use a non-linear curve for more dramatic effect at higher values
        const wetAmount = Math.pow(value / 100, 0.8); // Less aggressive curve (0.8 instead of 1)
        
        // Enhance the effect at higher values
        const enhancedWetAmount = wetAmount * 1.3; // 30% stronger at maximum
        
        // Smooth transition to new values (50ms)
        const now = audioContext.currentTime;
        const transitionTime = 0.05; // 50ms transition
        
        wetGainNode.gain.linearRampToValueAtTime(enhancedWetAmount, now + transitionTime);
        
        // Reduce dry signal more as wet increases, but maintain overall volume
        // This creates a more immersive effect
        const dryAmount = Math.max(0.3, 1 - (wetAmount * 0.7)); // Minimum 30% dry signal
        dryGainNode.gain.linearRampToValueAtTime(dryAmount, now + transitionTime);
        
        console.log(`Enhanced Reverb Applied - Wet: ${enhancedWetAmount.toFixed(2)}, Dry: ${dryAmount.toFixed(2)}`);
    }
    
    // Reset reverb knob to default position (0)
    function resetReverbKnobToDefault() {
        reverbSlider.value = 0;
        reverbSlider.dispatchEvent(new Event('input'));
    }

    // --- Common Utilities for Drag Controls ---
    function getEventCoords(e) {
        if (e.touches) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    // --- Filter Knob Drag Logic ---
    let isFilterDragging = false;
    let filterStartX, filterStartY, filterStartValue;

    function handleFilterDragStart(e) {
        isFilterDragging = true;
        const coords = getEventCoords(e);
        filterStartX = coords.x;
        filterStartY = coords.y;
        filterStartValue = parseInt(filterSlider.value);

        document.addEventListener('mousemove', handleFilterDragMove);
        document.addEventListener('touchmove', handleFilterDragMove, { passive: false });
        document.addEventListener('mouseup', handleFilterDragEnd);
        document.addEventListener('touchend', handleFilterDragEnd);
        document.addEventListener('mouseleave', handleFilterDragEnd);
    }

    function handleFilterDragMove(e) {
        if (!isFilterDragging) return;
        e.preventDefault();

        const coords = getEventCoords(e);
        const deltaX = coords.x - filterStartX;
        const deltaY = coords.y - filterStartY;

        // Combine horizontal and vertical movement (invert vertical)
        const change = (deltaX - deltaY) * sensitivity;

        let newValue = Math.round(filterStartValue + change);
        
        // Add snap behavior - if within 3 units of center (50), snap to 50
        if (Math.abs(newValue - 50) < 3) {
            newValue = 50;
        }
        
        // Clamp value between 0 and 100
        newValue = Math.max(0, Math.min(100, newValue));

        if (newValue !== parseInt(filterSlider.value)) {
            filterSlider.value = newValue;
            // Trigger the input event
            filterSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function handleFilterDragEnd() {
        if (!isFilterDragging) return;
        isFilterDragging = false;

        document.removeEventListener('mousemove', handleFilterDragMove);
        document.removeEventListener('touchmove', handleFilterDragMove);
        document.removeEventListener('mouseup', handleFilterDragEnd);
        document.removeEventListener('touchend', handleFilterDragEnd);
        document.removeEventListener('mouseleave', handleFilterDragEnd);
    }

    // --- Reverb Knob Drag Logic ---
    let isReverbDragging = false;
    let reverbStartX, reverbStartY, reverbStartValue;

    function handleReverbDragStart(e) {
        isReverbDragging = true;
        const coords = getEventCoords(e);
        reverbStartX = coords.x;
        reverbStartY = coords.y;
        reverbStartValue = parseInt(reverbSlider.value);

        document.addEventListener('mousemove', handleReverbDragMove);
        document.addEventListener('touchmove', handleReverbDragMove, { passive: false });
        document.addEventListener('mouseup', handleReverbDragEnd);
        document.addEventListener('touchend', handleReverbDragEnd);
        document.addEventListener('mouseleave', handleReverbDragEnd);
    }

    function handleReverbDragMove(e) {
        if (!isReverbDragging) return;
        e.preventDefault();

        const coords = getEventCoords(e);
        const deltaX = coords.x - reverbStartX;
        const deltaY = coords.y - reverbStartY;

        // Combine horizontal and vertical movement (invert vertical)
        const change = (deltaX - deltaY) * sensitivity;

        let newValue = Math.round(reverbStartValue + change);
        
        // No snap behavior for reverb
        
        // Clamp value between 0 and 100
        newValue = Math.max(0, Math.min(100, newValue));

        if (newValue !== parseInt(reverbSlider.value)) {
            reverbSlider.value = newValue;
            // Trigger the input event
            reverbSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function handleReverbDragEnd() {
        if (!isReverbDragging) return;
        isReverbDragging = false;

        document.removeEventListener('mousemove', handleReverbDragMove);
        document.removeEventListener('touchmove', handleReverbDragMove);
        document.removeEventListener('mouseup', handleReverbDragEnd);
        document.removeEventListener('touchend', handleReverbDragEnd);
        document.removeEventListener('mouseleave', handleReverbDragEnd);
    }

    // Set up drag handlers for both knobs
    if (filterKnobWrapper) {
        filterKnobWrapper.addEventListener('mousedown', handleFilterDragStart);
        filterKnobWrapper.addEventListener('touchstart', handleFilterDragStart, { passive: true });
        
        // Double-click to reset knob to center
        filterKnobWrapper.addEventListener('dblclick', function(e) {
            e.preventDefault();
            e.stopPropagation();
            resetFilterKnobToCenter();
        });
    }
    
    if (reverbKnobWrapper) {
        reverbKnobWrapper.addEventListener('mousedown', handleReverbDragStart);
        reverbKnobWrapper.addEventListener('touchstart', handleReverbDragStart, { passive: true });
        
        // Double-click to reset knob to default
        reverbKnobWrapper.addEventListener('dblclick', function(e) {
            e.preventDefault();
            e.stopPropagation();
            resetReverbKnobToDefault();
        });
    }

    // --- Slider Event Listeners ---
    // Filter slider listener
    filterSlider.addEventListener("input", function() {
        const currentValue = parseInt(filterSlider.value);
        updateFilterKnobVisual(currentValue);
        resumeAudioContext();
        applyAudioFilter();
    });
    
    // Reverb slider listener
    if (reverbSlider) {
        reverbSlider.addEventListener("input", function() {
            const currentValue = parseInt(reverbSlider.value);
            updateReverbKnobVisual(currentValue);
            resumeAudioContext();
            applyReverb();
        });
    }

    // --- Initialize Controls ---
    // Initialize filter
    filterSlider.value = 50; // Default center position
    updateFilterKnobVisual(filterSlider.value);
    
    // Initialize reverb
    if (reverbSlider) {
        reverbSlider.value = 0; // Default to no reverb
        updateReverbKnobVisual(reverbSlider.value);
    }

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
                    playTrack(item);
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
        resumeAudioContext();
        if (currentPlayingItem) updateIcon(currentPlayingItem);
    });
    audioPlayer.addEventListener("pause", function() {
        if (currentPlayingItem) updateIcon(currentPlayingItem);
    });

    // Effect toggle button listeners
    filterToggleBtn.addEventListener('click', function() {
        resumeAudioContext();
        toggleFilter();
    });
    
    if (reverbToggleBtn) {
        reverbToggleBtn.addEventListener('click', function() {
            resumeAudioContext();
            toggleReverb();
        });
    }

    // Set initial state for the buttons (NOT active)
    filterToggleBtn.classList.remove('active');
    if (reverbToggleBtn) {
        reverbToggleBtn.classList.remove('active');
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Space - toggle play/pause
        if (e.code === 'Space' && !e.target.closest('input, button')) {
            if (currentPlayingItem) {
                e.preventDefault();
                resumeAudioContext();
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

        // Reset filter knob to center with 'R'
        if (e.code === 'KeyR' && !e.target.closest('input')) {
            resetFilterKnobToCenter();
        }
        
        // Reset reverb knob with 'B'
        if (e.code === 'KeyB' && !e.target.closest('input')) {
            resetReverbKnobToDefault();
        }
        
        // Toggle reverb with 'V'
        if (e.code === 'KeyV' && !e.target.closest('input')) {
            if (reverbToggleBtn) toggleReverb();
        }

        // Arrow Up/Down for volume
        if (e.code === 'ArrowUp' && !e.target.closest('input')) {
             e.preventDefault();
             if (parseInt(volumeSlider.value) < 100) {
                 volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
                 volumeSlider.dispatchEvent(new Event('input'));
             }
        }
        if (e.code === 'ArrowDown' && !e.target.closest('input')) {
             e.preventDefault();
             if (parseInt(volumeSlider.value) > 0) {
                volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
                volumeSlider.dispatchEvent(new Event('input'));
             }
        }

        // Arrow Left/Right for filter
        if (e.code === 'ArrowLeft' && !e.target.closest('input')) {
            e.preventDefault();
            if (parseInt(filterSlider.value) > 0) {
                filterSlider.value = Math.max(0, parseInt(filterSlider.value) - 2);
                filterSlider.dispatchEvent(new Event('input'));
            }
        }
        if (e.code === 'ArrowRight' && !e.target.closest('input')) {
            e.preventDefault();
            if (parseInt(filterSlider.value) < 100) {
                filterSlider.value = Math.min(100, parseInt(filterSlider.value) + 2);
                filterSlider.dispatchEvent(new Event('input'));
            }
        }
    });
});

// Function to update ONLY the visual rotation of the reverb knob
function updateReverbKnobVisual(value) {
    const knobIndicator = document.querySelector('.reverb-container .knob-indicator');
    if (knobIndicator) {
        const rotationRange = 270; // e.g., -135 to +135 degrees
        // Start at 7 o'clock position (-135 degrees) and move clockwise
        // When value is 0, we want -135 degrees (7 o'clock)
        // When value is 100, we want +135 degrees (5 o'clock)
        const degree = -135 + (value / 100) * rotationRange;
        knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
    }
}