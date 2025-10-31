(() => {
    const playLink = document.querySelector('[data-action="start-game"]');
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

    function bindStartButton() {
        if (!playLink) {
            return;
        }

        playLink.addEventListener("click", (event) => {
            event.preventDefault();
            audio?.playMenuClick();
            audio?.stopMusic();

            if (typeof window !== "undefined" && window.sessionStorage) {
                try {
                    window.sessionStorage.setItem(FULLSCREEN_FLAG_KEY, "1");
                } catch (err) {
                    // Ignore storage errors (e.g., private mode).
                }
            }

            const targetHref = playLink.getAttribute("href") || "play.html";
            window.location.href = targetHref;
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

    bindStartButton();
    bindOrientationListeners();
    updateOrientationOverlay();
    audio?.playMenuMusic();
    attemptLandscapeLock();
})();
