(() => {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const stage = document.getElementById("gameStage");
    const coinCountElement = document.getElementById("coinCountValue");
    const lifeDisplayElement = document.getElementById("lifeDisplay");
    const gameOverOverlay = document.getElementById("gameOverOverlay");
    const orientationOverlay = document.getElementById("orientationOverlay");
    const restartButton = document.querySelector('[data-action="restart-game"]');
    const exitToMenuButton = document.querySelector('[data-action="exit-to-menu"]');
    const menuButton = document.querySelector('[data-action="open-menu"]');
    const coarsePointerMedia =
        typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    const audio = window.gameAudio || null;
    const FULLSCREEN_FLAG_KEY = "game05kira_fullscreen_requested";

    if (gameOverOverlay) {
        gameOverOverlay.setAttribute("aria-hidden", "true");
    }
    if (orientationOverlay) {
        orientationOverlay.setAttribute("aria-hidden", "true");
    }

    const background = {
        image: null,
        parallaxAmplitude: 24,
    };

    const heroFrameSources = Array.from({ length: 11 }, (_, index) => {
        const frameIndex = String(index + 1).padStart(2, "0");
        return `img-hero/run/run_${frameIndex}.png`;
    });

    const heroFrames = [];
    const floorOffset = 40;
    let viewportWidth = canvas.width;
    let viewportHeight = canvas.height;
    let deviceScale = window.devicePixelRatio || 1;
    let heroSpriteMetrics = null;

    const world = {
        width: canvas.width * 3,
        height: canvas.height,
    };

    const camera = {
        x: 0,
        y: 0,
        width: viewportWidth,
        height: viewportHeight,
        marginX: 0.3,
        marginY: 0.35,
    };

    const platforms = [];
    const coins = [];
    const coinSize = 22;
    const coinPadding = 6;
    const worldSeed = 1337;
    const MAX_LIVES = 3;
    const gameState = {
        coinsCollected: 0,
        lives: MAX_LIVES,
        fallThreshold: 0,
        isGameOver: false,
        orientationBlocked: false,
    };
    let worldInitialized = false;

    const hero = {
        x: 120,
        y: world.height - floorOffset - 148,
        width: 62,
        standHeight: 148,
        crouchHeight: 100,
        height: 148,
        vx: 0,
        vy: 0,
        speed: 220,
        crouchSpeed: 120,
        jumpVelocity: -520,
        gravity: 1500,
        facing: 1,
        isGrounded: true,
        isCrouching: false,
        jumpCount: 0,
        maxJumps: 2,
        controlLock: 0,
        invulnerabilityTimer: 0,
        blinkTimer: 0,
        groundY: null,
        lastSafePlatform: null,
        spriteScale: 1,
        spriteOffsetX: 0,
        spriteOffsetY: 0,
        animFrame: 0,
        animTimer: 0,
        animFrameDuration: 0.055,
    };

    let wasHeroRunning = false;

    const inputState = {
        left: false,
        right: false,
        crouch: false,
        jumpRequested: false,
    };

    let lastTimestamp = 0;

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = reject;
        });
    }

    function init() {
        const heroPromises = heroFrameSources.map(loadImage);
        Promise.all([...heroPromises, loadImage("img/forest.png")])
            .then((assets) => {
                background.image = assets.pop();
                heroFrames.push(...assets);
                heroSpriteMetrics = computeSpriteMetrics(heroFrames);
                applyHeroDimensions(hero.height);
                initializeWorldContent(true);
                updateCoinDisplay();
                updateLifeDisplay();
                updateFallThreshold();
                audio?.playGameMusic();
                audio?.setRunningLoop(false);
                requestAnimationFrame(loop);
            })
            .catch((err) => {
                console.error("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u043f\u0440\u0430\u0439\u0442\u044b \u0433\u0435\u0440\u043e\u044f", err);
            });
    }

    function createRandomGenerator(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function updateCoinDisplay() {
        if (!coinCountElement) return;
        coinCountElement.textContent = String(gameState.coinsCollected);
    }

    function updateLifeDisplay() {
        if (!lifeDisplayElement) return;

        const hearts = [];
        for (let index = 0; index < MAX_LIVES; index += 1) {
            const filled = index < gameState.lives;
            const className = filled ? "life-heart" : "life-heart life-heart--empty";
            hearts.push(`<span class="${className}" aria-hidden="true">&#9829;</span>`);
        }

        lifeDisplayElement.innerHTML = hearts.join("");
        lifeDisplayElement.setAttribute("aria-label", `\u0416\u0438\u0437\u043d\u0438: ${gameState.lives}`);
    }

    function hasCoarsePointer() {
        if (coarsePointerMedia) {
            return coarsePointerMedia.matches;
        }
        return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }

    function resetInputState() {
        inputState.left = false;
        inputState.right = false;
        inputState.crouch = false;
        inputState.jumpRequested = false;
    }

    function setGameOverState(isGameOver) {
        gameState.isGameOver = isGameOver;
        if (gameOverOverlay) {
            gameOverOverlay.hidden = !isGameOver;
            gameOverOverlay.setAttribute("aria-hidden", String(!isGameOver));
        }
        if (isGameOver) {
            audio?.setRunningLoop(false);
            resetInputState();
            restartButton?.focus?.();
        }
    }

    function triggerGameOver() {
        setGameOverState(true);
        hero.controlLock = Infinity;
        hero.vx = 0;
        hero.vy = 0;
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
            // Orientation locking is not supported or not permitted; ignore.
        }
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

    function updateOrientationBlock() {
        const blocked = shouldBlockForOrientation();
        gameState.orientationBlocked = blocked;
        if (orientationOverlay) {
            orientationOverlay.hidden = !blocked;
            orientationOverlay.setAttribute("aria-hidden", String(!blocked));
        }
        if (blocked) {
            resetInputState();
        } else {
            attemptLandscapeLock();
        }
    }

    function requestStageFullscreen() {
        const candidates = [];
        if (stage) candidates.push(stage);
        if (document && document.documentElement) candidates.push(document.documentElement);

        for (let i = 0; i < candidates.length; i += 1) {
            const el = candidates[i];
            const req =
                el.requestFullscreen ||
                el.webkitRequestFullscreen ||
                el.msRequestFullscreen;
            if (typeof req === "function") {
                try {
                    const res = req.call(el);
                    if (res && typeof res.then === "function") {
                        return res;
                    }
                    return res ?? true;
                } catch (_) {
                    // try next candidate
                }
            }
        }

        return null;
    }

    function handleFullscreenResult(result) {
        if (result && typeof result.then === "function") {
            result
                .then(() => {
                    attemptLandscapeLock();
                    updateOrientationBlock();
                })
                .catch(() => {});
        } else if (result !== null && result !== undefined) {
            attemptLandscapeLock();
            updateOrientationBlock();
        }
    }

    function consumeFullscreenIntent() {
        if (typeof window === "undefined") {
            return false;
        }

        let shouldRequest = false;

        try {
            if (window.sessionStorage?.getItem(FULLSCREEN_FLAG_KEY) === "1") {
                shouldRequest = true;
                window.sessionStorage.removeItem(FULLSCREEN_FLAG_KEY);
            }
        } catch (_) {
            // Ignore storage access errors.
        }

        try {
            const currentUrl = new URL(window.location.href);
            const hasSearchFlag = currentUrl.searchParams.get("fs") === "1";
            const hasHashFlag =
                currentUrl.hash === "#fs" || currentUrl.hash === "#fullscreen";

            if (!shouldRequest && (hasSearchFlag || hasHashFlag)) {
                shouldRequest = true;
            }

            if (hasSearchFlag) {
                currentUrl.searchParams.delete("fs");
            }
            if (hasHashFlag) {
                currentUrl.hash = "";
            }

            if (hasSearchFlag || hasHashFlag) {
                const sanitizedUrl =
                    currentUrl.pathname +
                    (currentUrl.search || "") +
                    (currentUrl.hash || "");
                try {
                    window.history.replaceState(null, "", sanitizedUrl);
                } catch (_) {
                    // Fallback: ignore if history API not available.
                }
            }
        } catch (_) {
            // Ignore URL parsing issues (e.g., older browsers).
        }

        return shouldRequest;
    }

    function enterFullscreenIfRequested() {
        if (typeof window === "undefined") {
            return;
        }

        if (!consumeFullscreenIntent()) {
            return;
        }

        const attempt = () => {
            const result = requestStageFullscreen();
            if (result) {
                handleFullscreenResult(result);
                return true;
            }
            return false;
        };

        const scheduleRetries = () => {
            const retry = () => {
                if (!document.fullscreenElement) {
                    attempt();
                }
            };

            setTimeout(retry, 32);
            setTimeout(retry, 260);
            setTimeout(retry, 1000);

            window.addEventListener(
                "pageshow",
                () => {
                    if (!document.fullscreenElement) {
                        attempt();
                    }
                },
                { once: true }
            );

            attemptLandscapeLock();
            updateOrientationBlock();
        };

        if (!attempt()) {
            scheduleRetries();
            if (document.readyState !== "complete") {
                window.addEventListener(
                    "load",
                    () => {
                        if (!document.fullscreenElement) {
                            attempt();
                        }
                    },
                    { once: true }
                );
            }
        }
    }

    function bindFullscreenFallback() {
        const tryFs = () => {
            if (!document.fullscreenElement) {
                const result = requestStageFullscreen();
                if (result) {
                    handleFullscreenResult(result);
                } else {
                    attemptLandscapeLock();
                    updateOrientationBlock();
                }
            }
            window.removeEventListener("pointerdown", tryFs, true);
            window.removeEventListener("keydown", tryFs, true);
            window.removeEventListener("touchstart", tryFs, true);
        };

        window.addEventListener("pointerdown", tryFs, true);
        window.addEventListener("keydown", tryFs, true);
        window.addEventListener("touchstart", tryFs, true);
    }

    function computeSpriteMetrics(frames) {
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let spriteWidth = 0;
        let spriteHeight = 0;

        frames.forEach((frame) => {
            const width = frame.naturalWidth || frame.width;
            const height = frame.naturalHeight || frame.height;
            if (!width || !height) {
                return;
            }

            spriteWidth = Math.max(spriteWidth, width);
            spriteHeight = Math.max(spriteHeight, height);

            tempCanvas.width = width;
            tempCanvas.height = height;
            tempCtx.clearRect(0, 0, width, height);
            tempCtx.drawImage(frame, 0, 0, width, height);
            const imageData = tempCtx.getImageData(0, 0, width, height).data;

            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const alpha = imageData[(y * width + x) * 4 + 3];
                    if (alpha > 15) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }
        });

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX < minX || maxY < minY) {
            return null;
        }

        return {
            spriteWidth,
            spriteHeight,
            collisionLeft: minX,
            collisionTop: minY,
            collisionWidth: maxX - minX + 1,
            collisionHeight: maxY - minY + 1,
        };
    }

    function applyHeroDimensions(currentHeight) {
        if (!heroSpriteMetrics) {
            hero.spriteScale = 1;
            return;
        }

        const scale = currentHeight / heroSpriteMetrics.collisionHeight;
        hero.spriteScale = scale;
        hero.width = heroSpriteMetrics.collisionWidth * scale;
        hero.spriteOffsetX = heroSpriteMetrics.collisionLeft * scale;
        hero.spriteOffsetY = heroSpriteMetrics.collisionTop * scale;
    }

    function setHeroHeight(targetHeight) {
        if (Math.abs(hero.height - targetHeight) < 0.01) {
            return;
        }

        const bottom = hero.y + hero.height;
        const center = hero.x + hero.width / 2;
        hero.height = targetHeight;
        applyHeroDimensions(hero.height);
        hero.y = bottom - hero.height;
        hero.x = center - hero.width / 2;
    }

    function updateFallThreshold() {
        gameState.fallThreshold = world.height + viewportHeight * 0.5;
    }

    function addCoinForPlatform(platform) {
        const coin = {
            x: platform.x + platform.width / 2 - coinSize / 2,
            y: platform.y - coinSize - coinPadding,
            size: coinSize,
            collected: false,
            rotation: Math.random() * Math.PI * 2,
            spinSpeed: 2.5 + Math.random() * 1.5,
        };

        coins.push(coin);
    }

    function addPlatform(x, y, width, height) {
        const platform = { x, y, width, height };
        platforms.push(platform);
        addCoinForPlatform(platform);
        return platform;
    }

    function initializeWorldContent(force = false) {
        if (worldInitialized && !force) {
            return;
        }

        const random = createRandomGenerator(worldSeed);
        platforms.length = 0;
        coins.length = 0;
        gameState.coinsCollected = 0;
        gameState.lives = MAX_LIVES;
        setGameOverState(false);
        updateCoinDisplay();
        updateLifeDisplay();

        const groundY = world.height - floorOffset;
        const levelVerticalOffset = Math.round(world.height * 0.3);
        const bottomZoneHeight = Math.max(120, Math.round(world.height * 0.3));
        const bottomZoneTop = Math.max(
            hero.standHeight * 0.5,
            world.height - bottomZoneHeight
        );
        const maxOffsetFromGround = Math.max(groundY - bottomZoneTop, 60);
        const minGroundClearance = Math.max(50, Math.round(maxOffsetFromGround * 0.3));
        const primaryPlatformY = clamp(
            groundY - Math.max(minGroundClearance + 40, Math.round(maxOffsetFromGround * 0.55)) + levelVerticalOffset,
            bottomZoneTop,
            groundY - minGroundClearance
        );
        const secondaryOffset = Math.max(32, Math.round(maxOffsetFromGround * 0.25));
        const secondPlatformY = clamp(
            primaryPlatformY - secondaryOffset + 0,
            bottomZoneTop,
            groundY - minGroundClearance
        );

        if (!heroSpriteMetrics) {
            applyHeroDimensions(hero.height);
        }

        let firstPlatform = addPlatform(80, primaryPlatformY, 320, 24);
        let lastPlatform = firstPlatform;
        lastPlatform = addPlatform(520, secondPlatformY, 280, 24);

        const verticalAmplitude = Math.max(40, Math.round(maxOffsetFromGround * 0.35));
        const maxAdditionalPlatforms = 6;
        for (let index = 0; index < maxAdditionalPlatforms; index += 1) {
            const gap = 120 + random() * 60;
            const width = 220 + random() * 120;
            const heightOffset = (random() - 0.5) * verticalAmplitude;

            const nextX = lastPlatform.x + lastPlatform.width + gap;
            if (nextX + width > world.width - 120) {
                break;
            }

            const minPlatformY = bottomZoneTop;
            const maxPlatformY = groundY - minGroundClearance;
            const targetY = clamp(lastPlatform.y + heightOffset, minPlatformY, maxPlatformY);
            lastPlatform = addPlatform(nextX, targetY, width, 24);
        }

        // Lower all platforms and coins by ~30% of viewport height, clamped to safe range near the ground
        const levelLowering = Math.round(world.height * 0.3);
        if (platforms.length > 0) {
            for (let i = 0; i < platforms.length; i += 1) {
                const p = platforms[i];
                // Move down while keeping a minimum clearance from the ground
                p.y = clamp(p.y + levelLowering, bottomZoneTop, groundY - minGroundClearance);
            }
            // Reposition coins relative to lowered platforms
            coins.length = 0;
            for (let i = 0; i < platforms.length; i += 1) {
                addCoinForPlatform(platforms[i]);
            }
        }

        if (!firstPlatform && platforms.length > 0) {
            firstPlatform = platforms[0];
        }

        hero.height = hero.standHeight;
        applyHeroDimensions(hero.height);

        if (firstPlatform) {
            hero.x = firstPlatform.x + firstPlatform.width / 2 - hero.width / 2;
            hero.y = firstPlatform.y - hero.height;
            hero.groundY = firstPlatform.y;
            hero.isGrounded = true;
            hero.jumpCount = 0;
            hero.lastSafePlatform = firstPlatform;
        }

        hero.controlLock = 0;
        hero.invulnerabilityTimer = 0;
        hero.blinkTimer = 0;

        worldInitialized = true;
        updateFallThreshold();
    }

    function respawnHero() {
        const platform = hero.lastSafePlatform || platforms[0];
        if (platform) {
            hero.x = platform.x + platform.width / 2 - hero.width / 2;
            hero.y = platform.y - hero.height;
            hero.groundY = platform.y;
        } else {
            hero.x = 80;
            hero.y = world.height * 0.25;
            hero.groundY = null;
        }

        hero.vx = 0;
        hero.vy = 0;
        hero.isGrounded = true;
        hero.jumpCount = 0;
        hero.controlLock = 0.6;
        hero.invulnerabilityTimer = 2;
        hero.blinkTimer = 0;
        hero.isCrouching = false;
    }

    function handleHeroLifeLoss() {
        if (hero.invulnerabilityTimer > 0 || gameState.isGameOver) {
            return;
        }

        gameState.lives = Math.max(0, gameState.lives - 1);
        updateLifeDisplay();

        if (gameState.lives <= 0) {
            triggerGameOver();
            return;
        }

        respawnHero();
    }

    function handleHeroFall() {
        if (hero.invulnerabilityTimer > 0 || gameState.isGameOver) {
            return;
        }
        const heroBottom = hero.y + hero.height;
        if (heroBottom > gameState.fallThreshold) {
            audio?.playFall();
            handleHeroLifeLoss();
        }
    }

    function loop(timestamp) {
        if (!lastTimestamp) {
            lastTimestamp = timestamp;
        }
        const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.033);
        lastTimestamp = timestamp;

        update(delta);
        render();

        requestAnimationFrame(loop);
    }

    function update(delta) {
        if (!gameState.orientationBlocked && !gameState.isGameOver) {
            handleInput();
        } else {
            inputState.jumpRequested = false;
        }

        if (hero.controlLock > 0) {
            hero.controlLock = Math.max(0, hero.controlLock - delta);
        }

        if (hero.invulnerabilityTimer > 0) {
            hero.invulnerabilityTimer = Math.max(0, hero.invulnerabilityTimer - delta);
            hero.blinkTimer += delta;
        } else {
            hero.blinkTimer = 0;
        }

        if (gameState.orientationBlocked || gameState.isGameOver) {
            hero.vx = 0;
            hero.vy = 0;
            updateCamera();
            updateAnimation(0);
            return;
        }

        const canControl = hero.controlLock <= 0;

        // Horizontal movement
        const targetSpeed = hero.isCrouching ? hero.crouchSpeed : hero.speed;
        hero.vx = 0;
        if (canControl) {
            if (inputState.left) {
                hero.vx = -targetSpeed;
                hero.facing = -1;
            } else if (inputState.right) {
                hero.vx = targetSpeed;
                hero.facing = 1;
            }
        }

        // Apply gravity
        hero.vy += hero.gravity * delta;

        let nextX = hero.x + hero.vx * delta;
        let nextY = hero.y + hero.vy * delta;
        const wasGrounded = hero.isGrounded;
        hero.isGrounded = false;
        hero.groundY = null;

        // Platform collisions
        platforms.forEach((platform) => {
            const overlapsHorizontally =
                nextX < platform.x + platform.width &&
                nextX + hero.width > platform.x;

            if (!overlapsHorizontally) {
                return;
            }

            const heroPrevBottom = hero.y + hero.height;
            const heroNextBottom = nextY + hero.height;

            // Landing on top of the platform
            if (heroPrevBottom <= platform.y && heroNextBottom >= platform.y) {
                nextY = platform.y - hero.height;
                hero.vy = 0;
                hero.isGrounded = true;
                hero.jumpCount = 0;
                hero.groundY = platform.y;
                hero.lastSafePlatform = platform;
            }

            // Prevent passing through the platform from below
            if (
                hero.y >= platform.y + platform.height &&
                nextY <= platform.y + platform.height
            ) {
                nextY = platform.y + platform.height;
                hero.vy = Math.max(hero.vy, 0);
            }
        });

        hero.x = nextX;
        hero.y = nextY;

        if (!wasGrounded && hero.isGrounded) {
            audio?.playLand();
        }

        // Keep inside horizontal bounds of the world
        if (hero.x < 0) hero.x = 0;
        const maxHeroX = Math.max(0, world.width - hero.width);
        if (hero.x > maxHeroX) {
            hero.x = maxHeroX;
        }

        // Manage crouch height transitions
        const targetHeight = hero.isCrouching ? hero.crouchHeight : hero.standHeight;
        setHeroHeight(targetHeight);

        if (!hero.isGrounded) {
            hero.groundY = null;
        }

        handleHeroFall();

        updateCoins(delta);
        updateCamera();
        updateAnimation(delta);
        inputState.jumpRequested = false;
    }

    function updateCoins(delta) {
        const heroRight = hero.x + hero.width;
        const heroBottom = hero.y + hero.height;

        coins.forEach((coin) => {
            if (coin.collected) {
                return;
            }

            coin.rotation = (coin.rotation + coin.spinSpeed * delta) % (Math.PI * 2);

            const coinRight = coin.x + coin.size;
            const coinBottom = coin.y + coin.size;

            const isOverlapping =
                hero.x < coinRight &&
                heroRight > coin.x &&
                hero.y < coinBottom &&
                heroBottom > coin.y;

            if (isOverlapping) {
                coin.collected = true;
                gameState.coinsCollected += 1;
                updateCoinDisplay();
                audio?.playCoin();
            }
        });
    }

    function updateCamera() {
        camera.width = viewportWidth;
        camera.height = viewportHeight;

        const horizontalBoundary = camera.width * camera.marginX;
        const verticalBoundary = camera.height * camera.marginY;

        const heroCenterX = hero.x + hero.width / 2;
        const heroCenterY = hero.y + hero.height / 2;

        const leftLimit = camera.x + horizontalBoundary;
        const rightLimit = camera.x + camera.width - horizontalBoundary;

        if (heroCenterX < leftLimit) {
            camera.x = clamp(heroCenterX - horizontalBoundary, 0, Math.max(0, world.width - camera.width));
        } else if (heroCenterX > rightLimit) {
            camera.x = clamp(heroCenterX + horizontalBoundary - camera.width, 0, Math.max(0, world.width - camera.width));
        }

        const topLimit = camera.y + verticalBoundary;
        const bottomLimit = camera.y + camera.height - verticalBoundary;

        if (heroCenterY < topLimit) {
            camera.y = clamp(heroCenterY - verticalBoundary, 0, Math.max(0, world.height - camera.height));
        } else if (heroCenterY > bottomLimit) {
            camera.y = clamp(heroCenterY + verticalBoundary - camera.height, 0, Math.max(0, world.height - camera.height));
        }

        if (world.width <= camera.width) {
            camera.x = 0;
        }

        if (world.height <= camera.height) {
            camera.y = 0;
        }
    }

    function handleInput() {
        if (hero.controlLock > 0) {
            inputState.jumpRequested = false;
            hero.isCrouching = false;
            return;
        }

        if (inputState.jumpRequested && hero.jumpCount < hero.maxJumps) {
            hero.vy = hero.jumpVelocity;
            hero.isGrounded = false;
            hero.jumpCount += 1;
            audio?.playJump();
        }

        hero.isCrouching = inputState.crouch && hero.isGrounded;
    }

    function updateAnimation(delta) {
        const moving = Math.abs(hero.vx) > 1;
        const shouldRun = moving && hero.isGrounded && !hero.isCrouching;

        if (audio && shouldRun !== wasHeroRunning) {
            audio.setRunningLoop(shouldRun);
            wasHeroRunning = shouldRun;
        }

        if (shouldRun) {
            hero.animTimer += delta;
            if (hero.animTimer >= hero.animFrameDuration) {
                hero.animFrame = (hero.animFrame + 1) % heroFrames.length;
                hero.animTimer = 0;
            }
        } else {
            hero.animFrame = 0;
            hero.animTimer = 0;
        }
    }

    function render() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

        // Background with vertical parallax during jumps
        const backgroundHeight = viewportHeight + background.parallaxAmplitude * 2;
        const groundReference = (hero.groundY ?? hero.lastSafePlatform?.y ?? (world.height - floorOffset));
        const groundY = groundReference - hero.height;
        const jumpOffset = clamp(groundY - hero.y, -background.parallaxAmplitude, background.parallaxAmplitude);
        const parallaxShift = jumpOffset;
        const backgroundY = -background.parallaxAmplitude + parallaxShift;

        if (background.image) {
            ctx.drawImage(
                background.image,
                0,
                0,
                background.image.naturalWidth || background.image.width,
                background.image.naturalHeight || background.image.height,
                0,
                backgroundY,
                viewportWidth,
                backgroundHeight
            );
        } else {
            const gradient = ctx.createLinearGradient(0, 0, 0, viewportHeight);
            gradient.addColorStop(0, "#3c3c3c");
            gradient.addColorStop(1, "#1f1f1f");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, viewportWidth, viewportHeight);
        }

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        // Platforms
        ctx.fillStyle = "#5b5b5b";
        platforms.forEach((platform) => {
            ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        });

        // Coins
        coins.forEach((coin) => {
            if (coin.collected) {
                return;
            }

            const rotation = coin.rotation ?? 0;
            const spinCos = Math.cos(rotation);
            const spinScale = 0.6 + 0.35 * Math.abs(spinCos);
            const bobOffset = Math.sin(rotation * 2) * 2;
            const centerX = coin.x + coin.size / 2;
            const centerY = coin.y + coin.size / 2 + bobOffset;
            const radius = coin.size / 2;
            const frontColor = spinCos >= 0 ? "#ffd86b" : "#e0b652";
            const highlightColor = spinCos >= 0 ? "#fff3b0" : "#f0d37a";
            const rimColor = "#d48b2c";

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.scale(spinScale, 1);

            const gradient = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius);
            gradient.addColorStop(0, highlightColor);
            gradient.addColorStop(0.65, frontColor);
            gradient.addColorStop(1, rimColor);

            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.lineWidth = 2 / Math.max(spinScale, 0.4);
            ctx.strokeStyle = "rgba(212, 139, 44, 0.9)";
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.lineWidth = 1.2 / Math.max(spinScale, 0.4);
            if (typeof ctx.ellipse === "function") {
                ctx.ellipse(-radius * 0.2, 0, radius * 0.6, radius * 0.9, 0, -Math.PI / 3, Math.PI / 3);
                ctx.stroke();
            } else {
                ctx.save();
                ctx.translate(-radius * 0.2, 0);
                ctx.scale(0.6, 0.9);
                ctx.arc(0, 0, radius, -Math.PI / 3, Math.PI / 3);
                ctx.restore();
                ctx.stroke();
            }

            ctx.restore();
        });

        const frame = heroFrames[hero.animFrame];
        const heroVisible = hero.invulnerabilityTimer <= 0 || Math.floor((hero.blinkTimer ?? 0) / 0.1) % 2 === 0;

        if (frame && heroVisible) {
            const naturalWidth = frame.naturalWidth || frame.width || hero.width;
            const naturalHeight = frame.naturalHeight || frame.height || hero.height;
            const scale = hero.spriteScale || (hero.height / naturalHeight);
            const drawWidth = naturalWidth * scale;
            const drawHeight = naturalHeight * scale;
            const drawX = hero.x - hero.spriteOffsetX;
            const drawY = hero.y - hero.spriteOffsetY;

            ctx.save();
            ctx.translate(drawX + drawWidth / 2, drawY + drawHeight / 2);
            ctx.scale(hero.facing, 1);
            ctx.drawImage(
                frame,
                -drawWidth / 2,
                -drawHeight / 2,
                drawWidth,
                drawHeight
            );
            ctx.restore();
        } else if (!frame && heroVisible) {
            // Placeholder rectangle if frames not ready
            ctx.fillStyle = "#ff7373";
            ctx.fillRect(hero.x, hero.y, hero.width, hero.height);
        }

        ctx.restore();
    }

    function setInputState(action, isActive) {
        if (gameState.isGameOver || gameState.orientationBlocked) {
            if (!isActive) {
                switch (action) {
                    case "move-left":
                        inputState.left = false;
                        break;
                    case "move-right":
                        inputState.right = false;
                        break;
                    case "crouch":
                        inputState.crouch = false;
                        break;
                    default:
                        break;
                }
            }
            return;
        }

        switch (action) {
            case "move-left":
                inputState.left = isActive;
                break;
            case "move-right":
                inputState.right = isActive;
                break;
            case "crouch":
                inputState.crouch = isActive;
                break;
            case "jump":
                if (isActive) {
                    inputState.jumpRequested = true;
                }
                break;
            default:
                break;
        }
    }

    function bindControlButtons() {
        document.querySelectorAll(".control-button").forEach((button) => {
            const action = button.dataset.action;
            if (!action) return;

            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                button.setPointerCapture(event.pointerId);
                setInputState(action, true);
            });

            button.addEventListener("pointerup", (event) => {
                event.preventDefault();
                button.releasePointerCapture(event.pointerId);
                setInputState(action, false);
            });

            button.addEventListener("pointercancel", () => {
                setInputState(action, false);
            });

            button.addEventListener("pointerleave", () => {
                setInputState(action, false);
            });
        });
    }

    function bindKeyboard() {
        window.addEventListener("keydown", (event) => {
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
                event.preventDefault();
            }

            switch (event.code) {
                case "ArrowLeft":
                case "KeyA":
                    setInputState("move-left", true);
                    break;
                case "ArrowRight":
                case "KeyD":
                    setInputState("move-right", true);
                    break;
                case "ArrowDown":
                case "KeyS":
                    setInputState("crouch", true);
                    break;
                case "ArrowUp":
                case "Space":
                case "KeyW":
                    setInputState("jump", true);
                    break;
                default:
                    break;
            }
        });

        window.addEventListener("keyup", (event) => {
            switch (event.code) {
                case "ArrowLeft":
                case "KeyA":
                    setInputState("move-left", false);
                    break;
                case "ArrowRight":
                case "KeyD":
                    setInputState("move-right", false);
                    break;
                case "ArrowDown":
                case "KeyS":
                    setInputState("crouch", false);
                    break;
                default:
                    break;
            }
        });
    }

    function bindMenuButton() {
        if (!menuButton) {
            return;
        }

        menuButton.addEventListener("click", () => {
            audio?.playMenuClick();
            audio?.stopMusic();
            audio?.setRunningLoop(false);
            resetInputState();
            if (document.fullscreenElement) {
                document.exitFullscreen?.();
            }
            window.location.href = "index.html";
        });
    }

    function bindGameMenus() {
        if (restartButton) {
            restartButton.addEventListener("click", () => {
                audio?.playMenuClick();
                audio?.setRunningLoop(false);
                setGameOverState(false);
                initializeWorldContent(true);
                resetInputState();
                handleResize();
            });
        }

        if (exitToMenuButton) {
            exitToMenuButton.addEventListener("click", () => {
                audio?.playMenuClick();
                audio?.stopMusic();
                audio?.setRunningLoop(false);
                resetInputState();
                if (document.fullscreenElement) {
                    document.exitFullscreen?.();
                }
                window.location.href = "index.html";
            });
        }
    }

    function bindOrientationListeners() {
        if (coarsePointerMedia) {
            const handlePointerChange = () => updateOrientationBlock();
            if (typeof coarsePointerMedia.addEventListener === "function") {
                coarsePointerMedia.addEventListener("change", handlePointerChange);
            } else if (typeof coarsePointerMedia.addListener === "function") {
                coarsePointerMedia.addListener(handlePointerChange);
            }
        }

        if (typeof screen !== "undefined" && screen.orientation) {
            const handleOrientationChange = () => updateOrientationBlock();
            if (typeof screen.orientation.addEventListener === "function") {
                screen.orientation.addEventListener("change", handleOrientationChange);
            } else if ("onchange" in screen.orientation) {
                screen.orientation.onchange = handleOrientationChange;
            }
        }
    }

    function rescaleWorld() {
        // Intentionally no-op: keep world coordinates stable across resizes.
    }

    function handleResize() {
        const bounds = stage.getBoundingClientRect();
        const displayWidth = Math.max(1, Math.round(bounds.width));
        const displayHeight = Math.max(1, Math.round(bounds.height));
        const nextDpr = window.devicePixelRatio || 1;

        const previousWidth = viewportWidth;
        const previousHeight = viewportHeight;

        viewportWidth = displayWidth;
        viewportHeight = displayHeight;
        deviceScale = nextDpr;

        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        canvas.width = Math.round(displayWidth * nextDpr);
        canvas.height = Math.round(displayHeight * nextDpr);

        // Do not rescale world/entities; only adjust canvas and camera.
        world.width = Math.max(world.width, viewportWidth * 3);
        updateFallThreshold();
        updateCamera();
        updateOrientationBlock();
    }

    function bindResizeObserver() {
        if (typeof ResizeObserver === "function") {
            const observer = new ResizeObserver(() => handleResize());
            observer.observe(stage);
        }

        window.addEventListener("resize", handleResize);
        window.addEventListener("orientationchange", handleResize);
        document.addEventListener("fullscreenchange", handleResize);

        handleResize();
    }

    bindControlButtons();
    bindKeyboard();
    bindMenuButton();
    bindGameMenus();
    bindOrientationListeners();
    bindResizeObserver();
    enterFullscreenIfRequested();
    bindFullscreenFallback();
    init();
})();
