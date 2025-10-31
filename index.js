(() => {
    const playButton = document.querySelector('[data-action="start-game"]');
    const fullscreenButton = document.querySelector('[data-action="enter-fullscreen"]');
    const orientationOverlay = document.getElementById("orientationOverlay");
    const coarsePointerMedia =
        typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    const audio = window.gameAudio || null;
    const FULLSCREEN_FLAG_KEY = "game05kira_fullscreen_requested";
    let orientationBlocked = false;

    if (orientationOverlay) {
        orientationOverlay.hidden = true;
        orientationOverlay.setAttribute("aria-hidden", "true");
    }

    function hasCoarsePointer() {
        if (coarsePointerMedia) {
            return coarsePointerMedia.matches;
        }
        return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }

    function shouldBlockForOrientation() {
        if (!orientationOverlay) {
            return false;
        }
        if (!hasCoarsePointer()) {
            return false;
        }
        return window.innerHeight > window.innerWidth;
    }

    function updateOrientationOverlay() {
        orientationBlocked = shouldBlockForOrientation();
        if (!orientationOverlay) {
            return;
        }

        orientationOverlay.hidden = !orientationBlocked;
        orientationOverlay.setAttribute("aria-hidden", String(!orientationBlocked));
    }

    function attemptLandscapeLock() {
        try {
            if (typeof screen === "undefined") {
                return;
            }
            const orientation = screen.orientation;
            if (orientation && typeof orientation.lock === "function") {
                const lockResult = orientation.lock("landscape");
                if (lockResult && typeof lockResult.catch === "function") {
                    lockResult.catch(() => {});
                }
            }
        } catch (err) {
            // Ignore orientation locking errors.
        }
    }

    function requestAnyFullscreen() {
        try {
            const root = document.documentElement;
            const method =
                root.requestFullscreen ||
                root.webkitRequestFullscreen ||
                root.msRequestFullscreen;
            if (typeof method === "function") {
                const res = method.call(root);
                if (res && typeof res.catch === "function") {
                    res.catch(() => {});
                }
            }
        } catch (_) {
            // Ignore
        }
    }

    function flagFullscreenIntent() {
        if (typeof window === "undefined") {
            return;
        }
        try {
            if (window.sessionStorage) {
                window.sessionStorage.setItem(FULLSCREEN_FLAG_KEY, "1");
            }
        } catch (_) {
            // Ignore storage errors (e.g., private mode).
        }
    }

    function enablePlayButton() {
        if (!playButton) {
            return;
        }
        playButton.disabled = false;
    }

    function bindStartButton() {
        if (!playButton) {
            return;
        }

        playButton.addEventListener("click", (event) => {
            if (playButton.disabled) {
                event.preventDefault();
                return;
            }

            event.preventDefault();
            audio?.playMenuClick();

            flagFullscreenIntent();

            // Try to enter fullscreen immediately on user gesture (best effort)
            requestAnyFullscreen();

            const targetHref = playButton.dataset.target || "play.html";
            let targetUrl = targetHref;
            try {
                const url = new URL(targetHref, window.location.href);
                url.searchParams.set("fs", "1");
                targetUrl = url.pathname + url.search + url.hash;
            } catch (_) {
                // Fallback to hash flag if URL construction fails (e.g., older browsers)
                targetUrl = `${targetHref}${targetHref.includes("#") ? "" : "#fs"}`;
            }

            window.location.href = targetUrl;
        });
    }

    function bindFullscreenButton() {
        if (!fullscreenButton) {
            return;
        }

        fullscreenButton.addEventListener("click", (event) => {
            event.preventDefault();
            audio?.playMenuClick();
            flagFullscreenIntent();
            requestAnyFullscreen();
            attemptLandscapeLock();
            enablePlayButton();
        });
    }

    function bindOrientationListeners() {
        if (coarsePointerMedia) {
            const handler = () => updateOrientationOverlay();
            if (typeof coarsePointerMedia.addEventListener === "function") {
                coarsePointerMedia.addEventListener("change", handler);
            } else if (typeof coarsePointerMedia.addListener === "function") {
                coarsePointerMedia.addListener(handler);
            }
        }

        window.addEventListener("resize", () => {
            updateOrientationOverlay();
        });
        window.addEventListener("orientationchange", () => {
            updateOrientationOverlay();
            attemptLandscapeLock();
        });
    }

    bindFullscreenButton();
    bindStartButton();
    bindOrientationListeners();
    updateOrientationOverlay();
    audio?.playMenuMusic();
    attemptLandscapeLock();
})();
