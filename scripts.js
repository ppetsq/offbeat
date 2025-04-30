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
    let effectsActive = true; // Flag to track if we're using effects

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
    // CORE PLAYER FUNCTIONS
    // =====================================
    
    // Play a track
    function playTrack(item) {
        const link = item.querySelector(".episode-link");
        if (!link) return;
        
        const src = link.getAttribute("href");
        
        // Prevent default action to avoid opening in new window
        link.onclick = function(e) {
            e.preventDefault();
            return false;
        };

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
        
        // Apply appropriate volume directly to the audio element
        const volumePercent = parseInt(volumeSlider.value);
        audioPlayer.volume = volumePercent / 100;
        
        // Set up audio source and play
        audioPlayer.src = src;
        audioPlayer.load();
        
        const playPromise = audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.error("Error starting playback:", e);
                // Some browsers require user interaction first
            });
        }
        
        // Update Media Session metadata
        const trackName = item.querySelector('.file-number')?.textContent || '';
        const episodeDate = item.querySelector('.file-date')?.textContent || '';
        updateMediaSessionMetadata(trackName, episodeDate);
        
        // Update UI
        item.classList.add("expanded");
        updateIcon(item);
        const timeIndicator = item.querySelector(".time-indicator");
        if (timeIndicator) {
            timeIndicator.style.display = "block";
        }
        
        // Initialize audio context for effects if we're visible
        // But do this AFTER starting playback to ensure background play works
        if (document.visibilityState === 'visible' && !isAudioContextInitialized) {
            try {
                // Slight delay to ensure playback has started
                setTimeout(() => {
                    initializeAudioContext();
                }, 100);
            } catch (err) {
                console.error("Failed to initialize audio effects, continuing with basic playback:", err);
                // Basic playback will still work without effects
            }
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
        
        // Touch event to initialize audio on mobile
        document.addEventListener('touchstart', function handleFirstTouch() {
            document.removeEventListener('touchstart', handleFirstTouch);
            // Mobile browsers often require user interaction before audio can play
            if (audioPlayer) {
                // Just ensure the audio element is ready (don't actually play anything)
                audioPlayer.load();
            }
        }, { once: true });
    }
    
    // Handle visibility changes to support background playback
    function handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            // Page going to background
            if (!audioPlayer.paused) {
                // If we're playing audio, switch to direct mode
                disableEffects();
            }
        } else if (document.visibilityState === 'visible') {
            // Page becoming visible again
            if (!audioPlayer.paused && !isAudioContextInitialized) {
                // If we're playing audio without effects, try to re-enable them
                setTimeout(() => {
                    enableEffects();
                }, 300);
            }
        }
    }
    
    // Disable audio effects for background playback
    function disableEffects() {
        // If we have active effects, disconnect them
        if (effectsActive && isAudioContextInitialized && audioContext) {
            try {
                // Remember the volume setting
                const volumePercent = parseInt(volumeSlider.value);
                
                // Disconnect the audio processing chain
                if (audioSourceNode) {
                    try {
                        audioSourceNode.disconnect();
                    } catch (e) {
                        // Ignore disconnect errors
                    }
                }
                
                // Set direct volume on HTML audio element
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
    
    // Re-enable audio effects when returning to foreground
    function enableEffects() {
        if (!effectsActive && !audioPlayer.paused) {
            try {
                // Initialize audio context if needed
                if (!isAudioContextInitialized) {
                    initializeAudioContext();
                } else if (audioContext && audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                
                if (isAudioContextInitialized) {
                    // Apply volume and effects
                    applyVolume();
                    if (filterActive) applyAudioFilter();
                    if (reverbActive) applyReverb();
                    
                    // Restart visualizer
                    if (canvasCtx && !visualizerAnimationId) {
                        drawVisualizer();
                    }
                    
                    effectsActive = true;
                    console.log("Effects re-enabled");
                }
            } catch (e) {
                console.error("Error re-enabling effects:", e);
            }
        }
    }
    
    // Setup Media Session API for lock screen controls
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
    
    // Initialize Web Audio API for effects
    function initializeAudioContext() {
        // If already initialized and active, don't reinitialize
        if (isAudioContextInitialized && effectsActive) return;
        
        try {
            // Create audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create audio nodes
            gainNode = audioContext.createGain();
            filterNode = audioContext.createBiquadFilter();
            analyserNode = audioContext.createAnalyser();
            reverbSendNode = audioContext.createGain();
            reverbLowcutNode = audioContext.createBiquadFilter();
            convolver = audioContext.createConvolver();
            reverbReturnNode = audioContext.createGain();
            
            try {
                // Create source from audio element
                audioSourceNode = audioContext.createMediaElementSource(audioPlayer);
            } catch (sourceError) {
                // If the audio element is already connected to an audio context
                console.error("Error creating audio source:", sourceError);
                return;
            }
            
            // Connect audio processing graph
            
            // Main path
            audioSourceNode.connect(gainNode);
            gainNode.connect(analyserNode);
            analyserNode.connect(filterNode);
            filterNode.connect(audioContext.destination);
            
            // Parallel reverb path
            audioSourceNode.connect(reverbSendNode);
            reverbSendNode.connect(reverbLowcutNode);
            reverbLowcutNode.connect(convolver);
            convolver.connect(reverbReturnNode);
            reverbReturnNode.connect(gainNode);
            
            // Configure analyser
            analyserNode.fftSize = 2048;
            bufferLength = analyserNode.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            
            // Configure reverb
            reverbLowcutNode.type = 'highpass';
            reverbLowcutNode.frequency.value = currentLowcutFreq;
            reverbLowcutNode.Q.value = 0.7;
            reverbSendNode.gain.value = 0;
            reverbReturnNode.gain.value = 1.4;
            createReverbImpulse();
            
            // Configure filter
            filterNode.type = 'allpass';
            filterNode.frequency.setValueAtTime(audioContext.sampleRate / 2, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);
            
            // Apply initial volume
            applyVolume();
            
            isAudioContextInitialized = true;
            effectsActive = true;
            console.log("Audio effects initialized successfully");
            
            // Start visualizer if playing
            if (!audioPlayer.paused && canvasCtx && !visualizerAnimationId) {
                drawVisualizer();
            }
        } catch (e) {
            console.error("Failed to initialize Web Audio API:", e);
            // Fall back to basic audio playback
            isAudioContextInitialized = false;
            effectsActive = false;
        }
    }
    
    // Function to resume AudioContext if suspended
    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(e => console.error("Error resuming audio context:", e));
        }
    }
    
    // =====================================
    // AUDIO EFFECTS: REVERB
    // =====================================
    
    // Generate reverb impulse response
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
    }
    
    // Toggle reverb effect
    function toggleReverb() {
        if (!isAudioContextInitialized || !effectsActive) {
            initializeAudioContext();
            if (!isAudioContextInitialized) return;
        }
        
        reverbActive = !reverbActive;
        reverbToggleBtn.classList.toggle('active', reverbActive);
        applyReverb();
    }
    
    // Apply reverb settings
    function applyReverb() {
        if (!reverbSendNode || !isAudioContextInitialized) return;
        
        resumeAudioContext();
        
        const value = parseInt(reverbSlider.value);
        let sendAmount = 0;
        
        if (reverbActive) {
            sendAmount = Math.pow(value / 100, 1.1) * 1.5; // Exponential curve
        }
        
        reverbSendNode.gain.linearRampToValueAtTime(
            sendAmount, 
            audioContext.currentTime + 0.05
        );
    }
    
    // Adjust reverb lowcut filter
    function adjustReverbLowcut(direction) {
        if (!reverbLowcutNode || !isAudioContextInitialized) return;
        
        resumeAudioContext();
        
        let step = currentLowcutFreq * 0.1; // 10% step
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
    
    // Reset reverb to default
    function resetReverbKnobToDefault() {
        reverbSlider.value = 0;
        reverbSlider.dispatchEvent(new Event('input'));
    }
    
    // =====================================
    // AUDIO EFFECTS: FILTER
    // =====================================
    
    // Toggle filter effect
    function toggleFilter() {
        if (!isAudioContextInitialized || !effectsActive) {
            initializeAudioContext();
            if (!isAudioContextInitialized) return;
        }
        
        filterActive = !filterActive;
        filterToggleBtn.classList.toggle('active', filterActive);
        applyAudioFilter();
    }
    
    // Apply filter settings
    function applyAudioFilter() {
        if (!filterNode || !isAudioContextInitialized) return;
        
        resumeAudioContext();
        
        if (!filterActive) {
            // Bypass filter
            filterNode.type = 'allpass';
            filterNode.frequency.setValueAtTime(
                audioContext.sampleRate / 2, 
                audioContext.currentTime
            );
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);
            return;
        }
        
        // Apply active filter
        const value = parseInt(filterSlider.value);
        const maxFreq = audioContext.sampleRate / 2;
        const minFreq = 20;
        const now = audioContext.currentTime;
        const transitionTime = 0.02;
        
        if (value === 50) {
            // Center position - neutral
            filterNode.type = 'lowpass';
            filterNode.frequency.linearRampToValueAtTime(maxFreq * 0.99, now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1, now + transitionTime);
        } else if (value < 50) {
            // Low-pass filter
            filterNode.type = 'lowpass';
            const normalizedValue = (49 - value) / 49;
            const freq = minFreq * Math.pow(maxFreq / minFreq, 1 - normalizedValue);
            filterNode.frequency.linearRampToValueAtTime(Math.max(minFreq, freq), now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1 + normalizedValue * 5, now + transitionTime);
        } else {
            // High-pass filter
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
    
    // Reset filter to center
    function resetFilterKnobToCenter() {
        filterSlider.value = 50;
        filterSlider.dispatchEvent(new Event('input'));
    }
    
    // =====================================
    // VISUALIZER
    // =====================================
    
    // Initialize canvas for visualizer
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
    
    // Draw audio visualizer
    function drawVisualizer() {
        const zoomFactor = 1;
        
        // Stop if canvas or context is unavailable
        if (!canvasCtx || !canvas) {
            visualizerAnimationId = null;
            return;
        }
        
        // Get theme colors from CSS
        const computedStyle = getComputedStyle(document.documentElement);
        const strokeColor = computedStyle.getPropertyValue('--accent-color').trim();
        const idleColor = computedStyle.getPropertyValue('--slider-bg').trim();
        
        // Continue animation if playing and effects are enabled
        if (!audioPlayer.paused && isAudioContextInitialized && analyserNode && effectsActive) {
            visualizerAnimationId = requestAnimationFrame(drawVisualizer);
            
            // Get waveform data
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
    
    // Apply volume to both Web Audio and direct audio
    function applyVolume() {
        const value = parseInt(volumeSlider.value);
        volumeValue.textContent = `${value}%`;
        
        // Set volume for HTML Audio element (direct playback)
        audioPlayer.volume = value / 100;
        
        // Set volume for Web Audio API (effects mode)
        if (gainNode && isAudioContextInitialized && effectsActive) {
            resumeAudioContext();
            const volume = Math.pow(value / 100, 2); // Non-linear curve for better control
            gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        }
    }
    
    // =====================================
    // THEME TOGGLE
    // =====================================
    
    // Load saved theme
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    
    // Toggle between light and dark theme
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
        
        // Set up background playback
        setupBackgroundPlayback();
        
        // Load saved volume or set default
        const savedVolume = localStorage.getItem("volume");
        volumeSlider.value = savedVolume !== null ? savedVolume : 80;
        volumeValue.textContent = `${volumeSlider.value}%`;
        
        // Set direct volume immediately (Web Audio volume will be set on initialization)
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
            requestAnimationFrame(drawVisualizer);
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
                initializeAudioContext();
            }, 100);
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
        
        // Prevent default link behavior
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