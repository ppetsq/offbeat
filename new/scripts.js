// =====================================
// EPISODE DATA
// =====================================
const episodes = [
    { number: 23, date: '22.10.2025', url: 'https://vault.petsq.net/20251022_OFFBEAT_23.mp3', guest: null },
    { number: 22, date: '08.10.2025', url: 'https://vault.petsq.net/20251008_OFFBEAT_22.mp3', guest: null },
    { number: 21, date: '24.09.2025', url: 'https://vault.petsq.net/20250924_OFFBEAT_21.mp3', guest: null },
    { number: 20, date: '10.09.2025', url: 'https://vault.petsq.net/20250910_OFFBEAT_20.mp3', guest: null },
    { number: 19, date: '30.07.2025', url: 'https://vault.petsq.net/20250730_OFFBEAT_19.mp3', guest: null },
    { number: 18, date: '16.07.2025', url: 'https://vault.petsq.net/20250716_OFFBEAT_18.mp3', guest: null },
    { number: 17, date: '02.07.2025', url: 'https://vault.petsq.net/20250702_OFFBEAT_17.mp3', guest: null },
    { number: 16, date: '18.06.2025', url: 'https://vault.petsq.net/20250618_OFFBEAT_16.mp3', guest: null },
    { number: 15, date: '04.06.2025', url: 'https://vault.petsq.net/20250604_OFFBEAT_15.mp3', guest: null },
    { number: 14, date: '21.05.2025', url: 'https://vault.petsq.net/20250521_OFFBEAT_14.mp3', guest: null },
    { number: 13, date: '23.04.2025', url: 'https://vault.petsq.net/20250423_OFFBEAT_13.mp3', guest: null },
    { number: 12, date: '09.04.2025', url: 'https://vault.petsq.net/20250409_OFFBEAT_12.mp3', guest: null },
    { number: 11, date: '26.03.2025', url: 'https://vault.petsq.net/20250326_OFFBEAT_11.mp3', guest: null },
    { number: 10, date: '12.03.2025', url: 'https://vault.petsq.net/20250312_OFFBEAT_10.mp3', guest: null },
    { number: 9, date: '26.02.2025', url: 'https://vault.petsq.net/20250226_OFFBEAT_9_feat_screamsoda.mp3', guest: 'screamsoda' },
    { number: 8, date: '12.02.2025', url: 'https://vault.petsq.net/20250212_OFFBEAT_8.mp3', guest: null },
    { number: 7, date: '29.01.2025', url: 'https://vault.petsq.net/20250129_OFFBEAT_7_feat_klankarbeit.mp3', guest: 'klankarbeit' },
    { number: 6, date: '15.01.2025', url: 'https://vault.petsq.net/20250115_OFFBEAT_6.mp3', guest: null },
    { number: 4, date: '27.11.2024', url: 'https://vault.petsq.net/20241127_OFFBEAT_4.mp3', guest: null },
    { number: 3, date: '23.10.2024', url: 'https://vault.petsq.net/20241023_OFFBEAT_3.mp3', guest: null },
    { number: 2, date: '09.10.2024', url: 'https://vault.petsq.net/20241009_OFFBEAT_2.mp3', guest: null },
    { number: 1, date: '25.09.2024', url: 'https://vault.petsq.net/20240925_OFFBEAT_1.mp3', guest: null }
];

