(() => {
    const playLink = document.querySelector('[data-action="start-game"]');
    const orientationOverlay = document.getElementById("orientationOverlay");
    const coarsePointerMedia =
        typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
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

    function requestFullscreen(target) {
        if (!target) {
            return null;
        }

        const method =
            target.requestFullscreen ||
            target.webkitRequestFullscreen ||
            target.msRequestFullscreen;

        if (typeof method === "function") {
            return method.call(target);
        }

        return null;
    }

    function bindStartButton() {
        if (!playLink) {
            return;
        }

        playLink.addEventListener("click", (event) => {
            event.preventDefault();

            const targetHref = playLink.getAttribute("href") || "play.html";
            const proceedToGame = () => {
                window.location.href = targetHref;
            };

            const fullscreenTarget = document.documentElement;
            if (fullscreenTarget) {
                try {
                    const result = requestFullscreen(fullscreenTarget);
                    if (result && typeof result.then === "function") {
                        result
                            .then(() => {
                                attemptLandscapeLock();
                                updateOrientationOverlay();
                                proceedToGame();
                            })
                            .catch(() => {
                                proceedToGame();
                            });
                        return;
                    }

                    if (result !== null && result !== undefined) {
                        attemptLandscapeLock();
                        updateOrientationOverlay();
                        proceedToGame();
                        return;
                    }
                } catch (err) {
                    // Ignore errors and fall through to navigation.
                }
            }

            proceedToGame();
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

        window.addEventListener("resize", updateOrientationOverlay);
        window.addEventListener("orientationchange", updateOrientationOverlay);
        document.addEventListener("fullscreenchange", updateOrientationOverlay);
    }

    bindStartButton();
    bindOrientationListeners();
    updateOrientationOverlay();
})();
