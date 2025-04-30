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
    const waveformCanvas = document.getElementById('waveformCanvas');

    // --- State Variables ---
    let currentPlayingItem = null;
    let filterActive = false;
    let reverbActive = false;
    let isAudioContextInitialized = false;
    let visualizerAnimationId = null;
    let currentLowcutFreq = 200;
    let effectsActive = true;
    
    // --- Web Audio API Variables ---
    let audioContext;
    let gainNode;
    let filterNode;
    let analyserNode;
    let audioSourceNode;
    let reverbSendNode;
    let reverbLowcutNode;
    let convolver;
    let reverbReturnNode;
    
    // --- Canvas Variables ---
    let canvas, canvasCtx, dataArray, bufferLength;

    // --- Constants ---
    const SKIP_TIME = 30;
    const REVERB_LOWCUT_MIN = 80;
    const REVERB_LOWCUT_MAX = 800;
    const sensitivity = 0.15;

    // =====================================
    // Enable console timestamps for better debugging
    // =====================================
    const originalConsoleLog = console.log;
    console.log = function() {
        const time = new Date().toTimeString().split(' ')[0];
        originalConsoleLog.apply(console, [`[${time}]`, ...arguments]);
    };

    // =====================================
    // PROXY URL HANDLING 
    // =====================================
    
    // Function to proxy audio URLs to avoid CORS issues
    function getProxiedUrl(originalUrl) {
        // Skip if already proxied
        if (originalUrl.includes('allorigins') || originalUrl.includes('cors-anywhere')) {
            return originalUrl;
        }
        
        // Try different proxies based on availability
        // This one has high reliability for audio files
        return `https://api.allorigins.win/raw?url=${encodeURIComponent(originalUrl)}`;
    }
    
    // =====================================
    // CORE PLAYER FUNCTIONS
    // =====================================
    
    // Play a track
    function playTrack(item) {
        const link = item.querySelector(".episode-link");
        if (!link) return;
        
        // Get original and proxied URLs
        const originalSrc = link.getAttribute("data-original-url") || link.getAttribute("href");
        const proxiedSrc = getProxiedUrl(originalSrc);
        
        console.log("Playing track:", originalSrc);
        console.log("Using proxied URL:", proxiedSrc);
        
        // Toggle play/pause if clicking on current item
        if (currentPlayingItem === item) {
            if (audioPlayer.paused) {
                audioPlayer.play().catch(e => console.error("Play error:", e));
            } else {
                audioPlayer.pause();
            }
            updateIcon(item);
            return;
        }

        // Reset UI for all tracks
        resetAllItemsVisuals();
        
        // Set new current item
        currentPlayingItem = item;
        
        // Apply volume
        const volumePercent = parseInt(volumeSlider.value);
        audioPlayer.volume = volumePercent / 100;
        
        // Set source and play
        audioPlayer.src = proxiedSrc;
        audioPlayer.load();
        
        const playPromise = audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.error("Error playing audio:", e);
                
                // Special fallback for user interaction requirement
                if (e.name === 'NotAllowedError') {
                    alert("Please click again to start playback. This is required by your browser for audio to work.");
                }
            });
        }
        
        // Update metadata and UI
        const trackName = item.querySelector('.file-number')?.textContent || '';
        const episodeDate = item.querySelector('.file-date')?.textContent || '';
        updateMediaSessionMetadata(trackName, episodeDate);
        
        item.classList.add("expanded");
        updateIcon(item);
        const timeIndicator = item.querySelector(".time-indicator");
        if (timeIndicator) {
            timeIndicator.style.display = "block";
        }
        
        // Initialize audio context for effects after a delay
        if (document.visibilityState === 'visible' && !isAudioContextInitialized) {
            setTimeout(() => {
                try {
                    initializeAudioContext();
                } catch (err) {
                    console.error("Failed to initialize audio effects:", err);
                    // Basic playback will still work
                }
            }, 500);
        }
    }
    
    // Reset all playlist items to initial state
    function resetAllItemsVisuals() {
        document.querySelectorAll(".file-item").forEach(item => {
            item.classList.remove("expanded");
            
            const iconElement = item.querySelector(".file-icon svg");
            if (iconElement) iconElement.setAttribute("data-icon", "play");
            
            const timeIndicator = item.querySelector(".time-indicator");
            if (timeIndicator && item !== currentPlayingItem) {
                timeIndicator.style.display = "none";
                timeIndicator.textContent = "00:00 / 00:00";
            }
            
            const expandedPlayBtn = item.querySelector(".play-pause-btn svg");
            if (expandedPlayBtn) expandedPlayBtn.setAttribute("data-icon", "play");
            
            const progressFilled = item.querySelector(".progress-filled");
            if (progressFilled) progressFilled.style.width = "0%";
        });
    }
    
    // Update play/pause icons
    function updateIcon(item) {
        if (!item) return;
        
        const iconElement = item.querySelector(".file-icon svg");
        const expandedPlayBtn = item.querySelector(".play-pause-btn svg");
        const isPaused = audioPlayer.paused;
        const iconName = isPaused ? "play" : "pause";
        
        if (iconElement) iconElement.setAttribute("data-icon", iconName);
        if (expandedPlayBtn) expandedPlayBtn.setAttribute("data-icon", iconName);
    }
    
    // Update track time display and progress bar
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
        
        if (progressFilled && !isNaN(audioPlayer.duration)) {
            const progressPercentage = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progressFilled.style.width = `${progressPercentage}%`;
        }
        
        // Update Media Session API position
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            navigator.mediaSession.setPositionState({
                duration: audioPlayer.duration || 0,
                playbackRate: audioPlayer.playbackRate,
                position: audioPlayer.currentTime || 0
            });
        }
    }

    // =====================================
    // BACKGROUND PLAYBACK SUPPORT
    // =====================================
    
    // Set up background playback support
    function setupBackgroundPlayback() {
        // Essential attributes for mobile playback
        audioPlayer.setAttribute('playsinline', '');
        audioPlayer.setAttribute('webkit-playsinline', '');
        audioPlayer.setAttribute('preload', 'metadata');
        
        // Set up Media Session API
        setupMediaSession();
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Mobile browsers require user interaction
        document.addEventListener('touchstart', function handleFirstTouch() {
            document.removeEventListener('touchstart', handleFirstTouch);
            if (audioPlayer) {
                audioPlayer.load();
            }
        }, { once: true });
    }
    
    // Handle visibility changes 
    function handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            // Page going to background
            if (!audioPlayer.paused) {
                console.log("Page hidden, preserving background playback");
                disableEffects();
            }
        } else if (document.visibilityState === 'visible') {
            // Page becoming visible again
            if (!audioPlayer.paused) {
                console.log("Page visible again, re-enabling effects if needed");
                
                if (!isAudioContextInitialized) {
                    setTimeout(() => {
                        try {
                            initializeAudioContext();
                        } catch (e) {
                            console.error("Failed to initialize audio context:", e);
                        }
                    }, 300);
                } else if (!effectsActive) {
                    enableEffects();
                }
            }
        }
    }
    
    // Disable audio effects for background playback
    function disableEffects() {
        if (effectsActive && isAudioContextInitialized && audioContext) {
            try {
                // Save volume setting
                const volumePercent = parseInt(volumeSlider.value);
                
                // Disconnect audio processing
                if (audioSourceNode) {
                    try {
                        audioSourceNode.disconnect();
                    } catch (e) {
                        console.log("Disconnect error:", e);
                    }
                }
                
                // Set direct volume
                audioPlayer.volume = volumePercent / 100;
                
                // Stop visualizer
                if (visualizerAnimationId) {
                    cancelAnimationFrame(visualizerAnimationId);
                    visualizerAnimationId = null;
                }
                
                effectsActive = false;
                console.log("Effects disabled for background playback");
            } catch (e) {
                console.error("Error disabling effects:", e);
            }
        }
    }
    
    // Re-enable audio effects
    function enableEffects() {
        if (!effectsActive && !audioPlayer.paused && isAudioContextInitialized) {
            try {
                // Resume audio context if needed
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                
                // Reconnect audio graph
                try {
                    reconnectAudioGraph();
                    
                    // Apply effects
                    applyVolume();
                    if (filterActive) applyAudioFilter();
                    if (reverbActive) applyReverb();
                    
                    // Restart visualizer
                    if (canvasCtx && !visualizerAnimationId) {
                        drawVisualizer();
                    }
                    
                    effectsActive = true;
                    console.log("Effects re-enabled");
                } catch (e) {
                    console.error("Error reconnecting audio:", e);
                }
            } catch (e) {
                console.error("Error enabling effects:", e);
            }
        }
    }
    
    // Reconnect audio graph
    function reconnectAudioGraph() {
        if (!audioContext) return;
        
        try {
            // Create new source node
            const source = audioContext.createMediaElementSource(audioPlayer);
            audioSourceNode = source;
            
            // Connect main path
            source.connect(gainNode);
            gainNode.connect(analyserNode);
            analyserNode.connect(filterNode);
            filterNode.connect(audioContext.destination);
            
            // Connect reverb path
            source.connect(reverbSendNode);
            reverbSendNode.connect(reverbLowcutNode);
            reverbLowcutNode.connect(convolver);
            convolver.connect(reverbReturnNode);
            reverbReturnNode.connect(gainNode);
            
            console.log("Audio graph reconnected");
        } catch (e) {
            console.error("Graph connection error:", e);
            throw e;
        }
    }
    
    // Setup Media Session API
    function setupMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => {
                if (currentPlayingItem) {
                    audioPlayer.play().catch(e => console.error("Media session play error:", e));
                    updateIcon(currentPlayingItem);
                }
            });
            
            navigator.mediaSession.setActionHandler('pause', () => {
                audioPlayer.pause();
                if (currentPlayingItem) updateIcon(currentPlayingItem);
            });
            
            navigator.mediaSession.setActionHandler('seekbackward', () => {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - SKIP_TIME);
                updateTime();
            });
            
            navigator.mediaSession.setActionHandler('seekforward', () => {
                if (audioPlayer.duration) {
                    audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + SKIP_TIME);
                    updateTime();
                }
            });
        }
    }
    
    // Update media session metadata
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
    // AUDIO EFFECTS SETUP
    // =====================================
    
    // Initialize Web Audio API
    function initializeAudioContext() {
        if (isAudioContextInitialized) return;
        
        try {
            // Create audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("Created Audio Context:", audioContext.state);
            
            // Create nodes
            gainNode = audioContext.createGain();
            filterNode = audioContext.createBiquadFilter();
            analyserNode = audioContext.createAnalyser();
            reverbSendNode = audioContext.createGain();
            reverbLowcutNode = audioContext.createBiquadFilter();
            convolver = audioContext.createConvolver();
            reverbReturnNode = audioContext.createGain();
            
            try {
                // Get audio source
                const source = audioContext.createMediaElementSource(audioPlayer);
                audioSourceNode = source;
                
                // Connect main path
                source.connect(gainNode);
                
                // Connect reverb send path
                source.connect(reverbSendNode);
                
                console.log("Audio source connected successfully");
            } catch (sourceError) {
                console.error("Error creating audio source:", sourceError);
                // Try to recover
                if (sourceError.message && sourceError.message.includes("already been connected")) {
                    console.log("Audio element already connected - trying alternate approach");
                }
                throw sourceError;
            }
            
            // Connect the rest of the graph
            gainNode.connect(analyserNode);
            analyserNode.connect(filterNode);
            filterNode.connect(audioContext.destination);
            
            reverbSendNode.connect(reverbLowcutNode);
            reverbLowcutNode.connect(convolver);
            convolver.connect(reverbReturnNode);
            reverbReturnNode.connect(gainNode);
            
            // Configure nodes
            analyserNode.fftSize = 2048;
            bufferLength = analyserNode.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            
            reverbLowcutNode.type = 'highpass';
            reverbLowcutNode.frequency.value = currentLowcutFreq;
            reverbLowcutNode.Q.value = 0.7;
            reverbSendNode.gain.value = 0;
            reverbReturnNode.gain.value = 1.4;
            createReverbImpulse();
            
            filterNode.type = 'allpass';
            filterNode.frequency.setValueAtTime(audioContext.sampleRate / 2, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);
            
            // Apply volume
            applyVolume();
            
            isAudioContextInitialized = true;
            effectsActive = true;
            console.log("Audio Context successfully initialized");
            
            // Start visualizer if playing
            if (!audioPlayer.paused && canvasCtx) {
                drawVisualizer();
            }
        } catch (e) {
            console.error("Failed to initialize Web Audio API:", e);
            isAudioContextInitialized = false;
            effectsActive = false;
        }
    }
    
    // Resume AudioContext
    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log("Audio context resumed:", audioContext.state);
            }).catch(e => {
                console.error("Error resuming audio context:", e);
            });
        }
    }
    
    // =====================================
    // AUDIO EFFECTS: REVERB
    // =====================================
    
    // Generate reverb impulse
    function createReverbImpulse() {
        if (!audioContext || !convolver) return;
        
        const sampleRate = audioContext.sampleRate;
        const length = 1.2 * sampleRate;
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
            const time = i / length;
            let amplitude;
            
            if (time < 0.1) {
                // Early reflections
                amplitude = Math.pow((1 - time / 0.1), 0.02) * 1.3;
            } else {
                // Late reflections
                amplitude = Math.pow((1 - (time - 0.1) / 0.9), 0.9) * 0.5;
            }
            
            left[i] = (Math.random() * 2 - 1) * amplitude;
            right[i] = (Math.random() * 2 - 1) * amplitude;
        }
        
        // Smoothing
        const smoothL = 0.1, smoothR = 0.12;
        for (let i = 1; i < length; i++) {
            left[i] = left[i] * (1 - smoothL) + left[i-1] * smoothL;
            right[i] = right[i] * (1 - smoothR) + right[i-1] * smoothR;
        }
        
        // Preserve high frequencies
        for (let i = length - 2; i >= 0; i--) {
            left[i] = left[i] * 0.9 + left[i+1] * 0.1;
            right[i] = right[i] * 0.9 + right[i+1] * 0.1;
        }
        
        convolver.buffer = impulse;
        console.log("Reverb impulse created");
    }
    
    // Toggle reverb
    function toggleReverb() {
        if (!isAudioContextInitialized) {
            try {
                initializeAudioContext();
            } catch (e) {
                console.error("Cannot initialize audio for reverb:", e);
                return;
            }
        }
        
        if (!effectsActive) {
            console.log("Effects not active, can't toggle reverb");
            return;
        }
        
        reverbActive = !reverbActive;
        reverbToggleBtn.classList.toggle('active', reverbActive);
        applyReverb();
    }
    
    // Apply reverb settings
    function applyReverb() {
        if (!reverbSendNode || !isAudioContextInitialized || !effectsActive) return;
        
        resumeAudioContext();
        
        const value = parseInt(reverbSlider.value);
        let sendAmount = 0;
        
        if (reverbActive) {
            sendAmount = Math.pow(value / 100, 1.1) * 1.5;
        }
        
        reverbSendNode.gain.linearRampToValueAtTime(
            sendAmount, 
            audioContext.currentTime + 0.05
        );
    }
    
    // Adjust reverb lowcut
    function adjustReverbLowcut(direction) {
        if (!reverbLowcutNode || !isAudioContextInitialized || !effectsActive) return;
        
        resumeAudioContext();
        
        let step = currentLowcutFreq * 0.1;
        if (direction === 'up') {
            currentLowcutFreq = Math.min(REVERB_LOWCUT_MAX, currentLowcutFreq + step);
        } else {
            currentLowcutFreq = Math.max(REVERB_LOWCUT_MIN, currentLowcutFreq - step);
        }
        
        reverbLowcutNode.frequency.linearRampToValueAtTime(
            currentLowcutFreq, 
            audioContext.currentTime + 0.05
        );
    }
    
    // Update reverb knob visual
    function updateReverbKnobVisual(value) {
        const knobIndicator = document.querySelector('.reverb-container .knob-indicator');
        if (knobIndicator) {
            const rotationRange = 270;
            const degree = -135 + (value / 100) * rotationRange;
            knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
        }
    }
    
    // Reset reverb
    function resetReverbKnobToDefault() {
        reverbSlider.value = 0;
        reverbSlider.dispatchEvent(new Event('input'));
    }
    
    // =====================================
    // AUDIO EFFECTS: FILTER
    // =====================================
    
    // Toggle filter
    function toggleFilter() {
        if (!isAudioContextInitialized) {
            try {
                initializeAudioContext();
            } catch (e) {
                console.error("Cannot initialize audio for filter:", e);
                return;
            }
        }
        
        if (!effectsActive) {
            console.log("Effects not active, can't toggle filter");
            return;
        }
        
        filterActive = !filterActive;
        filterToggleBtn.classList.toggle('active', filterActive);
        applyAudioFilter();
    }
    
    // Apply filter
    function applyAudioFilter() {
        if (!filterNode || !isAudioContextInitialized || !effectsActive) return;
        
        resumeAudioContext();
        
        if (!filterActive) {
            // Bypass
            filterNode.type = 'allpass';
            filterNode.frequency.setValueAtTime(
                audioContext.sampleRate / 2, 
                audioContext.currentTime
            );
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);
            return;
        }
        
        // Apply filter
        const value = parseInt(filterSlider.value);
        const maxFreq = audioContext.sampleRate / 2;
        const minFreq = 20;
        const now = audioContext.currentTime;
        const transitionTime = 0.02;
        
        if (value === 50) {
            // Center - neutral
            filterNode.type = 'lowpass';
            filterNode.frequency.linearRampToValueAtTime(maxFreq * 0.99, now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1, now + transitionTime);
        } else if (value < 50) {
            // Low-pass
            filterNode.type = 'lowpass';
            const normalizedValue = (49 - value) / 49;
            const freq = minFreq * Math.pow(maxFreq / minFreq, 1 - normalizedValue);
            filterNode.frequency.linearRampToValueAtTime(Math.max(minFreq, freq), now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1 + normalizedValue * 5, now + transitionTime);
        } else {
            // High-pass
            filterNode.type = 'highpass';
            const normalizedValue = (value - 51) / 49;
            const freq = minFreq * Math.pow(maxFreq / minFreq, normalizedValue);
            filterNode.frequency.linearRampToValueAtTime(Math.max(minFreq, freq), now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1 + normalizedValue * 5, now + transitionTime);
        }
    }
    
    // Update filter knob visual
    function updateFilterKnobVisual(value) {
        const knobIndicator = document.querySelector('.filter-container .knob-indicator');
        if (knobIndicator) {
            const rotationRange = 270;
            const degree = ((value / 100) * rotationRange) - (rotationRange / 2);
            knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
        }
    }
    
    // Reset filter
    function resetFilterKnobToCenter() {
        filterSlider.value = 50;
        filterSlider.dispatchEvent(new Event('input'));
    }
    
    // =====================================
    // VISUALIZER
    // =====================================
    
    // Initialize canvas
    if (waveformCanvas) {
        canvas = waveformCanvas;
        canvasCtx = canvas.getContext('2d');
        try {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        } catch (e) {
            console.error("Error setting canvas size:", e);
        }
    }
    
    // Draw visualizer
    function drawVisualizer() {
        const zoomFactor = 1;
        
        // Ensure canvas is available
        if (!canvasCtx || !canvas) {
            visualizerAnimationId = null;
            return;
        }
        
        // Get theme colors
        const computedStyle = getComputedStyle(document.documentElement);
        const strokeColor = computedStyle.getPropertyValue('--accent-color').trim();
        const idleColor = computedStyle.getPropertyValue('--slider-bg').trim();
        
        // Draw active waveform or idle state
        if (!audioPlayer.paused && isAudioContextInitialized && analyserNode && effectsActive) {
            visualizerAnimationId = requestAnimationFrame(drawVisualizer);
            
            // Get data
            analyserNode.getByteTimeDomainData(dataArray);
            
            // Clear canvas
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw waveform
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = strokeColor || '#8B9D83';
            canvasCtx.beginPath();
            
            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;
            const centerY = canvas.height / 2;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = centerY + (v * centerY - centerY) * zoomFactor;
                
                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }
            
            canvasCtx.lineTo(canvas.width, centerY);
            canvasCtx.stroke();
        } else {
            // Draw idle state
            visualizerAnimationId = null;
            
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = idleColor || 'rgba(139, 157, 131, 0.2)';
            canvasCtx.beginPath();
            canvasCtx.moveTo(0, canvas.height / 2);
            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();
        }
    }
    
    // =====================================
    // VOLUME CONTROL
    // =====================================
    
    // Apply volume 
    function applyVolume() {
        const value = parseInt(volumeSlider.value);
        volumeValue.textContent = `${value}%`;
        
        // Always set volume directly on audio element
        audioPlayer.volume = value / 100;
        
        // Set Web Audio volume if active
        if (gainNode && isAudioContextInitialized && effectsActive) {
            resumeAudioContext();
            const volume = Math.pow(value / 100, 2); 
            gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        }
    }
    
    // =====================================
    // THEME TOGGLE
    // =====================================
    
    // Load saved theme
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    
    // Toggle theme
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
    }
    
    // =====================================
    // KNOB DRAG HANDLING
    // =====================================
    
    let isDragging = false;
    let dragTarget = null;
    let startX, startY, startValue;
    
    function getEventCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }
    
    function handleDragStart(e, target) {
        if (e.preventDefault) e.preventDefault();
        
        isDragging = true;
        dragTarget = target;
        const coords = getEventCoords(e);
        startX = coords.x;
        startY = coords.y;
        startValue = parseInt(target === 'filter' ? filterSlider.value : reverbSlider.value);
        
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('mouseleave', handleDragEnd);
    }
    
    function handleDragMove(e) {
        if (!isDragging) return;
        if (e.preventDefault) e.preventDefault();
        
        const coords = getEventCoords(e);
        const deltaX = coords.x - startX;
        const deltaY = coords.y - startY;
        const change = (deltaX - deltaY) * sensitivity;
        let newValue = Math.round(startValue + change);
        
        // Snap filter knob to center
        if (dragTarget === 'filter' && Math.abs(newValue - 50) < 3) {
            newValue = 50;
        }
        
        // Clamp value
        newValue = Math.max(0, Math.min(100, newValue));
        
        // Update slider
        const slider = dragTarget === 'filter' ? filterSlider : reverbSlider;
        if (slider && newValue !== parseInt(slider.value)) {
            slider.value = newValue;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
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
    
    // =====================================
    // UTILITY FUNCTIONS
    // =====================================
    
    // Format time as MM:SS
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "00:00";
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // =====================================
    // INITIALIZATION AND EVENT LISTENERS
    // =====================================
    
    // Initialize player controls
    function initializeControls() {
        console.log("Initializing player...");
        
        // Set up filter knob
        filterSlider.value = 50;
        updateFilterKnobVisual(50);
        filterToggleBtn.classList.remove('active');
        filterActive = false;
        
        // Set up reverb knob
        if (reverbSlider) {
            reverbSlider.value = 0;
            updateReverbKnobVisual(0);
            reverbToggleBtn.classList.remove('active');
            reverbActive = false;
        }
        
        // CRITICAL: Apply proxy to all audio links
        console.log("Applying proxy to all audio links...");
        document.querySelectorAll(".episode-link").forEach(link => {
            const originalHref = link.getAttribute("href");
            console.log("Processing link:", originalHref);
            const proxiedHref = getProxiedUrl(originalHref);
            
            // Store original URL
            link.setAttribute("data-original-url", originalHref);
            
            // Update href with proxied URL
            link.setAttribute("href", proxiedHref);
            console.log("Updated to:", proxiedHref);
        });
        
        // Set up background playback
        setupBackgroundPlayback();
        
        // Load saved volume or set default
        const savedVolume = localStorage.getItem("volume");
        volumeSlider.value = savedVolume !== null ? savedVolume : 80;
        volumeValue.textContent = `${volumeSlider.value}%`;
        
        // Set direct volume immediately
        audioPlayer.volume = parseInt(volumeSlider.value) / 100;
        
        // Set up featured tags
        document.querySelectorAll('.file-featured').forEach(item => {
            const mobileTag = item.querySelector('.file-number-container .feat-tag');
            if (mobileTag) mobileTag.style.display = 'inline-flex';
        });
        
        // Reset all player items
        resetAllItemsVisuals();
        
        // Draw initial visualizer state
        if (canvasCtx) {
            drawVisualizer();
        }
        
        console.log("Player initialized successfully");
    }
    
    // =====================================
    // EVENT LISTENERS
    // =====================================
    
    // Theme toggle click
    themeToggle.addEventListener("click", toggleTheme);
    
    // Volume control
    volumeSlider.addEventListener("input", function() {
        applyVolume();
        localStorage.setItem("volume", volumeSlider.value);
    });
    
    // Filter controls
    filterSlider.addEventListener("input", function() {
        const currentValue = parseInt(filterSlider.value);
        updateFilterKnobVisual(currentValue);
        if (effectsActive) {
            resumeAudioContext();
            applyAudioFilter();
        }
    });
    
    filterToggleBtn.addEventListener('click', function() {
        toggleFilter();
    });
    
    // Reverb controls
    if (reverbSlider) {
        reverbSlider.addEventListener("input", function() {
            const currentValue = parseInt(reverbSlider.value);
            updateReverbKnobVisual(currentValue);
            if (effectsActive) {
                resumeAudioContext();
                applyReverb();
            }
        });
        
        reverbToggleBtn.addEventListener('click', function() {
            toggleReverb();
        });
    }
    
    // Knob drag controls
    if (filterKnobWrapper) {
        filterKnobWrapper.addEventListener('mousedown', (e) => handleDragStart(e, 'filter'));
        filterKnobWrapper.addEventListener('touchstart', (e) => handleDragStart(e, 'filter'), { passive: false });
        filterKnobWrapper.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            resetFilterKnobToCenter();
        });
    }
    
    if (reverbKnobWrapper) {
        reverbKnobWrapper.addEventListener('mousedown', (e) => handleDragStart(e, 'reverb'));
        reverbKnobWrapper.addEventListener('touchstart', (e) => handleDragStart(e, 'reverb'), { passive: false });
        reverbKnobWrapper.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            resetReverbKnobToDefault();
        });
    }
    
    // Audio player events
    audioPlayer.addEventListener("timeupdate", updateTime);
    
    audioPlayer.addEventListener("loadedmetadata", () => {
        updateTime();
    });
    
    audioPlayer.addEventListener("play", function() {
        if (document.visibilityState === 'visible' && !isAudioContextInitialized) {
            // Initialize effects on first play if visible
            setTimeout(() => {
                try {
                    initializeAudioContext();
                } catch (err) {
                    console.error("Failed to initialize audio effects on play:", err);
                }
            }, 300);
        } else if (isAudioContextInitialized && !effectsActive && document.visibilityState === 'visible') {
            // Re-enable effects if they were disabled
            enableEffects();
        }
        
        if (currentPlayingItem) {
            updateIcon(currentPlayingItem);
        }
        
        // Start visualizer if effects are active
        if (isAudioContextInitialized && effectsActive && canvasCtx && !visualizerAnimationId) {
            drawVisualizer();
        }
    });
    
    audioPlayer.addEventListener("pause", function() {
        if (currentPlayingItem) {
            updateIcon(currentPlayingItem);
        }
    });
    
    audioPlayer.addEventListener("ended", function() {
        // Stop visualizer
        if (visualizerAnimationId) {
            cancelAnimationFrame(visualizerAnimationId);
            visualizerAnimationId = null;
        }
        
        // Clear canvas
        if (canvasCtx && canvas) {
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            drawVisualizer(); // Draw idle state
        }
        
        // Reset track UI
        if (currentPlayingItem) {
            currentPlayingItem.classList.remove("expanded");
            updateIcon(currentPlayingItem);
            const timeIndicator = currentPlayingItem.querySelector(".time-indicator");
            if (timeIndicator) timeIndicator.style.display = "none";
            const progressFilled = currentPlayingItem.querySelector(".progress-filled");
            if (progressFilled) progressFilled.style.width = "0%";
        }
        
        currentPlayingItem = null;
    });
    
    // Error handling for audio
    audioPlayer.addEventListener("error", function(e) {
        console.error("Audio error:", audioPlayer.error);
        if (audioPlayer.error && audioPlayer.error.code) {
            switch(audioPlayer.error.code) {
                case 1: // MEDIA_ERR_ABORTED
                    console.error("Audio playback aborted");
                    break;
                case 2: // MEDIA_ERR_NETWORK
                    console.error("Network error during audio loading");
                    alert("Network error loading audio. Please check your connection.");
                    break;
                case 3: // MEDIA_ERR_DECODE
                    console.error("Audio decoding error");
                    break;
                case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                    console.error("Audio format not supported");
                    alert("This audio format is not supported by your browser.");
                    break;
                default:
                    console.error("Unknown audio error");
            }
        }
    });
    
    // Window resize
    window.addEventListener('resize', () => {
        if (canvas) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }
    });
    
    // Set up file item click handlers
    document.querySelectorAll(".file-item").forEach(item => {
        const episodeLink = item.querySelector(".episode-link");
        const progressBar = item.querySelector(".progress-bar");
        const rewindBtn = item.querySelector(".rewind-btn");
        const forwardBtn = item.querySelector(".forward-btn");
        const playPauseBtn = item.querySelector(".play-pause-btn");
        
        // Prevent default link behavior and play track
        if (episodeLink) {
            episodeLink.addEventListener("click", function(e) {
                e.preventDefault();
                e.stopPropagation();
                playTrack(item);
                return false;
            });
        }
        
        // Progress bar seeking
        if (progressBar) {
            progressBar.addEventListener("click", function(e) {
                if (currentPlayingItem !== item || !audioPlayer.duration || isNaN(audioPlayer.duration)) return;
                const rect = progressBar.getBoundingClientRect();
                const clickPosition = (e.clientX - rect.left) / rect.width;
                audioPlayer.currentTime = Math.max(0, Math.min(audioPlayer.duration, clickPosition * audioPlayer.duration));
                updateTime();
            });
        }
        
        // Control buttons
        if (rewindBtn) {
            rewindBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                if (currentPlayingItem !== item) return;
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - SKIP_TIME);
                updateTime();
            });
        }
        
        if (forwardBtn) {
            forwardBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                if (currentPlayingItem !== item || !audioPlayer.duration) return;
                audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + SKIP_TIME);
                updateTime();
            });
        }
        
        if (playPauseBtn) {
            playPauseBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                playTrack(item);
            });
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Skip if typing in an input
        if (e.target.tagName === 'INPUT') return;
        
        // Space - Toggle play/pause
        if (e.code === 'Space' && currentPlayingItem) {
            e.preventDefault();
            playTrack(currentPlayingItem);
        }
        
        // T - Toggle theme
        if (e.code === 'KeyT') {
            toggleTheme();
        }
        
        // R - Reset filter knob
        if (e.code === 'KeyR') {
            resetFilterKnobToCenter();
        }
        
        // B - Reset reverb knob
        if (e.code === 'KeyB' && reverbSlider) {
            resetReverbKnobToDefault();
        }
        
        // F - Toggle filter
        if (e.code === 'KeyF') {
            toggleFilter();
        }
        
        // V - Toggle reverb
        if (e.code === 'KeyV' && reverbToggleBtn) {
            toggleReverb();
        }
        
        // Arrow Up/Down - Volume
        if (e.code === 'ArrowUp') {
            e.preventDefault();
            const currentVolume = parseInt(volumeSlider.value);
            if (currentVolume < 100) {
                volumeSlider.value = Math.min(100, currentVolume + 5);
                volumeSlider.dispatchEvent(new Event('input'));
            }
        }
        
        if (e.code === 'ArrowDown') {
            e.preventDefault();
            const currentVolume = parseInt(volumeSlider.value);
            if (currentVolume > 0) {
                volumeSlider.value = Math.max(0, currentVolume - 5);
                volumeSlider.dispatchEvent(new Event('input'));
            }
        }
        
        // Arrow Left/Right - Filter
        if (e.code === 'ArrowLeft') {
            e.preventDefault();
            const currentFilter = parseInt(filterSlider.value);
            if (currentFilter > 0) {
                filterSlider.value = Math.max(0, currentFilter - 2);
                filterSlider.dispatchEvent(new Event('input'));
            }
        }
        
        if (e.code === 'ArrowRight') {
            e.preventDefault();
            const currentFilter = parseInt(filterSlider.value);
            if (currentFilter < 100) {
                filterSlider.value = Math.min(100, currentFilter + 2);
                filterSlider.dispatchEvent(new Event('input'));
            }
        }
        
        // Brackets - Adjust reverb lowcut
        if (e.code === 'BracketLeft') {
            e.preventDefault();
            adjustReverbLowcut('down');
        }
        
        if (e.code === 'BracketRight') {
            e.preventDefault();
            adjustReverbLowcut('up');
        }
    });
    
    // Initialize the player
    initializeControls();
});