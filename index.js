(() => {
    const root = document.documentElement;
    const appRoot = document.getElementById("appRoot");
    const orientationOverlay = document.getElementById("orientationOverlay");
    const preloadProgressBar = document.getElementById("preloadProgressBar");
    const preloadProgressValue = document.getElementById("preloadProgressValue");
    const views = {
        menu: document.getElementById("menuView"),
        intro: document.getElementById("introView"),
        play: document.getElementById("playView"),
    };

    const menuButtonStart = document.querySelector('[data-action="start-game"]');
    const menuButtonFullscreen = document.querySelector('[data-action="enter-fullscreen"]');

    const introVideo = document.getElementById("introVideo");
    const heroVideo = document.getElementById("heroVideo");
    const introPoster = document.getElementById("introPoster");
    const callHeroButton = document.getElementById("callHeroButton");

    const coarsePointerMedia =
        typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;

    const heroFrameSources = Array.from({ length: 11 }, (_, index) => {
        const frame = String(index + 1).padStart(2, "0");
        return `img-hero/run/run_${frame}.png`;
    });

    const preloadManifest = [
        { key: "video:intro", src: "video/intro.mp4", type: "video" },
        { key: "video:hero", src: "video/hero_come2.mp4", type: "video" },
        { key: "image:poster", src: "img/go-go-go.jpg", type: "image" },
        { key: "image:bg", src: "img/new_bg/bg_01.png", type: "image" },
        { key: "image:platform-base", src: "img/new_bg/platform-01.png", type: "image" },
        { key: "image:platform-decor", src: "img/new_bg/platform-02.png", type: "image" },
        { key: "image:button", src: "img/button.png", type: "image" },
        ...heroFrameSources.map((src) => ({ key: `image:hero:${src}`, src, type: "image" })),
    ];

    const preloadedVideoHandles = new Map();

    let currentView = null;
    let orientationBlocked = false;
    let isPreloading = true;
    let introStarted = false;
    let heroStarted = false;
    let introBindingsApplied = false;
    let pointerRetryUnbind = null;

    function updateViewportHeight() {
        const height = Math.max(window.innerHeight || 0, 0);
        if (height > 0) {
            root.style.setProperty("--app-viewport-height", `${height}px`);
        }
    }

    function hasCoarsePointer() {
        if (coarsePointerMedia) {
            return coarsePointerMedia.matches;
        }
        return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }

    function computeOrientationBlocked() {
        if (!hasCoarsePointer()) {
            return false;
        }
        if (typeof window.screen !== "undefined" && window.screen.orientation) {
            const type = window.screen.orientation.type || "";
            if (type.includes("landscape")) {
                return false;
            }
        }
        return window.innerHeight > window.innerWidth;
    }

    function applyOrientationOverlay() {
        if (!orientationOverlay) {
            return;
        }
        const shouldBeVisible = isPreloading || orientationBlocked;
        orientationOverlay.hidden = !shouldBeVisible;
        orientationOverlay.setAttribute("aria-hidden", String(!shouldBeVisible));
        orientationOverlay.classList.toggle("orientation-overlay--waiting", isPreloading);
    }

    function attemptLandscapeLock() {
        try {
            const orientation = window.screen?.orientation;
            if (orientation && typeof orientation.lock === "function") {
                const lockResult = orientation.lock("landscape");
                if (typeof lockResult?.catch === "function") {
                    lockResult.catch(() => {});
                }
            }
        } catch (_) {
            // Orientation locking best-effort only.
        }
    }

    function requestAnyFullscreen() {
        try {
            const rootElement = appRoot || document.documentElement;
            const method =
                rootElement.requestFullscreen ||
                rootElement.webkitRequestFullscreen ||
                rootElement.msRequestFullscreen;
            if (typeof method === "function") {
                const result = method.call(rootElement);
                if (typeof result?.catch === "function") {
                    result.catch(() => {});
                }
            }
        } catch (_) {
            // Ignore fullscreen errors.
        }
    }

    function enableStartButton() {
        if (menuButtonStart) {
            menuButtonStart.disabled = false;
        }
    }

    function disableStartButton() {
        if (menuButtonStart) {
            menuButtonStart.disabled = true;
        }
    }

    function updatePreloadProgress(percent) {
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        if (preloadProgressBar) {
            preloadProgressBar.style.width = `${clamped}%`;
        }
        if (preloadProgressValue) {
            preloadProgressValue.textContent = `${clamped}%`;
        }
    }

    function preloadImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(src);
            img.onerror = () => resolve(src);
            img.src = src;
        });
    }

    async function preloadVideo(src) {
        try {
            const response = await fetch(src, { cache: "force-cache" });
            if (!response.ok) {
                throw new Error(`Failed to fetch ${src}`);
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            return {
                url,
                revoke() {
                    try {
                        URL.revokeObjectURL(url);
                    } catch (_) {
                        // Ignore revoke failures.
                    }
                },
            };
        } catch (_) {
            return {
                url: src,
                revoke() {},
            };
        }
    }

    async function preloadAllAssets(manifest) {
        const total = manifest.length || 1;
        let completed = 0;

        const tasks = manifest.map(async (asset) => {
            try {
                if (asset.type === "video") {
                    const handle = await preloadVideo(asset.src);
                    preloadedVideoHandles.set(asset.key, handle);
                } else {
                    await preloadImage(asset.src);
                }
            } finally {
                completed += 1;
                updatePreloadProgress((completed / total) * 100);
            }
        });

        await Promise.all(tasks);
    }

    function safePlay(media) {
        if (!media) {
            return;
        }
        const result = media.play();
        if (typeof result?.catch === "function") {
            result.catch(() => {});
        }
    }

    function bindIntroPlaybackRetry(video) {
        if (!video || pointerRetryUnbind) {
            return;
        }
        const events = ["pointerdown", "touchstart", "keydown"];

        const handler = () => {
            if (!video.paused && !video.ended) {
                unbind();
                return;
            }
            safePlay(video);
        };

        const unbind = () => {
            events.forEach((eventName) => {
                window.removeEventListener(eventName, handler, true);
            });
            pointerRetryUnbind = null;
        };

        pointerRetryUnbind = unbind;
        events.forEach((eventName) => {
            window.addEventListener(eventName, handler, true);
        });

        video.addEventListener("play", unbind, { once: true });
        video.addEventListener("ended", unbind, { once: true });
    }

    function resetIntroState() {
        introStarted = false;
        heroStarted = false;
        if (pointerRetryUnbind) {
            pointerRetryUnbind();
        }
        if (introVideo) {
            introVideo.classList.add("intro-video--hidden");
            introVideo.pause();
            introVideo.currentTime = 0;
        }
        if (heroVideo) {
            heroVideo.classList.add("intro-video--hidden");
            heroVideo.pause();
            heroVideo.currentTime = 0;
        }
        if (introPoster) {
            introPoster.hidden = true;
        }
        if (callHeroButton) {
            callHeroButton.disabled = false;
        }
    }

    function releasePreloadedVideos() {
        preloadedVideoHandles.forEach((handle) => {
            handle.revoke?.();
        });
        preloadedVideoHandles.clear();
    }

    function ensureIntroBindings() {
        if (introBindingsApplied) {
            return;
        }
        introBindingsApplied = true;

        if (introVideo) {
            introVideo.addEventListener("ended", () => {
                if (!introStarted) {
                    return;
                }
                introVideo.classList.add("intro-video--hidden");
                if (introPoster) {
                    introPoster.hidden = false;
                }
            });
            introVideo.addEventListener("error", () => {
                if (!introStarted) {
                    return;
                }
                if (!heroStarted) {
                    startHeroVideo();
                }
            });
        }

        if (heroVideo) {
            heroVideo.addEventListener("ended", () => {
                if (!heroStarted) {
                    return;
                }
                releasePreloadedVideos();
                navigation.go("play");
            });
            heroVideo.addEventListener("error", () => {
                if (!heroStarted) {
                    return;
                }
                releasePreloadedVideos();
                navigation.go("play");
            });
        }

        if (callHeroButton) {
            callHeroButton.addEventListener("click", () => {
                callHeroButton.disabled = true;
                if (introPoster) {
                    introPoster.hidden = true;
                }
                startHeroVideo();
            });
        }
    }

    function configureIntroSources() {
        const introHandle = preloadedVideoHandles.get("video:intro");
        const heroHandle = preloadedVideoHandles.get("video:hero");

        if (introVideo) {
            const source = introHandle?.url || "video/intro.mp4";
            if (introVideo.src !== source) {
                introVideo.src = source;
            }
            introVideo.load();
        }

        if (heroVideo) {
            const source = heroHandle?.url || "video/hero_come2.mp4";
            if (heroVideo.src !== source) {
                heroVideo.src = source;
            }
            heroVideo.load();
        }
    }

    function startIntroVideo() {
        if (!introVideo || introStarted) {
            return;
        }
        introStarted = true;
        introVideo.classList.remove("intro-video--hidden");
        safePlay(introVideo);
        bindIntroPlaybackRetry(introVideo);
    }

    function startHeroVideo() {
        if (!heroVideo || heroStarted) {
            return;
        }
        heroStarted = true;
        heroVideo.classList.remove("intro-video--hidden");
        heroVideo.currentTime = 0;
        safePlay(heroVideo);
        bindIntroPlaybackRetry(heroVideo);
    }

    function setupMenu() {
        if (menuButtonFullscreen) {
            menuButtonFullscreen.addEventListener("click", (event) => {
                event.preventDefault();
                window.gameAudio?.playMenuClick();
                requestAnyFullscreen();
                attemptLandscapeLock();
                enableStartButton();
            });
        }

        if (menuButtonStart) {
            menuButtonStart.addEventListener("click", (event) => {
                if (menuButtonStart.disabled) {
                    event.preventDefault();
                    return;
                }
                event.preventDefault();
                window.gameAudio?.playMenuClick();
                window.gameAudio?.playMenuMusicSoft();
                navigation.go("intro");
            });
        }

        document.addEventListener("fullscreenchange", () => {
            if (document.fullscreenElement) {
                enableStartButton();
            }
        });
    }

    function teardownView(name) {
        if (name === "intro") {
            resetIntroState();
        }
        if (name === "play") {
            window.gameView?.onHide?.();
        }
    }

    function activateView(name) {
        if (name === "menu") {
            disableStartButton();
            if (document.fullscreenElement || !hasCoarsePointer()) {
                enableStartButton();
            }
            window.gameAudio?.playMenuMusic();
        } else {
            window.gameAudio?.playMenuMusicSoft();
        }

        if (name === "intro") {
            ensureIntroBindings();
            configureIntroSources();
            startIntroVideo();
        }

        if (name === "play") {
            window.gameView?.onShow?.();
        }
    }

    function showView(target) {
        if (!views[target]) {
            return;
        }
        if (currentView === target) {
            return;
        }

        const previous = currentView;
        currentView = target;

        Object.entries(views).forEach(([key, element]) => {
            if (!element) {
                return;
            }
            const active = key === target;
            if (active) {
                element.hidden = false;
                element.setAttribute("aria-hidden", "false");
            } else {
                element.hidden = true;
                element.setAttribute("aria-hidden", "true");
            }
        });

        teardownView(previous);
        activateView(target);
        applyOrientationOverlay();
    }

    const navigation = {
        go(target) {
            if (target === "menu" || target === "intro" || target === "play") {
                showView(target);
            }
        },
    };

    window.appNavigation = navigation;

    function handleOrientationChange() {
        orientationBlocked = computeOrientationBlocked();
        applyOrientationOverlay();
    }

    async function init() {
        updateViewportHeight();
        window.addEventListener("resize", updateViewportHeight);
        window.addEventListener("orientationchange", updateViewportHeight);
        window.addEventListener("pageshow", updateViewportHeight);

        setupMenu();
        ensureIntroBindings();

        if (coarsePointerMedia) {
            const handler = () => {
                handleOrientationChange();
            };
            if (typeof coarsePointerMedia.addEventListener === "function") {
                coarsePointerMedia.addEventListener("change", handler);
            } else if (typeof coarsePointerMedia.addListener === "function") {
                coarsePointerMedia.addListener(handler);
            }
        }

        window.addEventListener("resize", handleOrientationChange);
        window.addEventListener("orientationchange", () => {
            attemptLandscapeLock();
            handleOrientationChange();
        });

        applyOrientationOverlay();
        updatePreloadProgress(0);

        await preloadAllAssets(preloadManifest);

        isPreloading = false;
        updatePreloadProgress(100);
        if (orientationOverlay) {
            orientationOverlay.classList.remove("orientation-overlay--waiting");
        }
        handleOrientationChange();

        showView("menu");
    }

    window.addEventListener("beforeunload", () => {
        releasePreloadedVideos();
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
