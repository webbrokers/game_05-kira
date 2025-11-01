(() => {
    const playButton = document.querySelector('[data-action="start-game"]');
    const fullscreenButton = document.querySelector('[data-action="enter-fullscreen"]');
    const orientationOverlay = document.getElementById("orientationOverlay");
    const coarsePointerMedia =
        typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    const audio = window.gameAudio || null;
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

            const targetHref = playButton.dataset.target || "intro.html";
            window.location.href = targetHref;
        });
    }

    function bindFullscreenButton() {
        if (!fullscreenButton) {
            return;
        }

        fullscreenButton.addEventListener("click", (event) => {
            event.preventDefault();
            audio?.playMenuClick();
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
