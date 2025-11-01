(() => {
    const loader = document.getElementById("introLoader");
    const progressBar = document.getElementById("introProgressBar");
    const progressValue = document.getElementById("introProgressValue");
    const introVideo = document.getElementById("introVideo");
    const heroVideo = document.getElementById("heroVideo");
    const poster = document.getElementById("introPoster");
    const callHeroButton = document.getElementById("callHeroButton");
    const audio = window.gameAudio || null;
    const FULLSCREEN_FLAG_KEY = "game05kira_fullscreen_requested";

    const assetDefinitions = [
        { key: "intro", src: "video/intro.mp4", mime: "video/mp4" },
        { key: "hero", src: "video/hero_come2.mp4", mime: "video/mp4" },
    ];

    const objectUrls = [];
    let shouldPropagateFullscreen = false;
    let loaderHidden = false;
    const FULLSCREEN_RETRY_DELAYS = [32, 260, 1000];
    const FULLSCREEN_EVENTS = ["pointerdown", "touchstart", "keydown"];
    let fullscreenIntent = false;
    let fullscreenFallbackCleanup = null;
    let fullscreenMonitorBound = false;

    function cleanupFullscreenFallback() {
        if (typeof fullscreenFallbackCleanup !== "function") {
            return;
        }
        fullscreenFallbackCleanup();
        fullscreenFallbackCleanup = null;
    }

    function ensureFullscreenMonitor() {
        if (fullscreenMonitorBound) {
            return;
        }
        const handleChange = () => {
            if (document.fullscreenElement) {
                fullscreenIntent = false;
                cleanupFullscreenFallback();
            }
        };
        document.addEventListener("fullscreenchange", handleChange);
        document.addEventListener("webkitfullscreenchange", handleChange);
        fullscreenMonitorBound = true;
    }

    function attemptFullscreenRequest() {
        if (!fullscreenIntent || document.fullscreenElement) {
            return false;
        }
        try {
            const root = document.documentElement;
            const method =
                root.requestFullscreen ||
                root.webkitRequestFullscreen ||
                root.msRequestFullscreen;
            if (typeof method !== "function") {
                return false;
            }
            const result = method.call(root);
            const handleSuccess = () => {
                fullscreenIntent = false;
                cleanupFullscreenFallback();
            };
            if (result && typeof result.then === "function") {
                result.then(handleSuccess).catch(() => {});
            } else {
                window.setTimeout(() => {
                    if (document.fullscreenElement) {
                        handleSuccess();
                    }
                }, 120);
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    function ensureFullscreenFallback() {
        if (!fullscreenIntent || fullscreenFallbackCleanup) {
            return;
        }

        const handler = () => {
            attemptFullscreenRequest();
        };

        FULLSCREEN_EVENTS.forEach((eventName) => {
            window.addEventListener(eventName, handler, true);
        });

        const timeoutIds = FULLSCREEN_RETRY_DELAYS.map((delay) =>
            window.setTimeout(() => {
                attemptFullscreenRequest();
            }, delay),
        );

        window.addEventListener(
            "pageshow",
            () => {
                attemptFullscreenRequest();
            },
            { once: true },
        );
        window.addEventListener(
            "load",
            () => {
                attemptFullscreenRequest();
            },
            { once: true },
        );

        fullscreenFallbackCleanup = () => {
            timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
            FULLSCREEN_EVENTS.forEach((eventName) => {
                window.removeEventListener(eventName, handler, true);
            });
        };
    }

    function triggerFullscreenRequest() {
        if (!fullscreenIntent || document.fullscreenElement) {
            return;
        }
        ensureFullscreenMonitor();
        ensureFullscreenFallback();
        attemptFullscreenRequest();
    }

    function stopMenuMusic() {
        try {
            audio?.stopMusic("menuMusic");
        } catch (_) {
            // Ignore audio errors.
        }
    }

    function setLoaderProgress(percent) {
        if (!progressBar || !progressValue) {
            return;
        }
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        progressBar.style.width = `${clamped}%`;
        progressValue.textContent = `${clamped}%`;
    }

    function hideLoader() {
        if (!loader || loaderHidden) {
            return;
        }
        loaderHidden = true;
        loader.classList.add("intro-loader--hidden");
        loader.setAttribute("aria-hidden", "true");
        window.setTimeout(() => {
            loader.hidden = true;
        }, 420);
    }

    function safePlay(video) {
        if (!video) {
            return;
        }
        const playResult = video.play();
        if (playResult && typeof playResult.catch === "function") {
            playResult.catch(() => {});
        }
    }

    function detectFullscreenIntent() {
        let shouldRequest = false;
        let propagate = false;

        try {
            if (window.sessionStorage?.getItem(FULLSCREEN_FLAG_KEY) === "1") {
                shouldRequest = true;
                propagate = true;
                window.sessionStorage.removeItem(FULLSCREEN_FLAG_KEY);
            }
        } catch (_) {
            // Ignore storage errors.
        }

        try {
            const currentUrl = new URL(window.location.href);
            const hasSearchFlag = currentUrl.searchParams.get("fs") === "1";
            const hasHashFlag =
                currentUrl.hash === "#fs" || currentUrl.hash === "#fullscreen";

            if (hasSearchFlag || hasHashFlag) {
                shouldRequest = true;
                propagate = true;
                if (hasSearchFlag) {
                    currentUrl.searchParams.delete("fs");
                }
                if (hasHashFlag) {
                    currentUrl.hash = "";
                }
                const sanitizedUrl =
                    currentUrl.pathname +
                    (currentUrl.search || "") +
                    (currentUrl.hash || "");
                window.history.replaceState(null, "", sanitizedUrl);
            }
        } catch (_) {
            // Ignore URL parsing issues.
        }

        shouldPropagateFullscreen = propagate || shouldRequest;
        fullscreenIntent = shouldRequest;
        return shouldRequest;
    }

    function requestFullscreenIfNeeded() {
        if (!detectFullscreenIntent()) {
            return;
        }
        triggerFullscreenRequest();
    }

    async function preloadAsset(definition) {
        try {
            const response = await fetch(definition.src, { cache: "force-cache" });
            if (!response.ok) {
                throw new Error(`Failed to fetch ${definition.src}`);
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            objectUrls.push(url);
            return url;
        } catch (_error) {
            return definition.src;
        }
    }

    async function preloadAssets() {
        const result = new Map();
        let completed = 0;
        const total = assetDefinitions.length || 1;

        for (const definition of assetDefinitions) {
            const url = await preloadAsset(definition);
            result.set(definition.key, url);
            completed += 1;
            setLoaderProgress((completed / total) * 100);
        }

        return result;
    }

    function prepareVideo(videoElement, sourceUrl) {
        if (!videoElement) {
            return;
        }
        videoElement.src = sourceUrl;
        videoElement.preload = "auto";
        videoElement.playsInline = true;
        videoElement.load();
    }

    function bindIntroPlaybackRetry() {
        if (!introVideo) {
            return;
        }
        const events = ["pointerdown", "touchstart", "keydown"];
        let active = true;

        const handler = () => {
            if (!introVideo.paused && !introVideo.ended) {
                unbind();
                return;
            }
            if (!document.fullscreenElement && shouldPropagateFullscreen) {
                fullscreenIntent = true;
                triggerFullscreenRequest();
            }
            safePlay(introVideo);
        };

        const unbind = () => {
            if (!active) {
                return;
            }
            active = false;
            events.forEach((eventName) => {
                window.removeEventListener(eventName, handler, true);
            });
        };

        events.forEach((eventName) => {
            window.addEventListener(eventName, handler, true);
        });

        introVideo.addEventListener("play", unbind, { once: true });
        introVideo.addEventListener("ended", unbind, { once: true });
    }

    function showIntroVideo() {
        if (!introVideo) {
            handleIntroEnded();
            return;
        }

        const revealAndPlay = () => {
            introVideo.removeEventListener("canplay", revealAndPlay);
            hideLoader();
            introVideo.classList.remove("intro-video--hidden");
            safePlay(introVideo);
            bindIntroPlaybackRetry();
            if (!document.fullscreenElement && shouldPropagateFullscreen) {
                fullscreenIntent = true;
                triggerFullscreenRequest();
            }
        };

        if (introVideo.readyState >= 2) {
            revealAndPlay();
        } else {
            introVideo.addEventListener("canplay", revealAndPlay);
            window.setTimeout(() => {
                // Fallback in case canplay never fires.
                if (!loaderHidden) {
                    revealAndPlay();
                }
            }, 2500);
        }
    }

    function handleIntroEnded() {
        if (introVideo) {
            introVideo.classList.add("intro-video--hidden");
            introVideo.pause();
        }
        if (poster) {
            poster.hidden = false;
        } else {
            // If poster is missing, move straight to hero video.
            startHeroVideo();
        }
    }

    function startHeroVideo() {
        if (!heroVideo) {
            navigateToPlay();
            return;
        }
        if (!document.fullscreenElement && shouldPropagateFullscreen) {
            fullscreenIntent = true;
            triggerFullscreenRequest();
        }
        heroVideo.classList.remove("intro-video--hidden");
        safePlay(heroVideo);
    }

    function handleHeroEnded() {
        navigateToPlay();
    }

    function handleCallHeroButton() {
        if (callHeroButton) {
            callHeroButton.disabled = true;
        }
        if (poster) {
            poster.hidden = true;
        }
        if (!document.fullscreenElement && shouldPropagateFullscreen) {
            fullscreenIntent = true;
            triggerFullscreenRequest();
        }
        startHeroVideo();
    }

    function releaseObjectUrls() {
        cleanupFullscreenFallback();
        objectUrls.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch (_) {
                // Ignore revoke errors.
            }
        });
        objectUrls.length = 0;
    }

    function navigateToPlay() {
        releaseObjectUrls();
        if (shouldPropagateFullscreen) {
            try {
                window.sessionStorage?.setItem(FULLSCREEN_FLAG_KEY, "1");
            } catch (_) {
                // Ignore storage issues.
            }
        }

        try {
            const targetUrl = new URL("play.html", window.location.href);
            if (shouldPropagateFullscreen) {
                targetUrl.searchParams.set("fs", "1");
            }
            window.location.replace(
                targetUrl.pathname + targetUrl.search + targetUrl.hash,
            );
        } catch (_) {
            window.location.replace(
                shouldPropagateFullscreen ? "play.html?fs=1" : "play.html",
            );
        }
    }

    async function init() {
        stopMenuMusic();
        requestFullscreenIfNeeded();

        if (introVideo) {
            introVideo.addEventListener("ended", handleIntroEnded, { once: true });
            introVideo.addEventListener(
                "error",
                () => {
                    hideLoader();
                    handleIntroEnded();
                },
                { once: true },
            );
        }

        if (heroVideo) {
            heroVideo.addEventListener("ended", handleHeroEnded, { once: true });
            heroVideo.addEventListener(
                "error",
                handleHeroEnded,
                { once: true },
            );
        }

        if (callHeroButton) {
            callHeroButton.addEventListener("click", handleCallHeroButton);
        }

        let assets;
        try {
            assets = await preloadAssets();
        } catch (_) {
            assets = new Map();
        }

        const introSource = assets.get("intro") || "video/intro.mp4";
        const heroSource = assets.get("hero") || "video/hero_come2.mp4";

        prepareVideo(introVideo, introSource);
        prepareVideo(heroVideo, heroSource);

        showIntroVideo();
    }

    window.addEventListener("pageshow", () => {
        // Ensure loader visible if page restored from cache.
        if (loader) {
            loaderHidden = loader.hasAttribute("hidden");
        }
    });

    window.addEventListener("beforeunload", releaseObjectUrls);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
