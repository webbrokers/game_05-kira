(() => {
    const SOUND_DEFINITIONS = {
        menuMusic: { src: "audio/new/menu_music_01.mp3", type: "music", loop: true, volume: 0.35 },
        gameMusic: { src: "audio/new/main_theme_music_ledy-bag.mp3", type: "music", loop: true, volume: 0.3 },
        runLoop: { src: "audio/new/run-03.mp3", type: "loop", loop: true, volume: 0.5 },
        jump: { src: "audio/new/jump_03.mp3", type: "sfx", volume: 0.7 },
        land: { src: "audio/land.wav", type: "sfx", volume: 0.6 },
        coin: { src: "audio/new/coins-swoosh.mp3", type: "sfx", volume: 0.75 },
        fall: { src: "audio/new/fall_01.mp3", type: "sfx", volume: 0.8 },
        menuClick: { src: "audio/new/button-click_01.mp3", type: "sfx", volume: 0.6 },
    };

    const sounds = new Map();

    function createAudioElement(definition) {
        const audio = new Audio(definition.src);
        audio.preload = "auto";
        audio.loop = Boolean(definition.loop);
        audio.volume = definition.volume ?? 1;
        audio.dataset.soundType = definition.type;
        return audio;
    }

    Object.entries(SOUND_DEFINITIONS).forEach(([key, definition]) => {
        sounds.set(key, createAudioElement(definition));
    });

    let unlocked = false;
    let unlockListenersBound = false;
    const pendingActions = [];

    function safePlay(audio) {
        const result = audio.play();
        if (result && typeof result.catch === "function") {
            result.catch(() => {});
        }
    }

    function unlock() {
        if (unlocked) {
            return;
        }
        unlocked = true;
        while (pendingActions.length) {
            const action = pendingActions.shift();
            try {
                action();
            } catch (_err) {
                // Ignore audio playback issues to avoid breaking gameplay.
            }
        }
    }

    function ensureUnlockListeners() {
        if (unlockListenersBound) {
            return;
        }
        unlockListenersBound = true;
        const unlockEvents = ["pointerdown", "touchstart", "keydown"];
        const handler = () => {
            unlock();
        };
        unlockEvents.forEach((eventName) => {
            window.addEventListener(
                eventName,
                handler,
                { once: true, capture: true },
            );
        });
    }

    function schedulePlayback(action) {
        ensureUnlockListeners();
        if (unlocked) {
            action();
            return;
        }
        pendingActions.push(action);
    }

    function stopGroup(type, exceptKey) {
        sounds.forEach((audio, key) => {
            const definition = SOUND_DEFINITIONS[key];
            if (!definition || definition.type !== type) {
                return;
            }
            if (exceptKey && key === exceptKey) {
                return;
            }
            audio.pause();
            if (!audio.loop) {
                audio.currentTime = 0;
            }
        });
    }

    function playMusic(key) {
        const audio = sounds.get(key);
        if (!audio) {
            return;
        }
        schedulePlayback(() => {
            stopGroup("music", key);
            audio.currentTime = 0;
            safePlay(audio);
        });
    }

    function stopMusic(key) {
        if (key) {
            const audio = sounds.get(key);
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
            return;
        }
        stopGroup("music");
    }

    function setLoopState(key, shouldPlay) {
        const audio = sounds.get(key);
        if (!audio) {
            return;
        }
        if (!shouldPlay) {
            audio.pause();
            audio.currentTime = 0;
            return;
        }
        schedulePlayback(() => {
            if (audio.paused) {
                if (audio.currentTime >= audio.duration - 0.01) {
                    audio.currentTime = 0;
                }
                safePlay(audio);
            }
        });
    }

    function playSfx(key) {
        const audio = sounds.get(key);
        if (!audio) {
            return;
        }
        schedulePlayback(() => {
            if (!audio.paused && audio.currentTime > 0.02 && audio.currentTime < audio.duration) {
                const clone = audio.cloneNode(true);
                clone.volume = audio.volume;
                safePlay(clone);
                return;
            }
            audio.currentTime = 0;
            safePlay(audio);
        });
    }

    function stopAll() {
        sounds.forEach((audio) => {
            audio.pause();
            audio.currentTime = 0;
        });
    }

    window.gameAudio = {
        ensureUnlock: ensureUnlockListeners,
        unlock,
        playMenuMusic: () => playMusic("menuMusic"),
        playGameMusic: () => playMusic("gameMusic"),
        stopMusic,
        setRunningLoop: (active) => setLoopState("runLoop", active),
        playJump: () => playSfx("jump"),
        playLand: () => playSfx("land"),
        playCoin: () => playSfx("coin"),
        playFall: () => playSfx("fall"),
        playMenuClick: () => playSfx("menuClick"),
        stopAll,
    };

    ensureUnlockListeners();
})();
