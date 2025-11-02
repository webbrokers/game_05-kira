(() => {
    const loader = document.getElementById("introLoader");
    const progressBar = document.getElementById("introProgressBar");
    const progressValue = document.getElementById("introProgressValue");
    const introVideo = document.getElementById("introVideo");
    const heroVideo = document.getElementById("heroVideo");
    const poster = document.getElementById("introPoster");
    const callHeroButton = document.getElementById("callHeroButton");
    const audio = window.gameAudio || null;

    const assetDefinitions = [
        { key: "intro", src: "video/intro.mp4", mime: "video/mp4" },
        { key: "hero", src: "video/hero_come2.mp4", mime: "video/mp4" },
    ];

    const objectUrls = [];
    let loaderHidden = false;

    function softenMenuMusic() {
        try {
            audio?.playMenuMusicSoft();
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
        startHeroVideo();
    }

    function releaseObjectUrls() {
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

        try {
            const targetUrl = new URL("play.html", window.location.href);
            window.location.replace(
                targetUrl.pathname + targetUrl.search + targetUrl.hash,
            );
        } catch (_) {
            window.location.replace("play.html");
        }
    }

    async function init() {
        softenMenuMusic();

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