document.addEventListener("DOMContentLoaded", function() {
    // =====================================
    // DOM ELEMENTS
    // =====================================
    const audioPlayer = document.getElementById("audioPlayer");
    const volumeSlider = document.getElementById("masterVolume");
    const volumeValue = document.querySelector(".volume-value");
    const filterSlider = document.getElementById("masterFilter");
    const reverbSlider = document.getElementById("masterReverb");
    const filterKnobWrapper = document.querySelector('.filter-container .knob-wrapper');
    const reverbKnobWrapper = document.querySelector('.reverb-container .knob-wrapper');
    const filterToggleBtn = document.querySelector('.filter-toggle');
    const reverbToggleBtn = document.querySelector('.reverb-toggle');
    const waveformCanvas = document.getElementById('waveformCanvas');

    // Main player elements
    const mainPlayer = document.getElementById('mainPlayer');
    const mainPlayPause = document.getElementById('mainPlayPause');
    const rewindBtn = document.getElementById('rewindBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    const trackTitle = document.getElementById('trackTitle');
    const trackDate = document.getElementById('trackDate');
    const trackGuest = document.getElementById('trackGuest');
    const currentTimeEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');
    const mainProgressBar = document.getElementById('mainProgressBar');
    const mainProgressFilled = document.getElementById('mainProgressFilled');
    const episodeGrid = document.getElementById('episodeGrid');

    // Modal elements
    const confirmModal = document.getElementById('confirmModal');
    const modalMessage = document.getElementById('modalMessage');
    const modalCancel = document.getElementById('modalCancel');
    const modalConfirm = document.getElementById('modalConfirm');

    // DJ Controls toggle
    const djToggleBtn = document.getElementById('djToggleBtn');
    const effectsSection = document.getElementById('effectsSection');

    // =====================================
    // STATE VARIABLES
    // =====================================
    let filterActive = false;
    let reverbActive = false;
    let currentEpisode = null; // Currently loaded episode
    let currentLowcutFreq = 200;
    let isAudioContextInitialized = false;
    let visualizerAnimationId = null;
    let modalCallback = null; // Callback for modal confirmation
    let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let useWebAudio = !isMobile; // Disable Web Audio API on mobile for reliable background playback

    // =====================================
    // CONSTANTS
    // =====================================
    const REVERB_LOWCUT_MIN = 80;
    const REVERB_LOWCUT_MAX = 800;
    const SKIP_TIME = 30;
    const sensitivity = 0.15;

    // =====================================
    // WEB AUDIO API VARIABLES
    // =====================================
    let audioContext;
    let gainNode;
    let filterNode;
    let convolver;
    let reverbSendNode;
    let reverbLowcutNode;
    let reverbReturnNode;
    let analyserNode;

    // =====================================
    // CANVAS VARIABLES
    // =====================================
    let canvas, canvasCtx, dataArray, bufferLength;

    // =====================================
    // INITIALIZE CANVAS CONTEXT
    // =====================================
    if (waveformCanvas) {
        canvas = waveformCanvas;
        canvasCtx = canvas.getContext('2d');
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
    // MOBILE BACKGROUND PLAYBACK SETUP
    // =====================================
    function enableBackgroundPlayback() {
        audioPlayer.setAttribute('playsinline', '');
        audioPlayer.setAttribute('webkit-playsinline', '');
        audioPlayer.setAttribute('preload', 'metadata');

        // Keep playing when page goes to background
        document.addEventListener('visibilitychange', function() {
            // Do NOT pause when hidden - let it keep playing
            if (document.visibilityState === 'hidden' && !audioPlayer.paused) {
                console.log('Page hidden, audio continues playing');
            } else if (document.visibilityState === 'visible' && !audioPlayer.paused) {
                console.log('Page visible, ensuring playback continues');
                // Resume audio context if needed (desktop only)
                resumeAudioContext();
            }
        });

        // Resume audio context on any user interaction (desktop only)
        if (useWebAudio) {
            document.addEventListener('touchstart', resumeAudioContext, { passive: true });
            document.addEventListener('click', resumeAudioContext, { passive: true });
        }
    }

    // =====================================
    // MEDIA SESSION API (STRENGTHENED)
    // =====================================
    function setupMediaSession() {
        if ('mediaSession' in navigator) {
            // Set action handlers with audioContext resume
            navigator.mediaSession.setActionHandler('play', function() {
                resumeAudioContext();
                audioPlayer.play().catch(error => console.error("Error playing audio:", error));
            });

            navigator.mediaSession.setActionHandler('pause', function() {
                audioPlayer.pause();
            });

            navigator.mediaSession.setActionHandler('seekbackward', function() {
                if (audioPlayer && !isNaN(audioPlayer.duration)) {
                    resumeAudioContext();
                    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - SKIP_TIME);
                }
            });

            navigator.mediaSession.setActionHandler('seekforward', function() {
                if (audioPlayer && !isNaN(audioPlayer.duration)) {
                    resumeAudioContext();
                    audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + SKIP_TIME);
                }
            });

            // Optional: previous/next track handlers
            navigator.mediaSession.setActionHandler('previoustrack', function() {
                if (currentEpisode) {
                    const currentIndex = episodes.findIndex(ep => ep.number === currentEpisode.number);
                    if (currentIndex < episodes.length - 1) {
                        const nextEpisode = episodes[currentIndex + 1];
                        switchToEpisode(nextEpisode.number, true);
                    }
                }
            });

            navigator.mediaSession.setActionHandler('nexttrack', function() {
                if (currentEpisode) {
                    const currentIndex = episodes.findIndex(ep => ep.number === currentEpisode.number);
                    if (currentIndex > 0) {
                        const prevEpisode = episodes[currentIndex - 1];
                        switchToEpisode(prevEpisode.number, true);
                    }
                }
            });

            console.log("Media Session API configured with all handlers");
        }
    }

    function updateMediaSessionMetadata(episode) {
        if ('mediaSession' in navigator && episode) {
            const title = `OFFBEAT #${episode.number}`;
            const artist = episode.guest ? `feat. ${episode.guest}` : episode.date;

            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: 'Offbeat Archive',
                artwork: [
                    { src: 'https://vault.petsq.net/offbeat-promo.jpg', sizes: '96x96', type: 'image/jpeg' },
                    { src: 'https://vault.petsq.net/offbeat-promo.jpg', sizes: '128x128', type: 'image/jpeg' },
                    { src: 'https://vault.petsq.net/offbeat-promo.jpg', sizes: '192x192', type: 'image/jpeg' },
                    { src: 'https://vault.petsq.net/offbeat-promo.jpg', sizes: '256x256', type: 'image/jpeg' },
                    { src: 'https://vault.petsq.net/offbeat-promo.jpg', sizes: '384x384', type: 'image/jpeg' },
                    { src: 'https://vault.petsq.net/offbeat-promo.jpg', sizes: '512x512', type: 'image/jpeg' }
                ]
            });

            console.log(`Media metadata updated: ${title}`);
        }
    }

    function updateMediaSessionPositionState() {
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            if (!isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: audioPlayer.duration,
                        playbackRate: audioPlayer.playbackRate,
                        position: audioPlayer.currentTime
                    });
                } catch (e) {
                    console.error("Error setting position state:", e);
                }
            }
        }
    }

    // =====================================
    // WEB AUDIO API INITIALIZATION (DESKTOP ONLY)
    // =====================================
    function initializeAudioContext() {
        if (isAudioContextInitialized) return;
        if (!useWebAudio) {
            console.log("Skipping Web Audio API initialization on mobile for reliable background playback");
            isAudioContextInitialized = true;
            return;
        }

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create core nodes
            gainNode = audioContext.createGain();
            filterNode = audioContext.createBiquadFilter();
            analyserNode = audioContext.createAnalyser();

            // Create reverb nodes
            reverbSendNode = audioContext.createGain();
            reverbLowcutNode = audioContext.createBiquadFilter();
            convolver = audioContext.createConvolver();
            reverbReturnNode = audioContext.createGain();

            // Get audio source
            const audioSourceNode = audioContext.createMediaElementSource(audioPlayer);

            // Connect Audio Graph
            // Analyser taps raw signal for visualization (unaffected by volume)
            audioSourceNode.connect(analyserNode);

            // Main audio path with volume control
            audioSourceNode.connect(gainNode);
            audioSourceNode.connect(reverbSendNode);
            reverbSendNode.connect(reverbLowcutNode);
            reverbLowcutNode.connect(convolver);
            convolver.connect(reverbReturnNode);
            reverbReturnNode.connect(gainNode);
            gainNode.connect(filterNode);
            filterNode.connect(audioContext.destination);

            // Configure Nodes
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

            applyVolume();

            isAudioContextInitialized = true;
            console.log("Audio Context Initialized (Desktop Mode)");
        } catch (e) {
            console.error("Web Audio API initialization error:", e);
            alert("Sorry, your browser doesn't support the necessary Web Audio features for this site.");
        }
    }

    function resumeAudioContext() {
        if (useWebAudio && audioContext && audioContext.state === 'suspended') {
            audioContext.resume()
                .then(() => console.log("AudioContext resumed"))
                .catch(e => console.error("Error resuming AudioContext:", e));
        }
    }

    // =====================================
    // REVERB IMPULSE RESPONSE (DESKTOP ONLY)
    // =====================================
    function createReverbImpulse() {
        if (!useWebAudio || !audioContext || !convolver) return;
        const sampleRate = audioContext.sampleRate;
        const length = 1.2 * sampleRate;
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        const attack = 0.002, earlyDecay = 0.02, lateDecay = 0.9;

        for (let i = 0; i < length; i++) {
            const time = i / length;
            let amplitude;
            if (time < 0.1) {
                amplitude = Math.pow((1 - time / 0.1), earlyDecay) * 1.3;
            } else {
                amplitude = Math.pow((1 - (time - 0.1) / 0.9), lateDecay) * 0.5;
            }
            left[i] = (Math.random() * 2 - 1) * amplitude;
            right[i] = (Math.random() * 2 - 1) * amplitude;
        }

        const smoothL = 0.1, smoothR = 0.12;
        for (let i = 1; i < length; i++) {
            left[i] = left[i] * (1 - smoothL) + left[i-1] * smoothL;
            right[i] = right[i] * (1 - smoothR) + right[i-1] * smoothR;
        }
        for (let i = length - 2; i >= 0; i--) {
            left[i] = left[i] * 0.9 + left[i+1] * 0.1;
            right[i] = right[i] * 0.9 + right[i+1] * 0.1;
        }

        convolver.buffer = impulse;
        console.log("Enhanced reverb impulse created.");
    }

    // =====================================
    // WAVEFORM VISUALIZER (DESKTOP ONLY)
    // =====================================
    function drawVisualizer() {
        if (!canvasCtx || !canvas) {
            visualizerAnimationId = null;
            return;
        }

        const computedStyle = getComputedStyle(document.documentElement);
        const strokeColor = computedStyle.getPropertyValue('--waveform-color').trim();
        const idleColor = computedStyle.getPropertyValue('--slider-bg').trim();

        if (!audioPlayer.paused && isAudioContextInitialized && useWebAudio && analyserNode) {
            visualizerAnimationId = requestAnimationFrame(drawVisualizer);

            analyserNode.getByteTimeDomainData(dataArray);
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 3;
            canvasCtx.strokeStyle = strokeColor || '#16BE54';
            canvasCtx.beginPath();

            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;
            const centerY = canvas.height / 2;
            const maxAmplitude = canvas.height / 2;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0 - 1;
                const y = centerY + v * maxAmplitude;
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
            visualizerAnimationId = null;
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            // Don't draw anything when paused - just clear the canvas
        }
    }

    // =====================================
    // DJ CONTROLS TOGGLE
    // =====================================
    djToggleBtn.addEventListener('click', () => {
        effectsSection.classList.toggle('collapsed');
        djToggleBtn.classList.toggle('active');
    });

    // =====================================
    // CUSTOM MODAL
    // =====================================
    function showConfirmModal(message, onConfirm) {
        modalMessage.textContent = message;
        modalCallback = onConfirm;
        confirmModal.classList.add('active');
    }

    function hideConfirmModal() {
        confirmModal.classList.remove('active');
        modalCallback = null;
    }

    modalCancel.addEventListener('click', hideConfirmModal);

    modalConfirm.addEventListener('click', () => {
        if (modalCallback) {
            modalCallback();
        }
        hideConfirmModal();
    });

    // Close modal on overlay click
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            hideConfirmModal();
        }
    });

    // =====================================
    // UTILITY FUNCTIONS
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
    // HASH ROUTING
    // =====================================
    function parseHash() {
        const hash = window.location.hash;
        const match = hash.match(/#episode-(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    function setHash(episodeNumber) {
        window.location.hash = `episode-${episodeNumber}`;
    }

    function initializeFromHash() {
        const episodeNumber = parseHash();
        if (episodeNumber) {
            const episode = episodes.find(ep => ep.number === episodeNumber);
            if (episode) {
                loadEpisodeIntoPlayer(episode, false);
                return;
            }
        }
        // Default to episode 23
        const defaultEpisode = episodes.find(ep => ep.number === 23) || episodes[0];
        loadEpisodeIntoPlayer(defaultEpisode, false);
    }

    // Listen for hash changes (back/forward buttons)
    window.addEventListener('hashchange', () => {
        const episodeNumber = parseHash();
        if (episodeNumber && currentEpisode && episodeNumber !== currentEpisode.number) {
            const episode = episodes.find(ep => ep.number === episodeNumber);
            if (episode) {
                loadEpisodeIntoPlayer(episode, false);
            }
        }
    });

    // =====================================
    // EPISODE LOADING & SWITCHING
    // =====================================
    function resetEffectsToDefault() {
        // Reset filter
        filterActive = false;
        filterToggleBtn.classList.remove('active');
        filterSlider.value = 50;
        updateFilterKnobVisual(50);
        applyAudioFilter();

        // Reset reverb
        reverbActive = false;
        reverbToggleBtn.classList.remove('active');
        reverbSlider.value = 0;
        updateReverbKnobVisual(0);
        applyReverb();

        console.log('Effects reset to default');
    }

    function loadEpisodeIntoPlayer(episode, autoPlay = false) {
        // Update UI
        trackTitle.textContent = `OFFBEAT #${episode.number}`;
        trackDate.textContent = episode.date;
        trackGuest.textContent = episode.guest ? `feat. ${episode.guest}` : '';
        trackGuest.style.display = episode.guest ? 'inline' : 'none';

        // Update hash
        setHash(episode.number);

        // Update grid highlight
        updateGridHighlight(episode.number);

        // Reset all effects to default
        resetEffectsToDefault();

        // Load audio
        audioPlayer.src = episode.url;
        audioPlayer.load();
        currentEpisode = episode;

        // Update media session
        updateMediaSessionMetadata(episode);

        // Reset time display
        currentTimeEl.textContent = '00:00';
        durationEl.textContent = '00:00';
        mainProgressFilled.style.width = '0%';

        // Auto-play if requested and audio context is initialized
        if (autoPlay) {
            if (!isAudioContextInitialized) {
                initializeAudioContext();
            }
            resumeAudioContext();
            audioPlayer.play().catch(e => console.error("Autoplay failed:", e));
        }

        console.log(`Loaded episode #${episode.number}`);
    }

    function switchToEpisode(episodeNumber, autoPlay = false) {
        const episode = episodes.find(ep => ep.number === episodeNumber);
        if (!episode) return;

        // Check if something is playing
        if (audioPlayer.src && !audioPlayer.paused) {
            showConfirmModal(`Switch to OFFBEAT #${episodeNumber}?`, () => {
                loadEpisodeIntoPlayer(episode, true); // Always auto-play after confirmation
            });
        } else {
            loadEpisodeIntoPlayer(episode, false); // Don't auto-play if nothing was playing
        }
    }

    // =====================================
    // EPISODE GRID
    // =====================================
    function renderEpisodeGrid() {
        episodeGrid.innerHTML = '';
        episodes.forEach(episode => {
            const card = document.createElement('div');
            card.className = 'episode-card';
            card.dataset.episode = episode.number;

            const title = document.createElement('div');
            title.className = 'episode-card-title';
            title.textContent = `OFFBEAT #${episode.number}`;

            const date = document.createElement('div');
            date.className = 'episode-card-date';
            date.textContent = episode.date;

            if (episode.guest) {
                const guest = document.createElement('div');
                guest.className = 'episode-card-guest';
                guest.textContent = `feat. ${episode.guest}`;
                card.appendChild(title);
                card.appendChild(date);
                card.appendChild(guest);
            } else {
                card.appendChild(title);
                card.appendChild(date);
            }

            card.addEventListener('click', () => {
                switchToEpisode(episode.number, false);
            });

            episodeGrid.appendChild(card);
        });
    }

    function updateGridHighlight(episodeNumber) {
        document.querySelectorAll('.episode-card').forEach(card => {
            if (parseInt(card.dataset.episode) === episodeNumber) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    }

    // =====================================
    // PLAYER CONTROLS
    // =====================================
    function updatePlayPauseIcon() {
        // Remove existing icon (whether it's <i> or <svg> from Font Awesome)
        const existingIcon = mainPlayPause.querySelector('i, svg');
        if (existingIcon) {
            existingIcon.remove();
        }

        // Create new icon element
        const icon = document.createElement('i');
        if (audioPlayer.paused) {
            icon.className = 'fa-solid fa-play';
            icon.setAttribute('data-icon', 'play');
        } else {
            icon.className = 'fa-solid fa-pause';
            icon.setAttribute('data-icon', 'pause');
        }

        mainPlayPause.appendChild(icon);
        console.log('Play/pause icon updated:', audioPlayer.paused ? 'play' : 'pause');
    }

    function updateTimeDisplay() {
        if (!currentEpisode || !audioPlayer.duration || isNaN(audioPlayer.duration)) return;

        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
        durationEl.textContent = formatTime(audioPlayer.duration);

        const progressPercentage = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        mainProgressFilled.style.width = `${progressPercentage}%`;

        updateMediaSessionPositionState();
    }

    // Main play/pause button
    mainPlayPause.addEventListener('click', () => {
        if (!isAudioContextInitialized) {
            initializeAudioContext();
        }
        resumeAudioContext();

        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.error("Play error:", e));
        } else {
            audioPlayer.pause();
        }
    });

    // Rewind button
    rewindBtn.addEventListener('click', () => {
        resumeAudioContext();
        audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - SKIP_TIME);
    });

    // Forward button
    forwardBtn.addEventListener('click', () => {
        if (!isNaN(audioPlayer.duration)) {
            resumeAudioContext();
            audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + SKIP_TIME);
        }
    });

    // Progress bar seeking
    mainProgressBar.addEventListener('click', (e) => {
        if (!audioPlayer.duration || isNaN(audioPlayer.duration)) return;
        resumeAudioContext();
        const rect = mainProgressBar.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        audioPlayer.currentTime = Math.max(0, Math.min(audioPlayer.duration, clickPosition * audioPlayer.duration));
    });

    // =====================================
    // AUDIO PLAYER EVENTS
    // =====================================
    audioPlayer.addEventListener('timeupdate', updateTimeDisplay);

    audioPlayer.addEventListener('loadedmetadata', () => {
        updateTimeDisplay();
        updateMediaSessionPositionState();
    });

    audioPlayer.addEventListener('play', () => {
        resumeAudioContext();
        updatePlayPauseIcon();

        // Initialize audio context if not already done
        if (!isAudioContextInitialized) {
            initializeAudioContext();
        }

        // Start visualizer
        if (canvasCtx && !visualizerAnimationId) {
            if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
            }
            console.log('Starting visualizer');
            drawVisualizer();
        }
    });

    audioPlayer.addEventListener('pause', () => {
        updatePlayPauseIcon();
    });

    audioPlayer.addEventListener('ended', () => {
        if (visualizerAnimationId && cancelAnimationFrame) {
            cancelAnimationFrame(visualizerAnimationId);
        }
        visualizerAnimationId = null;
        if (canvasCtx && canvas) {
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });

    // =====================================
    // VOLUME CONTROL
    // =====================================
    function applyVolume() {
        const value = parseInt(volumeSlider.value);
        volumeValue.textContent = `${value}%`;

        if (useWebAudio && gainNode && audioContext) {
            // Desktop: Use Web Audio API gain node
            const volume = Math.pow(value / 100, 2);
            gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        } else {
            // Mobile: Use direct HTML5 audio volume
            audioPlayer.volume = value / 100;
        }
    }

    volumeSlider.addEventListener("input", function() {
        resumeAudioContext();
        applyVolume();
        localStorage.setItem("volume", volumeSlider.value);
    });

    const savedVolume = localStorage.getItem("volume");
    volumeSlider.value = savedVolume !== null ? savedVolume : 80;
    volumeValue.textContent = `${volumeSlider.value}%`;

    // =====================================
    // FILTER CONTROL
    // =====================================
    function toggleFilter() {
        filterActive = !filterActive;
        filterToggleBtn.classList.toggle('active', filterActive);
        applyAudioFilter();
    }

    function updateFilterKnobVisual(value) {
        const knobIndicator = document.querySelector('.filter-container .knob-indicator');
        if (knobIndicator) {
            const rotationRange = 270;
            const degree = ((value / 100) * rotationRange) - (rotationRange / 2);
            knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
        }
    }

    function applyAudioFilter() {
        if (!useWebAudio || !filterNode || !isAudioContextInitialized) return;

        if (!filterActive) {
            filterNode.type = 'allpass';
            filterNode.frequency.setValueAtTime(audioContext.sampleRate / 2, audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, audioContext.currentTime);
            return;
        }

        const value = parseInt(filterSlider.value);
        const maxFreq = audioContext.sampleRate / 2;
        const minFreq = 20;
        const now = audioContext.currentTime;
        const transitionTime = 0.02;

        if (value === 50) {
            filterNode.type = 'lowpass';
            filterNode.frequency.linearRampToValueAtTime(maxFreq * 0.99, now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1, now + transitionTime);
        } else if (value < 50) {
            filterNode.type = 'lowpass';
            const normalizedValue = (49 - value) / 49;
            const freq = minFreq * Math.pow(maxFreq / minFreq, 1 - normalizedValue);
            filterNode.frequency.linearRampToValueAtTime(Math.max(minFreq, freq), now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1 + normalizedValue * 5, now + transitionTime);
        } else {
            filterNode.type = 'highpass';
            const normalizedValue = (value - 51) / 49;
            const freq = minFreq * Math.pow(maxFreq / minFreq, normalizedValue);
            filterNode.frequency.linearRampToValueAtTime(Math.max(minFreq, freq), now + transitionTime);
            filterNode.Q.linearRampToValueAtTime(1 + normalizedValue * 5, now + transitionTime);
        }
    }

    function resetFilterKnobToCenter() {
        filterSlider.value = 50;
        filterSlider.dispatchEvent(new Event('input'));
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

    // =====================================
    // REVERB CONTROL
    // =====================================
    function toggleReverb() {
        reverbActive = !reverbActive;
        reverbToggleBtn.classList.toggle('active', reverbActive);
        applyReverb();
    }

    function updateReverbKnobVisual(value) {
        const knobIndicator = document.querySelector('.reverb-container .knob-indicator');
        if (knobIndicator) {
            const rotationRange = 270;
            const degree = -135 + (value / 100) * rotationRange;
            knobIndicator.style.transform = `translateX(-50%) rotate(${degree}deg)`;
        }
    }

    function applyReverb() {
        if (!useWebAudio || !reverbSendNode || !isAudioContextInitialized) return;

        const value = parseInt(reverbSlider.value);
        let sendAmount = 0;

        if (reverbActive) {
            sendAmount = Math.pow(value / 100, 1.1) * 1.5;
        }

        const now = audioContext.currentTime;
        const transitionTime = 0.05;
        reverbSendNode.gain.linearRampToValueAtTime(sendAmount, now + transitionTime);
    }

    function resetReverbKnobToDefault() {
        reverbSlider.value = 0;
        reverbSlider.dispatchEvent(new Event('input'));
    }

    if (reverbSlider) {
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
        if (!useWebAudio || !reverbLowcutNode || !isAudioContextInitialized) return;
        resumeAudioContext();

        let step = currentLowcutFreq * 0.1;
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
    // KNOB DRAG LOGIC
    // =====================================
    let isDragging = false;
    let dragTarget = null;
    let startX, startY, startValue;

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

        if (dragTarget === 'filter' && Math.abs(newValue - 50) < 3) {
            newValue = 50;
        }

        newValue = Math.max(0, Math.min(100, newValue));

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

    if (filterKnobWrapper) {
        filterKnobWrapper.addEventListener('mousedown', (e) => handleDragStart(e, 'filter'));
        filterKnobWrapper.addEventListener('touchstart', (e) => handleDragStart(e, 'filter'), { passive: false });
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
    // WINDOW RESIZE
    // =====================================
    window.addEventListener('resize', () => {
        if (canvas) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }
    });

    // =====================================
    // KEYBOARD SHORTCUTS
    // =====================================
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT') return;

        if (e.code === 'Space') {
            e.preventDefault();
            mainPlayPause.click();
        }

        if (e.code === 'KeyR') {
            resetFilterKnobToCenter();
        }

        if (e.code === 'KeyB' && reverbSlider) {
            resetReverbKnobToDefault();
        }

        if (e.code === 'KeyF') {
            toggleFilter();
        }

        if (e.code === 'KeyV' && reverbToggleBtn) {
            toggleReverb();
        }

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

        if (e.code === 'BracketLeft') {
            e.preventDefault();
            adjustReverbLowcut('down');
        }
        if (e.code === 'BracketRight') {
            e.preventDefault();
            adjustReverbLowcut('up');
        }
    });

    // =====================================
    // INITIALIZATION
    // =====================================
    function initializeApp() {
        // Initialize controls
        filterSlider.value = 50;
        updateFilterKnobVisual(filterSlider.value);
        filterToggleBtn.classList.remove('active');
        filterActive = false;

        if (reverbSlider) {
            reverbSlider.value = 0;
            updateReverbKnobVisual(reverbSlider.value);
            reverbToggleBtn.classList.remove('active');
            reverbActive = false;
        }

        // Hide Web Audio-dependent features on mobile
        if (isMobile) {
            // Hide DJ controls (no Web Audio API = no effects)
            const playerRight = document.querySelector('.player-right');
            if (playerRight) {
                playerRight.style.display = 'none';
            }

            // Hide master volume (use phone's native volume controls)
            const volumeControl = document.querySelector('.volume-control');
            if (volumeControl) {
                volumeControl.style.display = 'none';
            }

            // Hide waveform (requires Web Audio API AnalyserNode)
            const heroWaveform = document.querySelector('.hero-waveform');
            if (heroWaveform) {
                heroWaveform.style.display = 'none';
            }

            console.log("Mobile device detected - Using native audio for background playback");
        }

        // Enable background playback
        enableBackgroundPlayback();
        setupMediaSession();

        // Render episode grid
        renderEpisodeGrid();

        // Initialize from hash
        initializeFromHash();

        // Draw initial visualizer state
        if (canvasCtx && useWebAudio) {
            requestAnimationFrame(drawVisualizer);
        }

        console.log(`Offbeat Archive initialized (${isMobile ? 'Mobile' : 'Desktop'} Mode)`);
    }

    initializeApp();

}); // End DOMContentLoaded
