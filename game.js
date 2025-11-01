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
    const prestartOverlay = document.getElementById("prestartOverlay");
    const startChaseButton = document.querySelector('[data-action="start-chase"]');
    const jumpButtonElement = document.querySelector('[data-action="jump"]');
    const coarsePointerMedia =
        typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    const audio = window.gameAudio || null;
    let jumpBoostTimeoutId = null;

    if (gameOverOverlay) {
        gameOverOverlay.setAttribute("aria-hidden", "true");
    }
    if (orientationOverlay) {
        orientationOverlay.setAttribute("aria-hidden", "true");
    }
    if (prestartOverlay) {
        prestartOverlay.hidden = false;
        prestartOverlay.setAttribute("aria-hidden", "false");
    }

    const background = {
        image: null,
        parallaxAmplitude: 12,
        parallaxFactorX: 0.125,
        scale: 1,
        scaledWidth: 0,
        scaledHeight: 0,
        currentVerticalShift: 0,
        verticalResponse: 4,
        scaleMultiplier: 1,
        scaleTarget: 1,
        scaleResponse: 9,
        scaleHoldTimer: 0,
        scaleHoldDuration: 0.28,
        doubleJumpScale: 1.1,
        maxScale: 1.15,
    };

    const TERRAIN_BLUEPRINT = {
        sourceWidth: 12592,
        sourceHeight: 2400,
        top: 2290,
        bottom: 2400,
        segments: [
            [0, 4497],
            [4872, 6139],
            [6444, 7711],
            [8099, 12592],
        ],
    };

    const terrain = {
        baseImage: null,
        decorImage: null,
        scale: 1,
        drawWidth: 0,
        drawHeight: 0,
        drawY: 0,
        groundY: null,
        collisionHeight: 80,
        tileCount: 2,
        tiles: [],
        collisionSegments: [],
        totalWidth: 0,
        sourceWidth: TERRAIN_BLUEPRINT.sourceWidth,
        sourceHeight: TERRAIN_BLUEPRINT.sourceHeight,
    };

    const coinAnimation = {
        width: 48,
        height: 48,
        spinSpeed: Math.PI * 1.6,
        bobAmplitude: 6,
        bobSpeedBase: 3.2,
        bobSpeedVariance: 1.4,
    };

    const heroFrameSources = Array.from({ length: 11 }, (_, index) => {
        const frameIndex = String(index + 1).padStart(2, "0");
        return `img-hero/run/run_${frameIndex}.png`;
    });

    const heroFrames = [];
    let floorOffset = 40;
    const coinPadding = 10;
    let viewportWidth = canvas.width;
    let viewportHeight = canvas.height;
    let deviceScale = window.devicePixelRatio || 1;
    let heroSpriteMetrics = null;

    const HERO_SCALE = 0.8;
    const HERO_STAND_HEIGHT = 222 * HERO_SCALE;
    const HERO_CROUCH_HEIGHT = 150 * HERO_SCALE;
    const HERO_BASE_WIDTH = 93 * HERO_SCALE;

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
    const worldSeed = 1337;
    const MAX_LIVES = 3;
    const gameState = {
        coinsCollected: 0,
        lives: MAX_LIVES,
        fallThreshold: 0,
        isGameOver: false,
        orientationBlocked: false,
        awaitingStart: true,
    };
    let worldInitialized = false;

    const hero = {
        x: 120,
        y: world.height - floorOffset - HERO_STAND_HEIGHT,
        width: HERO_BASE_WIDTH,
        standHeight: HERO_STAND_HEIGHT,
        crouchHeight: HERO_CROUCH_HEIGHT,
        height: HERO_STAND_HEIGHT,
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

    function setPrestartState(active) {
        gameState.awaitingStart = active;
        if (prestartOverlay) {
            prestartOverlay.hidden = !active;
            prestartOverlay.setAttribute("aria-hidden", String(!active));
        }
        if (active) {
            resetInputState();
            hero.vx = 0;
            hero.vy = 0;
            lastTimestamp = 0;
        } else {
            lastTimestamp = 0;
        }
    }

    function startChaseSequence() {
        if (!gameState.awaitingStart) {
            return;
        }
        audio?.playMenuClick();
        const result = requestStageFullscreen();
        if (result) {
            handleFullscreenResult(result);
        } else {
            attemptLandscapeLock();
            updateOrientationBlock();
        }
        setPrestartState(false);
    }

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

    function getCoinDrawWidth() {
        return coinAnimation.width || 48;
    }

    function getCoinDrawHeight() {
        return coinAnimation.height || 48;
    }

    function init() {
        const heroPromises = heroFrameSources.map(loadImage);
        Promise.all([
            Promise.all(heroPromises),
            loadImage("img/new_bg/bg_01.png"),
            loadImage("img/new_bg/platform-01.png"),
            loadImage("img/new_bg/platform-02.png"),
        ])
            .then(([heroImages, backgroundImage, platformBaseImage, platformDecorImage]) => {
                background.image = backgroundImage;
                terrain.baseImage = platformBaseImage;
                terrain.decorImage = platformDecorImage;
                updateBackgroundMetrics();
                updateTerrainMetrics();
                heroFrames.push(...heroImages);
                heroSpriteMetrics = computeSpriteMetrics(heroFrames);
                applyHeroDimensions(hero.height);
                initializeWorldContent(true);
                updateCoinDisplay();
                updateLifeDisplay();
                updateFallThreshold();
                audio?.playMenuMusicSoft();
                audio?.setRunningLoop(false);
                requestAnimationFrame(loop);
            })
            .catch((err) => {
                console.error("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0440\u0435\u0441\u0443\u0440\u0441\u044b \u0438\u0433\u0440\u044b", err);
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

    function updateBackgroundState(delta) {
        const targetGround =
            terrain.groundY ?? hero.lastSafePlatform?.y ?? (world.height - floorOffset);
        const groundReference = hero.groundY ?? targetGround;
        const groundY = groundReference - hero.height;
        const targetShift = clamp(
            groundY - hero.y,
            -background.parallaxAmplitude,
            background.parallaxAmplitude
        );

        if (!Number.isFinite(background.currentVerticalShift)) {
            background.currentVerticalShift = targetShift;
        }

        if (Number.isFinite(delta) && delta > 0) {
            const response = Math.max(background.verticalResponse || 0, 0);
            const lerpFactor = response > 0 ? 1 - Math.exp(-response * delta) : 1;
            background.currentVerticalShift +=
                (targetShift - background.currentVerticalShift) * lerpFactor;
        } else {
            background.currentVerticalShift = targetShift;
        }

        if (!Number.isFinite(background.scaleMultiplier) || background.scaleMultiplier < 1) {
            background.scaleMultiplier = 1;
        }

        if (background.scaleHoldTimer > 0 && Number.isFinite(delta)) {
            background.scaleHoldTimer = Math.max(0, background.scaleHoldTimer - delta);
            if (background.scaleHoldTimer <= 0) {
                background.scaleTarget = 1;
            }
        } else {
            background.scaleTarget = 1;
        }

        const maxScale = background.maxScale ?? 1.2;
        const desiredScale = clamp(background.scaleTarget, 1, maxScale);

        if (Number.isFinite(delta) && delta > 0) {
            const scaleResponse = Math.max(background.scaleResponse || 0, 0);
            const scaleLerp = scaleResponse > 0 ? 1 - Math.exp(-scaleResponse * delta) : 1;
            background.scaleMultiplier += (desiredScale - background.scaleMultiplier) * scaleLerp;
        } else {
            background.scaleMultiplier = desiredScale;
        }

        if (Math.abs(background.scaleMultiplier - 1) < 0.001) {
            background.scaleMultiplier = 1;
        }

        background.scaleMultiplier = clamp(background.scaleMultiplier, 1, maxScale);
        background.currentVerticalShift = clamp(
            background.currentVerticalShift,
            -background.parallaxAmplitude,
            background.parallaxAmplitude
        );
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
        clearJumpVisualBoost();
    }

    function clearJumpVisualBoost() {
        if (jumpBoostTimeoutId) {
            window.clearTimeout(jumpBoostTimeoutId);
            jumpBoostTimeoutId = null;
        }
        jumpButtonElement?.classList.remove("control-button--jump-active");
        background.scaleTarget = 1;
        background.scaleHoldTimer = 0;
        background.scaleMultiplier = 1;
    }

    function triggerJumpVisualBoost(isDoubleJump = false) {
        if (!jumpButtonElement) {
            return;
        }

        jumpButtonElement.classList.add("control-button--jump-active");
        if (jumpBoostTimeoutId) {
            window.clearTimeout(jumpBoostTimeoutId);
        }
        jumpBoostTimeoutId = window.setTimeout(() => {
            jumpButtonElement.classList.remove("control-button--jump-active");
            jumpBoostTimeoutId = null;
        }, 1000);

        if (isDoubleJump) {
            const desiredScale = clamp(
                background.doubleJumpScale ?? 1.1,
                1,
                background.maxScale ?? 1.2
            );
            background.scaleTarget = Math.max(background.scaleTarget, desiredScale);
            const holdDuration = background.scaleHoldDuration ?? 0.28;
            background.scaleHoldTimer = Math.max(background.scaleHoldTimer, holdDuration);
        }
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
        if (startChaseButton && gameState.awaitingStart) {
            startChaseButton.disabled = blocked;
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

    function updateBackgroundMetrics() {
        if (!background.image) {
            return;
        }
        const imageWidth = background.image.naturalWidth || background.image.width;
        const imageHeight = background.image.naturalHeight || background.image.height;
        if (!imageWidth || !imageHeight) {
            return;
        }

        const targetHeight = viewportHeight + background.parallaxAmplitude * 2;
        const scale = targetHeight / imageHeight;
        background.scale = scale;
        background.scaledWidth = imageWidth * scale;
        background.scaledHeight = imageHeight * scale;
    }

    function updateTerrainMetrics() {
        if (!terrain.baseImage) {
            return false;
        }

        const image = terrain.baseImage;
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) {
            return false;
        }

        terrain.sourceWidth = sourceWidth;
        terrain.sourceHeight = sourceHeight;

        const blueprintWidth = TERRAIN_BLUEPRINT.sourceWidth;
        const blueprintHeight = TERRAIN_BLUEPRINT.sourceHeight;
        const topSource = (TERRAIN_BLUEPRINT.top / blueprintHeight) * sourceHeight;
        const bottomSource = (TERRAIN_BLUEPRINT.bottom / blueprintHeight) * sourceHeight;

        const previousScale = terrain.scale;
        const previousGroundY = terrain.groundY;

        const scale = viewportHeight / sourceHeight;
        const scaledWidth = sourceWidth * scale;
        const scaledHeight = sourceHeight * scale;
        const drawY = world.height - scaledHeight;
        const groundY = drawY + topSource * scale;
        const collisionHeight = Math.max((bottomSource - topSource) * scale * 0.35, 80);

        terrain.scale = scale;
        terrain.drawWidth = scaledWidth;
        terrain.drawHeight = scaledHeight;
        terrain.drawY = drawY;
        terrain.groundY = groundY;
        terrain.collisionHeight = collisionHeight;

        const tileCount = terrain.tileCount || 2;
        terrain.tiles = Array.from({ length: tileCount }, (_, index) => ({
            x: index * scaledWidth,
            y: drawY,
        }));
        terrain.totalWidth = tileCount * scaledWidth;

        const segments = [];
        for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
            const tileOffset = tileIndex * scaledWidth;
            for (let segmentIndex = 0; segmentIndex < TERRAIN_BLUEPRINT.segments.length; segmentIndex += 1) {
                const [startRef, endRef] = TERRAIN_BLUEPRINT.segments[segmentIndex];
                const startSource =
                    (startRef / blueprintWidth) * sourceWidth;
                const endSource =
                    (endRef / blueprintWidth) * sourceWidth;
                const segmentWidth = (endSource - startSource) * scale;
                if (segmentWidth <= 2) {
                    continue;
                }
                const segmentX = tileOffset + startSource * scale;
                segments.push({
                    x: segmentX,
                    y: groundY,
                    width: segmentWidth,
                    height: collisionHeight,
                });
            }
        }
        terrain.collisionSegments = segments;

        const nextFloorOffset = Math.max(20, Math.round(world.height - groundY));
        floorOffset = nextFloorOffset;

        const changed =
            Math.abs(scale - previousScale) > 0.001 ||
            (typeof previousGroundY === "number" && Math.abs(previousGroundY - groundY) > 0.5);
        return changed;
    }

    function addCoinForPlatform(platform) {
        const coinWidth = getCoinDrawWidth();
        const coinHeight = getCoinDrawHeight();
        const baseY = platform.y - coinHeight - coinPadding;
        const spinSpeed = coinAnimation.spinSpeed || (Math.PI * 1.6);
        const coin = {
            x: platform.x + platform.width / 2 - coinWidth / 2,
            y: baseY,
            baseY,
            width: coinWidth,
            height: coinHeight,
            collected: false,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: spinSpeed * (0.85 + Math.random() * 0.3),
            bobTimer: Math.random() * Math.PI * 2,
            bobSpeed:
                (coinAnimation.bobSpeedBase || 1) +
                Math.random() * (coinAnimation.bobSpeedVariance || 0),
            bobAmplitude: coinAnimation.bobAmplitude ?? 6,
        };

        coins.push(coin);
    }

    function addPlatform(x, y, width, height, metadata) {
        const platform = {
            x,
            y,
            width,
            height,
            ...(metadata ?? {}),
        };
        platforms.push(platform);
        if (!metadata?.skipCoins) {
            addCoinForPlatform(platform);
        }
        return platform;
    }

    function initializeWorldContent(force = false) {
        if (worldInitialized && !force) {
            return;
        }

        platforms.length = 0;
        coins.length = 0;
        gameState.coinsCollected = 0;
        gameState.lives = MAX_LIVES;
        clearJumpVisualBoost();
        setGameOverState(false);
        updateCoinDisplay();
        updateLifeDisplay();

        if (!heroSpriteMetrics) {
            applyHeroDimensions(hero.height);
        }

        if (terrain.baseImage) {
            updateTerrainMetrics();
        }

        const platformSegments =
            terrain.collisionSegments.length > 0
                ? terrain.collisionSegments
                : [
                      {
                          x: 0,
                          y: world.height - floorOffset,
                          width: Math.max(viewportWidth * 2, world.width),
                          height: Math.max(80, terrain.collisionHeight || 120),
                          skipCoins: true,
                      },
                  ];

        let firstPlatform = null;
        for (let index = 0; index < platformSegments.length; index += 1) {
            const segment = platformSegments[index];
            const platform = addPlatform(segment.x, segment.y, segment.width, segment.height, {
                type: "terrain",
                skipCoins: Boolean(segment.skipCoins),
            });
            if (!firstPlatform) {
                firstPlatform = platform;
            }
        }

        const terrainWidth = terrain.totalWidth || 0;
        if (terrainWidth > 0) {
            world.width = Math.max(terrainWidth, viewportWidth);
        } else if (firstPlatform) {
            world.width = Math.max(
                world.width,
                firstPlatform.x + firstPlatform.width + Math.max(240, Math.round(viewportWidth * 0.5))
            );
        } else {
            world.width = Math.max(world.width, viewportWidth * 2);
        }

        hero.height = hero.standHeight;
        applyHeroDimensions(hero.height);

        if (firstPlatform) {
            const offset = Math.min(firstPlatform.width * 0.1, 180);
            hero.x = firstPlatform.x + offset;
            hero.y = firstPlatform.y - hero.height;
            hero.groundY = firstPlatform.y;
            hero.isGrounded = true;
            hero.jumpCount = 0;
            hero.lastSafePlatform = firstPlatform;
        } else {
            hero.x = 120;
            hero.y = world.height - floorOffset - hero.height;
            hero.groundY = world.height - floorOffset;
            hero.isGrounded = true;
            hero.jumpCount = 0;
            hero.lastSafePlatform = null;
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
        const inputBlocked =
            gameState.orientationBlocked || gameState.isGameOver || gameState.awaitingStart;
        if (!inputBlocked) {
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

        if (gameState.orientationBlocked || gameState.isGameOver || gameState.awaitingStart) {
            hero.vx = 0;
            hero.vy = 0;
            updateCamera();
            updateAnimation(0);
            updateBackgroundState(delta);
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
        updateBackgroundState(delta);
        inputState.jumpRequested = false;
    }

    function updateCoins(delta) {
        if (coins.length === 0) {
            return;
        }

        const heroRight = hero.x + hero.width;
        const heroBottom = hero.y + hero.height;

        coins.forEach((coin) => {
            if (coin.collected) {
                return;
            }

            const rotationSpeed = coin.rotationSpeed || coinAnimation.spinSpeed || (Math.PI * 1.6);
            coin.rotation = (coin.rotation + delta * rotationSpeed) % (Math.PI * 2);
            const bobSpeed = coin.bobSpeed || 1;
            coin.bobTimer = (coin.bobTimer + delta * bobSpeed) % (Math.PI * 2);

            const coinTop = coin.baseY ?? coin.y;
            const coinRight = coin.x + coin.width;
            const coinBottom = coinTop + coin.height;

            const isOverlapping =
                hero.x < coinRight &&
                heroRight > coin.x &&
                hero.y < coinBottom &&
                heroBottom > coinTop;

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

        // Background with vertical and horizontal parallax
        const verticalShift = background.currentVerticalShift ?? 0;
        const backgroundY = -background.parallaxAmplitude + verticalShift;
        const heroCenterX = hero.x + hero.width / 2;
        const heroCenterY = hero.y + hero.height / 2;
        const heroScreenX = heroCenterX - camera.x;
        const heroScreenY = heroCenterY - camera.y;
        const backgroundScale = background.scaleMultiplier ?? 1;

        ctx.save();
        if (backgroundScale !== 1) {
            ctx.translate(heroScreenX, heroScreenY);
            ctx.scale(backgroundScale, backgroundScale);
            ctx.translate(-heroScreenX, -heroScreenY);
        }

        if (background.image && background.scaledWidth > 0 && background.scaledHeight > 0) {
            const sourceWidth = background.image.naturalWidth || background.image.width;
            const sourceHeight = background.image.naturalHeight || background.image.height;
            const scaledWidth = background.scaledWidth;
            const scaledHeight = background.scaledHeight;
            const parallaxOffsetRaw = camera.x * (background.parallaxFactorX ?? 0.125);
            let offsetX = ((parallaxOffsetRaw % scaledWidth) + scaledWidth) % scaledWidth;
            let drawX = -offsetX;
            if (drawX > 0) {
                drawX -= scaledWidth;
            }
            for (; drawX < viewportWidth + scaledWidth; drawX += scaledWidth) {
                ctx.drawImage(
                    background.image,
                    0,
                    0,
                    sourceWidth,
                    sourceHeight,
                    drawX,
                    backgroundY,
                    scaledWidth,
                    scaledHeight
                );
            }
        } else {
            const gradient = ctx.createLinearGradient(0, 0, 0, viewportHeight);
            gradient.addColorStop(0, "#3c3c3c");
            gradient.addColorStop(1, "#1f1f1f");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, viewportWidth, viewportHeight);
        }

        ctx.restore();

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        if (
            terrain.baseImage &&
            terrain.tiles.length > 0 &&
            terrain.drawWidth > 0 &&
            terrain.drawHeight > 0
        ) {
            const baseSourceWidth = terrain.baseImage.naturalWidth || terrain.baseImage.width;
            const baseSourceHeight = terrain.baseImage.naturalHeight || terrain.baseImage.height;
            const decorSourceWidth =
                terrain.decorImage?.naturalWidth || terrain.decorImage?.width || 0;
            const decorSourceHeight =
                terrain.decorImage?.naturalHeight || terrain.decorImage?.height || 0;
            for (let index = 0; index < terrain.tiles.length; index += 1) {
                const tile = terrain.tiles[index];
                ctx.drawImage(
                    terrain.baseImage,
                    0,
                    0,
                    baseSourceWidth,
                    baseSourceHeight,
                    tile.x,
                    tile.y,
                    terrain.drawWidth,
                    terrain.drawHeight
                );
                if (terrain.decorImage) {
                    ctx.drawImage(
                        terrain.decorImage,
                        0,
                        0,
                        decorSourceWidth || baseSourceWidth,
                        decorSourceHeight || baseSourceHeight,
                        tile.x,
                        tile.y,
                        terrain.drawWidth,
                        terrain.drawHeight
                    );
                }
            }
        } else {
            ctx.fillStyle = "#5b5b5b";
            platforms.forEach((platform) => {
                ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
            });
        }

        // Coins
        coins.forEach((coin) => {
            if (coin.collected) {
                return;
            }

            const bobOffset =
                Math.sin(coin.bobTimer) *
                (coin.bobAmplitude ?? coinAnimation.bobAmplitude ?? 6);
            const centerX = coin.x + coin.width / 2;
            const centerY = (coin.baseY ?? coin.y) + bobOffset + coin.height / 2;
            const rotation = coin.rotation ?? 0;
            const horizontalScale = 0.3 + 0.7 * Math.abs(Math.cos(rotation));
            const radius = Math.min(coin.width, coin.height) / 2;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.scale(horizontalScale, 1);

            const gradient = ctx.createRadialGradient(
                -radius * 0.4,
                -radius * 0.4,
                radius * 0.2,
                0,
                0,
                radius
            );
            gradient.addColorStop(0, "#fff3a3");
            gradient.addColorStop(0.5, "#ffd24c");
            gradient.addColorStop(1, "#d38b00");

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();

            const borderScale = Math.max(horizontalScale, 0.01);
            ctx.lineWidth = 3 / borderScale;
            ctx.strokeStyle = "#b37400";
            ctx.stroke();

            ctx.beginPath();
            ctx.lineWidth = 2 / borderScale;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
            ctx.arc(-radius * 0.2, -radius * 0.15, radius * 0.6, -Math.PI / 2, Math.PI / 8);
            ctx.stroke();

            ctx.beginPath();
            ctx.lineWidth = 2.5 / borderScale;
            ctx.strokeStyle = "rgba(255, 190, 46, 0.5)";
            ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
            ctx.stroke();

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
                    const isDoubleJump = hero.jumpCount >= 1 && hero.jumpCount < hero.maxJumps;
                    inputState.jumpRequested = true;
                    if (hero.jumpCount < hero.maxJumps) {
                        triggerJumpVisualBoost(isDoubleJump);
                    }
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

    function bindStartChaseButton() {
        if (!startChaseButton) {
            return;
        }
        startChaseButton.addEventListener("click", () => {
            startChaseSequence();
        });
    }

    function navigateToMenu() {
        audio?.stopMusic();
        audio?.setRunningLoop(false);
        resetInputState();
        setGameOverState(false);
        setPrestartState(true);
        initializeWorldContent(true);
        if (document.fullscreenElement) {
            try {
                document.exitFullscreen?.();
            } catch (_) {
                // Ignore fullscreen exit errors.
            }
        }
        if (window.appNavigation && typeof window.appNavigation.go === "function") {
            window.appNavigation.go("menu");
        } else {
            window.location.href = "menu.html";
        }
    }

    function bindMenuButton() {
        if (!menuButton) {
            return;
        }

        menuButton.addEventListener("click", () => {
            audio?.playMenuClick();
            navigateToMenu();
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
                navigateToMenu();
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

        viewportWidth = displayWidth;
        viewportHeight = displayHeight;
        deviceScale = nextDpr;

        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        canvas.width = Math.round(displayWidth * nextDpr);
        canvas.height = Math.round(displayHeight * nextDpr);

        world.height = viewportHeight;
        const terrainChanged = updateTerrainMetrics();
        updateBackgroundMetrics();

        const desiredWorldWidth =
            terrain.totalWidth > 0 ? terrain.totalWidth : viewportWidth * 3;
        world.width = Math.max(desiredWorldWidth, viewportWidth * 3);

        updateFallThreshold();
        if (terrainChanged && worldInitialized) {
            initializeWorldContent(true);
        }
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

    window.gameView = {
        onShow() {
            setGameOverState(false);
            setPrestartState(true);
            resetInputState();
            initializeWorldContent(true);
            audio?.stopMusic();
            audio?.setRunningLoop(false);
            window.requestAnimationFrame(() => {
                handleResize();
                updateOrientationBlock();
            });
        },
        onHide() {
            audio?.stopMusic();
            audio?.setRunningLoop(false);
            resetInputState();
            setGameOverState(false);
            setPrestartState(true);
        },
    };

    bindStartChaseButton();
    setPrestartState(true);
    bindControlButtons();
    bindKeyboard();
    bindMenuButton();
    bindGameMenus();
    bindOrientationListeners();
    bindResizeObserver();
    init();
})();
