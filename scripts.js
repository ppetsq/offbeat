document.addEventListener("DOMContentLoaded", function() {
    // --- DOM Elements ---
    const audioPlayer = document.getElementById("audioPlayer");
    const volumeSlider = document.getElementById("masterVolume");
    const volumeValue = document.querySelector(".volume-value");
    const filterSlider = document.getElementById("masterFilter");
    const reverbSlider = document.getElementById("masterReverb");
    const filterKnobWrapper = document.querySelector('.filter-container .knob-wrapper');
    const reverbKnobWrapper = document.querySelector('.reverb-container .knob-wrapper');
    const filterToggleBtn = document.querySelector('.filter-toggle');
    const reverbToggleBtn = document.querySelector('.reverb-toggle');
    const themeToggle = document.querySelector(".theme-toggle-slider");
    const waveformCanvas = document.getElementById('waveformCanvas'); // Get canvas element

    // --- State Variables ---
    let filterActive = false;
    let reverbActive = false;
    let currentPlayingItem = null;
    let currentLowcutFreq = 200;   // Default reverb lowcut frequency (Hz)
    let isAudioContextInitialized = false;
    let visualizerAnimationId = null; // To control the animation loop

    // --- Constants ---
    const REVERB_LOWCUT_MIN = 80;  // Minimum lowcut frequency (Hz)
    const REVERB_LOWCUT_MAX = 800; // Maximum lowcut frequency (Hz)
    const SKIP_TIME = 30;          // Seek time in seconds
    const sensitivity = 0.15;    // Knob drag sensitivity

    // --- Web Audio API Variables ---
    let audioContext;
    let gainNode;         // Master volume
    let filterNode;       // Master filter (LP/HP)
    let convolver;        // Reverb effect node
    let reverbSendNode;   // Gain node to control reverb send level
    let reverbLowcutNode; // Lowcut filter for reverb input
    let reverbReturnNode; // Gain node for reverb return (wet signal)
    let analyserNode;     // Node for waveform analysis

    // --- Canvas Variables ---
    let canvas, canvasCtx, dataArray, bufferLength;

    // =====================================
    // Initialize Canvas Context
    // =====================================
    if (waveformCanvas) {
        canvas = waveformCanvas;
        canvasCtx = canvas.getContext('2d');
        // Set initial canvas drawing buffer size
        try {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        } catch (e) {
            console.error("Error setting initial canvas size:", e);
        }
    } else {
        console.warn("Waveform canvas element ('waveformCanvas') not found!");
    }

    // =====================================
    // Mobile Background Playback Setup
    // =====================================
    function enableBackgroundPlayback() {
        // Set audio element attributes for background playback
        audioPlayer.setAttribute('playsinline', ''); // iOS playback within page
        audioPlayer.setAttribute('webkit-playsinline', ''); // Older iOS versions
        audioPlayer.setAttribute('preload', 'metadata'); // Better than 'none' for playback

        // Prevent browser from pausing audio when inactive
        document.addEventListener('visibilitychange', function() {
            // Keep playing even when the page is hidden
            if (document.visibilityState === 'hidden' && !audioPlayer.paused) {
                // Force continue playing in background
                try {
                    const silentPromise = audioPlayer.play();
                    if (silentPromise !== undefined) {
                        silentPromise.catch(e => {
                            console.log('Background play prevented by browser', e);
                        });
                    }
                } catch (e) {
                    console.log('Error keeping audio playing in background', e);
                }
            }
        });
    }

    // Set up Media Session API for system media controls
    function setupMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', function() {
                if (currentPlayingItem) {
                    audioPlayer.play().catch(error => console.error("Error playing audio:", error));
                    updateIcon(currentPlayingItem);
                }
            });
            
            navigator.mediaSession.setActionHandler('pause', function() {
                audioPlayer.pause();
                if (currentPlayingItem) {
                    updateIcon(currentPlayingItem);
                }
            });
            
            navigator.mediaSession.setActionHandler('seekbackward', function() {
                if (audioPlayer && !isNaN(audioPlayer.duration)) {
                    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - SKIP_TIME);
                    updateTime();
                }
            });
            
            navigator.mediaSession.setActionHandler('seekforward', function() {
                if (audioPlayer && !isNaN(audioPlayer.duration)) {
                    audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + SKIP_TIME);
                    updateTime();
                }
            });
        }
    }

    // Update media session metadata when track changes
    function updateMediaSessionMetadata(trackName, episodeDate) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: trackName || 'Offbeat Radio',
                artist: episodeDate || 'Live radio show',
                album: 'Offbeat Archive',
                artwork: [
                    { src: 'https://vault.petsq.net/offbeat-promo.jpg', sizes: '512x512', type: 'image/jpeg' }
                ]
            });
        }
    }

    // =====================================
    // Web Audio API Initialization
    // =====================================
    function initializeAudioContext() {
        if (isAudioContextInitialized) return;

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create core nodes
            gainNode = audioContext.createGain();
            filterNode = audioContext.createBiquadFilter();
            analyserNode = audioContext.createAnalyser(); // Create Analyser

            // Create reverb nodes
            reverbSendNode = audioContext.createGain();
            reverbLowcutNode = audioContext.createBiquadFilter();
            convolver = audioContext.createConvolver();
            reverbReturnNode = audioContext.createGain();

            // Get audio source
            const audioSourceNode = audioContext.createMediaElementSource(audioPlayer);

            // === Connect Audio Graph ===
            // Main signal path
            audioSourceNode.connect(gainNode);

            // Reverb send path (parallel to main path, before main gain affects send)
            audioSourceNode.connect(reverbSendNode);
            reverbSendNode.connect(reverbLowcutNode);
            reverbLowcutNode.connect(convolver);
            convolver.connect(reverbReturnNode);
            reverbReturnNode.connect(gainNode); // Reverb returns (mixes) at the main gain node

            // Connect Analyser *after* gain (to reflect volume), *before* filter
            gainNode.connect(analyserNode);
            analyserNode.connect(filterNode);

            // Final connection to output
            filterNode.connect(audioContext.destination);

            // === Configure Nodes ===
            // Analyser Setup
            analyserNode.fftSize = 2048; // Adjust detail level (power of 2)
            bufferLength = analyserNode.frequencyBinCount; // = fftSize / 2
            dataArray = new Uint8Array(bufferLength); // Array for waveform data

            // Reverb Lowcut Filter Setup
            reverbLowcutNode.type = 'highpass';
            reverbLowcutNode.frequency.value = currentLowcutFreq;
            reverbLowcutNode.Q.value = 0.7;

            // Reverb Initial State (Off)
            reverbSendNode.gain.value = 0;
            reverbReturnNode.gain.value = 1.4; // Slightly boost return for presence when active
            createReverbImpulse(); // Generate the reverb sound

            // Filter Initial State (Bypass)
            filterNode.type = 'allpass';
            filterNode.frequency.setValueAtTime(audioContext.sampleRate / 2, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);

            // Apply Initial Volume
            applyVolume();

            isAudioContextInitialized = true;
            console.log("Audio Context Initialized with Send-Based Reverb, Lowcut, Filter, and Analyser");
        } catch (e) {
            console.error("Web Audio API is not supported or could not be initialized.", e);
            alert("Sorry, your browser doesn't support the necessary Web Audio features for this site.");
        }
    }

    // Function to resume AudioContext if suspended (required by browsers)
    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(e => console.error("Error resuming AudioContext:", e));
        }
    }

    // =====================================
    // Reverb Impulse Response Generation
    // =====================================
    function createReverbImpulse() {
        if (!audioContext || !convolver) return;
        const sampleRate = audioContext.sampleRate;
        const length = 1.2 * sampleRate;
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        const attack = 0.002, earlyDecay = 0.02, lateDecay = 0.9;

        for (let i = 0; i < length; i++) {
            const time = i / length;
            let amplitude;
            if (time < 0.1) { // Enhanced early reflections
                amplitude = Math.pow((1 - time / 0.1), earlyDecay) * 1.3;
            } else { // Sustained late reflections
                amplitude = Math.pow((1 - (time - 0.1) / 0.9), lateDecay) * 0.5;
            }
            left[i] = (Math.random() * 2 - 1) * amplitude;
            right[i] = (Math.random() * 2 - 1) * amplitude;
        }

        // Smoothing for stereo width and brightness
        const smoothL = 0.1, smoothR = 0.12;
        for (let i = 1; i < length; i++) {
            left[i] = left[i] * (1 - smoothL) + left[i-1] * smoothL;
            right[i] = right[i] * (1 - smoothR) + right[i-1] * smoothR;
        }
        for (let i = length - 2; i >= 0; i--) { // Preserve high frequencies
            left[i] = left[i] * 0.9 + left[i+1] * 0.1;
            right[i] = right[i] * 0.9 + right[i+1] * 0.1;
        }

        convolver.buffer = impulse;
        console.log("Enhanced club/DJ-style reverb impulse created.");
    }

    // =====================================
    // Waveform Visualizer Drawing Function
    // =====================================
    function drawVisualizer() {
        // Add a zoom factor (e.g., 0.6 means the waveform uses 60% of the vertical space)
        const zoomFactor = 1;

        // Ensure canvas context is available
        if (!canvasCtx || !canvas) {
             visualizerAnimationId = null;
             return;
        }

        // --- Drawing Logic ---
        // Get computed style for colors ONCE per frame for efficiency
        const computedStyle = getComputedStyle(document.documentElement);
        const strokeColor = computedStyle.getPropertyValue('--accent-color').trim();
        const idleColor = computedStyle.getPropertyValue('--slider-bg').trim(); // Color for the flat line

        // Request the next frame IF playing and initialized
        if (!audioPlayer.paused && isAudioContextInitialized && analyserNode) {
            visualizerAnimationId = requestAnimationFrame(drawVisualizer);

            // Get current waveform data
            analyserNode.getByteTimeDomainData(dataArray);

            // Clear the canvas for the new frame
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

            // Set drawing style for active waveform
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = strokeColor || '#8B9D83'; // Use fallback color

            // Begin drawing the path
            canvasCtx.beginPath();
            const sliceWidth = canvas.width * 1.0 / bufferLength; // Width of each data point segment
            let x = 0; // Current horizontal position
            const centerY = canvas.height / 2;

            // Loop through data points to draw the line
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0; // Normalize data (0-255 -> 0.0-2.0)
                // Calculate deviation from center, apply zoom factor, then add back to center
                const y = centerY + (v * centerY - centerY) * zoomFactor;

                if (i === 0) {
                    canvasCtx.moveTo(x, y); // Start the line
                } else {
                    canvasCtx.lineTo(x, y); // Draw line segment to next point
                }
                x += sliceWidth; // Move to the next horizontal position
            }

            // Finish the line near the middle right edge
            canvasCtx.lineTo(canvas.width, centerY);
            canvasCtx.stroke(); // Render the line on the canvas

        } else {
             // --- Draw Idle State (Flat Line) ---
             visualizerAnimationId = null; // Ensure animation stops

             // Clear the canvas
             canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

             // Set style for idle line
             canvasCtx.lineWidth = 2; // Can be same or different width
             canvasCtx.strokeStyle = idleColor || 'rgba(139, 157, 131, 0.2)'; // Use slider background color

             // Draw horizontal line in the middle
             canvasCtx.beginPath();
             canvasCtx.moveTo(0, canvas.height / 2);
             canvasCtx.lineTo(canvas.width, canvas.height / 2);
             canvasCtx.stroke();
        }
    }

    // =====================================
    // Theme Toggle
    // =====================================
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        // No explicit redraw needed for visualizer, CSS handles color change
    }
    themeToggle.addEventListener("click", toggleTheme);

    // =====================================
    // Utility Functions
    // =====================================
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "00:00";
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function getEventCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    // =====================================
    // Player State Management
    // =====================================
    function resetAllItemsVisuals() {
        document.querySelectorAll(".file-item").forEach(item => {
            item.classList.remove("expanded");
            const iconElement = item.querySelector(".file-icon svg");
            const timeIndicator = item.querySelector(".time-indicator");
            if (iconElement) iconElement.setAttribute("data-icon", "play");
            if (timeIndicator) {
                // Don't hide if it's the currently playing item (handle in updateTime)
                if (item !== currentPlayingItem) {
                    timeIndicator.style.display = "none";
                    timeIndicator.textContent = "00:00 / 00:00";
                }
            }
            const expandedPlayBtn = item.querySelector(".play-pause-btn svg");
            if (expandedPlayBtn) expandedPlayBtn.setAttribute("data-icon", "play");
            const progressFilled = item.querySelector(".progress-filled");
            if (progressFilled) progressFilled.style.width = "0%";
        });
        // Clear currentPlayingItem only when explicitly stopping/changing tracks
    }

    function playTrack(item) {
        if (!isAudioContextInitialized) {
            initializeAudioContext(); // Initialize on first play attempt
            if (!isAudioContextInitialized) return; // Stop if initialization failed
        }
        resumeAudioContext(); // Resume context before playing

        const link = item.querySelector(".episode-link");
        const src = link.getAttribute("href");

        if (currentPlayingItem === item) { // Clicked on the currently playing item
            if (audioPlayer.paused) {
                audioPlayer.play().catch(error => console.error("Error playing audio:", error));
            } else {
                audioPlayer.pause();
            }
            updateIcon(item); // Update play/pause icon
        } else { // Clicked on a new item
            resetAllItemsVisuals(); // Reset visuals of OTHERS
            audioPlayer.src = src;
            audioPlayer.load(); // Important for ensuring metadata loads
            audioPlayer.play().catch(error => console.error("Error playing audio:", error));
            currentPlayingItem = item;

            // Update media session metadata for lock screen controls
            const trackName = item.querySelector('.file-number')?.textContent || '';
            const episodeDate = item.querySelector('.file-date')?.textContent || '';
            updateMediaSessionMetadata(trackName, episodeDate);

            item.classList.add("expanded");
            updateIcon(item); // Set initial icon state
            const timeIndicator = item.querySelector(".time-indicator");
            if (timeIndicator) {
                timeIndicator.style.display = "block"; // Show time for current item
            }
        }
    }

    function updateIcon(item) {
        if (!item) return;
        const iconElement = item.querySelector(".file-icon svg");
        const expandedPlayBtn = item.querySelector(".play-pause-btn svg");
        const isPaused = audioPlayer.paused;
        const newIcon = isPaused ? "play" : "pause";

        if (iconElement) iconElement.setAttribute("data-icon", newIcon);
        if (expandedPlayBtn) expandedPlayBtn.setAttribute("data-icon", newIcon);
    }

    function updateTime() {
        if (!currentPlayingItem || !audioPlayer.duration || isNaN(audioPlayer.duration)) return;

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

        // Update position state for Media Session API
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            navigator.mediaSession.setPositionState({
                duration: audioPlayer.duration || 0,
                playbackRate: audioPlayer.playbackRate,
                position: audioPlayer.currentTime || 0
            });
        }
    }

    // =====================================
    // Control Handlers: Volume, Filter, Reverb
    // =====================================

    // --- Volume ---
    function applyVolume() {
        const value = parseInt(volumeSlider.value);
        volumeValue.textContent = `${value}%`;
        if (gainNode) {
            const volume = Math.pow(value / 100, 2); // Apply non-linear curve
            gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        }
    }
    volumeSlider.addEventListener("input", function() {
        resumeAudioContext(); // Ensure context is active on interaction
        applyVolume();
        localStorage.setItem("volume", volumeSlider.value);
    });
    // Load saved volume or set default
    const savedVolume = localStorage.getItem("volume");
    volumeSlider.value = savedVolume !== null ? savedVolume : 80;
    volumeValue.textContent = `${volumeSlider.value}%`;
    // applyVolume(); // Apply loaded/default volume via initializeAudioContext if possible

    // --- Filter ---
    function toggleFilter() {
        filterActive = !filterActive;
        filterToggleBtn.classList.toggle('active', filterActive);
        applyAudioFilter(); // Apply changes (either activate or bypass)
    }

    function updateFilterKnobVisual(value) {
        const knobIndicator = document.querySelector('.filter-container .knob-indicator');
        if (knobIndicator) {
            const rotationRange = 270; // -135 to +135 degrees
            const degree = ((value / 100) * rotationRange) - (rotationRange / 2);
            knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
        }
    }

    function applyAudioFilter() {
        if (!filterNode || !isAudioContextInitialized) return;

        if (!filterActive) { // Bypass if inactive
            filterNode.type = 'allpass';
            filterNode.frequency.setValueAtTime(audioContext.sampleRate / 2, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);
            return;
        }

        // Apply active filter settings
        const value = parseInt(filterSlider.value);
        const maxFreq = audioContext.sampleRate / 2;
        const minFreq = 20;
        const now = audioContext.currentTime;
        const transitionTime = 0.02; // Short transition

        if (value === 50) { // Center position - nearly bypass (high LP freq)
            filterNode.type = 'lowpass';
            filterNode.frequency.linearRampToValueAtTime(maxFreq * 0.99, now + transitionTime); // Avoid clicks at exact edge
            filterNode.Q.linearRampToValueAtTime(1, now + transitionTime);
        } else if (value < 50) { // Low-pass
            filterNode.type = 'lowpass';
            const normalizedValue = (49 - value) / 49; // 0 to 1 for low-pass range
            // Exponential frequency scaling for more musical control
            const freq = minFreq * Math.pow(maxFreq / minFreq, 1 - normalizedValue);
            filterNode.frequency.linearRampToValueAtTime(Math.max(minFreq, freq), now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1 + normalizedValue * 5, now + transitionTime); // Increase Q towards min freq
        } else { // High-pass (value > 50)
            filterNode.type = 'highpass';
            const normalizedValue = (value - 51) / 49; // 0 to 1 for high-pass range
            // Exponential frequency scaling
            const freq = minFreq * Math.pow(maxFreq / minFreq, normalizedValue);
            filterNode.frequency.linearRampToValueAtTime(Math.max(minFreq, freq), now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1 + normalizedValue * 5, now + transitionTime); // Increase Q towards max freq
        }
    }

    function resetFilterKnobToCenter() {
        filterSlider.value = 50;
        filterSlider.dispatchEvent(new Event('input')); // Trigger updates
    }

    filterSlider.addEventListener("input", function() {
        const currentValue = parseInt(filterSlider.value);
        updateFilterKnobVisual(currentValue);
        resumeAudioContext();
        applyAudioFilter();
    });
    filterToggleBtn.addEventListener('click', function() {
        resumeAudioContext();
        toggleFilter();
    });

    // --- Reverb ---
    function toggleReverb() {
        reverbActive = !reverbActive;
        reverbToggleBtn.classList.toggle('active', reverbActive);
        applyReverb(); // Apply changes (activate or set send to 0)
    }

    function updateReverbKnobVisual(value) {
        const knobIndicator = document.querySelector('.reverb-container .knob-indicator');
        if (knobIndicator) {
            const rotationRange = 270; // -135 to +135 degrees
            const degree = -135 + (value / 100) * rotationRange; // Map 0-100 to -135 to +135
            knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
        }
    }

    function applyReverb() {
        if (!reverbSendNode || !isAudioContextInitialized) return;

        const value = parseInt(reverbSlider.value);
        let sendAmount = 0;

        if (reverbActive) {
            // Calculate send amount - exponential curve for more effect at higher values
            sendAmount = Math.pow(value / 100, 1.1) * 1.5; // Max send boosted to 150%
        } // else sendAmount remains 0

        const now = audioContext.currentTime;
        const transitionTime = 0.05; // 50ms transition
        reverbSendNode.gain.linearRampToValueAtTime(sendAmount, now + transitionTime);
        // console.log(`Reverb Send: ${sendAmount.toFixed(3)} (Active: ${reverbActive})`);
    }

    function resetReverbKnobToDefault() {
        reverbSlider.value = 0;
        reverbSlider.dispatchEvent(new Event('input')); // Trigger updates
    }

    if (reverbSlider) { // Check if reverb elements exist
        reverbSlider.addEventListener("input", function() {
            const currentValue = parseInt(reverbSlider.value);
            updateReverbKnobVisual(currentValue);
            resumeAudioContext();
            applyReverb();
        });
        reverbToggleBtn.addEventListener('click', function() {
            resumeAudioContext();
            toggleReverb();
        });
    }

    function adjustReverbLowcut(direction) {
        if (!reverbLowcutNode || !isAudioContextInitialized) return;
        resumeAudioContext();

        let step = currentLowcutFreq * 0.1; // Exponential step (10%)
        if (direction === 'up') {
            currentLowcutFreq = Math.min(REVERB_LOWCUT_MAX, currentLowcutFreq + step);
        } else {
            currentLowcutFreq = Math.max(REVERB_LOWCUT_MIN, currentLowcutFreq - step);
        }

        const now = audioContext.currentTime;
        reverbLowcutNode.frequency.linearRampToValueAtTime(currentLowcutFreq, now + 0.05);
        console.log(`Reverb Lowcut: ${Math.round(currentLowcutFreq)} Hz`);
    }

    // =====================================
    // Knob Drag Logic (Filter & Reverb)
    // =====================================
    let isDragging = false;
    let dragTarget = null; // 'filter' or 'reverb'
    let startX, startY, startValue;

    function handleDragStart(e, target) {
        // Prevent text selection during drag
         if (e.preventDefault) e.preventDefault();

        isDragging = true;
        dragTarget = target;
        const coords = getEventCoords(e);
        startX = coords.x;
        startY = coords.y;
        startValue = parseInt(target === 'filter' ? filterSlider.value : reverbSlider.value);

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('touchmove', handleDragMove, { passive: false }); // Allow preventDefault
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('mouseleave', handleDragEnd); // Stop if mouse leaves window
    }

    function handleDragMove(e) {
        if (!isDragging) return;
        // Prevent page scroll on touch devices during drag
        if (e.preventDefault) e.preventDefault();

        const coords = getEventCoords(e);
        const deltaX = coords.x - startX;
        const deltaY = coords.y - startY; // Y increases downwards
        const change = (deltaX - deltaY) * sensitivity; // Vertical movement inverted
        let newValue = Math.round(startValue + change);

        // Apply snapping for filter knob
        if (dragTarget === 'filter' && Math.abs(newValue - 50) < 3) {
            newValue = 50;
        }

        // Clamp value between 0 and 100
        newValue = Math.max(0, Math.min(100, newValue));

        // Update the correct slider and trigger its input event
        const slider = dragTarget === 'filter' ? filterSlider : reverbSlider;
        if (slider && newValue !== parseInt(slider.value)) {
            slider.value = newValue;
            slider.dispatchEvent(new Event('input', { bubbles: true })); // Ensure event bubbles
        }
    }

    function handleDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        dragTarget = null;

        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('mouseleave', handleDragEnd);
    }

    // Add drag listeners to knob wrappers
    if (filterKnobWrapper) {
        filterKnobWrapper.addEventListener('mousedown', (e) => handleDragStart(e, 'filter'));
        filterKnobWrapper.addEventListener('touchstart', (e) => handleDragStart(e, 'filter'), { passive: false }); // Allow preventDefault
        filterKnobWrapper.addEventListener('dblclick', (e) => {
            e.preventDefault(); e.stopPropagation(); resetFilterKnobToCenter();
        });
    }
    if (reverbKnobWrapper) {
        reverbKnobWrapper.addEventListener('mousedown', (e) => handleDragStart(e, 'reverb'));
        reverbKnobWrapper.addEventListener('touchstart', (e) => handleDragStart(e, 'reverb'), { passive: false });
        reverbKnobWrapper.addEventListener('dblclick', (e) => {
            e.preventDefault(); e.stopPropagation(); resetReverbKnobToDefault();
        });
    }


    // =====================================
    // Initialize Controls and UI
    // =====================================
    function initializeControls() {
        // Initialize Filter
        filterSlider.value = 50;
        updateFilterKnobVisual(filterSlider.value);
        filterToggleBtn.classList.remove('active'); // Start inactive
        filterActive = false;

        // Initialize Reverb (if elements exist)
        if (reverbSlider) {
            reverbSlider.value = 0;
            updateReverbKnobVisual(reverbSlider.value);
            reverbToggleBtn.classList.remove('active'); // Start inactive
            reverbActive = false;
        }

        // Enable background playback for mobile
        enableBackgroundPlayback();
        setupMediaSession();

        // Apply initial volume (will be done in initializeAudioContext if called later)
        // applyVolume();

        // Set up 'feat' tags visibility
        document.querySelectorAll('.file-featured').forEach(item => {
            const mobileTag = item.querySelector('.file-number-container .feat-tag');
            if (mobileTag) mobileTag.style.display = 'inline-flex';
        });

        // Reset all item visuals initially
        resetAllItemsVisuals();

        // Draw the initial idle state for the visualizer IF canvas is ready
        if (canvasCtx) {
            requestAnimationFrame(drawVisualizer); // Use rAF ensures it draws after initial layout
        }
    }
    initializeControls();

    // =====================================
    // Event Listeners for File Items & Player
    // =====================================

    // --- File List Items ---
    document.querySelectorAll(".file-item").forEach(item => {
        const episodeLink = item.querySelector(".episode-link");
        const progressBar = item.querySelector(".progress-bar");
        const rewindBtn = item.querySelector(".rewind-btn");
        const forwardBtn = item.querySelector(".forward-btn");
        const playPauseBtn = item.querySelector(".play-pause-btn");

        // Main click on item link
        if (episodeLink) {
            episodeLink.addEventListener("click", function(e) {
                e.preventDefault();
                playTrack(item);
            });
        }

        // Progress bar seeking
        if (progressBar) {
            progressBar.addEventListener("click", function(e) {
                if (currentPlayingItem !== item || !audioPlayer.duration || isNaN(audioPlayer.duration)) return;
                resumeAudioContext();
                const rect = progressBar.getBoundingClientRect();
                const clickPosition = (e.clientX - rect.left) / rect.width;
                audioPlayer.currentTime = Math.max(0, Math.min(audioPlayer.duration, clickPosition * audioPlayer.duration));
                updateTime(); // Update visuals immediately
            });
        }

        // Player control buttons
        if (rewindBtn) {
            rewindBtn.addEventListener("click", function(e) {
                e.stopPropagation(); // Prevent item click
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
                // If this item isn't playing, start it. Otherwise, toggle play/pause.
                playTrack(item);
            });
        }
    });

    // --- Audio Player Events ---
    audioPlayer.addEventListener("timeupdate", updateTime);

    audioPlayer.addEventListener("loadedmetadata", () => {
        // Update time display as soon as duration is known
        updateTime();
    });

    audioPlayer.addEventListener("play", function() {
        resumeAudioContext(); // Ensure context is running
        if (currentPlayingItem) updateIcon(currentPlayingItem); // Update icon to 'pause'
        // Start visualizer ONLY if context is initialized and canvas exists
        if (isAudioContextInitialized && canvasCtx && !visualizerAnimationId) {
             // Ensure canvas size is correct before starting
            if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
                 canvas.width = canvas.offsetWidth;
                 canvas.height = canvas.offsetHeight;
             }
            console.log("Starting visualizer...");
            drawVisualizer(); // Start the loop
        }
    });

    audioPlayer.addEventListener("pause", function() {
        if (currentPlayingItem) updateIcon(currentPlayingItem); // Update icon to 'play'
        // Stop the visualizer loop by letting the drawVisualizer function return early
        // The check `if (audioPlayer.paused)` inside drawVisualizer handles this.
        // We set visualizerAnimationId to null inside drawVisualizer when it stops.
        console.log("Pausing visualizer (will stop on next frame).");
    });

    audioPlayer.addEventListener("ended", function() {
        // Stop visualizer explicitly and clear canvas
         if (visualizerAnimationId && cancelAnimationFrame) {
             cancelAnimationFrame(visualizerAnimationId);
         }
         visualizerAnimationId = null;
         if(canvasCtx && canvas) canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
         console.log("Stopping visualizer (ended).");

         // Reset the specific item that just finished
         if (currentPlayingItem) {
            currentPlayingItem.classList.remove("expanded");
            updateIcon(currentPlayingItem); // Set icon back to play
            const timeIndicator = currentPlayingItem.querySelector(".time-indicator");
            if (timeIndicator) timeIndicator.style.display = "none";
            const progressFilled = currentPlayingItem.querySelector(".progress-filled");
            if (progressFilled) progressFilled.style.width = "0%";
         }
        currentPlayingItem = null; // Clear the currently playing item state
    });

    // --- Window Resize ---
    window.addEventListener('resize', () => {
        // Update canvas drawing buffer size if canvas exists
        if (canvas) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            // No need to restart drawing if already playing, it adapts
        }
    });

    // =====================================
    // Keyboard Shortcuts
    // =====================================
    document.addEventListener('keydown', function(e) {
        // Ignore shortcuts if typing in an input field
        if (e.target.tagName === 'INPUT') return;

        // Space bar: Toggle Play/Pause for current track
        if (e.code === 'Space' && currentPlayingItem) {
            e.preventDefault();
            playTrack(currentPlayingItem); // Toggle play/pause
        }

        // T: Toggle Theme
        if (e.code === 'KeyT') {
            toggleTheme();
        }

        // R: Reset Filter Knob
        if (e.code === 'KeyR') {
            resetFilterKnobToCenter();
        }

        // B: Reset Reverb Knob
        if (e.code === 'KeyB' && reverbSlider) {
            resetReverbKnobToDefault();
        }

        // F: Toggle Filter On/Off
        if (e.code === 'KeyF') {
            toggleFilter();
        }

        // V: Toggle Reverb On/Off
        if (e.code === 'KeyV' && reverbToggleBtn) {
            toggleReverb();
        }

        // Arrow Up/Down: Master Volume
        if (e.code === 'ArrowUp') {
             e.preventDefault();
             let currentVolume = parseInt(volumeSlider.value);
             if (currentVolume < 100) {
                 volumeSlider.value = Math.min(100, currentVolume + 5);
                 volumeSlider.dispatchEvent(new Event('input'));
             }
        }
        if (e.code === 'ArrowDown') {
             e.preventDefault();
             let currentVolume = parseInt(volumeSlider.value);
             if (currentVolume > 0) {
                volumeSlider.value = Math.max(0, currentVolume - 5);
                volumeSlider.dispatchEvent(new Event('input'));
             }
        }

        // Arrow Left/Right: Filter Knob
        if (e.code === 'ArrowLeft') {
            e.preventDefault();
            let currentFilter = parseInt(filterSlider.value);
            if (currentFilter > 0) {
                filterSlider.value = Math.max(0, currentFilter - 2);
                filterSlider.dispatchEvent(new Event('input'));
            }
        }
        if (e.code === 'ArrowRight') {
            e.preventDefault();
            let currentFilter = parseInt(filterSlider.value);
            if (currentFilter < 100) {
                filterSlider.value = Math.min(100, currentFilter + 2);
                filterSlider.dispatchEvent(new Event('input'));
            }
        }

        // Brackets Left/Right: Adjust Reverb Lowcut Frequency
        if (e.code === 'BracketLeft') {
            e.preventDefault();
            adjustReverbLowcut('down');
        }
        if (e.code === 'BracketRight') {
            e.preventDefault();
            adjustReverbLowcut('up');
        }
    });

}); // End DOMContentLoaded