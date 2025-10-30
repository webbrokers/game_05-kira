(() => {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const stage = document.getElementById("gameStage");

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

    const hero = {
        x: 120,
        y: world.height - floorOffset - 118,
        width: 62,
        standHeight: 118,
        crouchHeight: 78,
        height: 118,
        vx: 0,
        vy: 0,
        speed: 220,
        crouchSpeed: 120,
        jumpVelocity: -520,
        gravity: 1500,
        facing: 1,
        isGrounded: true,
        isCrouching: false,
        animFrame: 0,
        animTimer: 0,
        animFrameDuration: 0.055,
    };

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
                requestAnimationFrame(loop);
            })
            .catch((err) => {
                console.error("Не удалось загрузить спрайты героя", err);
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

    function addCoinForPlatform(platform) {
        const coin = {
            x: platform.x + platform.width / 2 - coinSize / 2,
            y: platform.y - coinSize - coinPadding,
            size: coinSize,
            collected: false,
        };

        coins.push(coin);
    }

    function addPlatform(x, y, width, height) {
        const platform = { x, y, width, height };
        platforms.push(platform);
        addCoinForPlatform(platform);
        return platform;
    }

    function initializeWorldContent() {
        const random = createRandomGenerator(worldSeed);
        platforms.length = 0;
        coins.length = 0;

        const groundY = world.height - floorOffset;
        const primaryPlatformY = groundY - 120;
        const secondPlatformY = clamp(primaryPlatformY - 100, groundY - 220, groundY - 100);

        let lastPlatform = addPlatform(80, primaryPlatformY, 320, 24);
        lastPlatform = addPlatform(520, secondPlatformY, 280, 24);

        const maxAdditionalPlatforms = 6;
        for (let index = 0; index < maxAdditionalPlatforms; index += 1) {
            const gap = 120 + random() * 60;
            const width = 220 + random() * 120;
            const heightOffset = (random() - 0.5) * 160;

            const nextX = lastPlatform.x + lastPlatform.width + gap;
            if (nextX + width > world.width - 120) {
                break;
            }

            const minPlatformY = groundY - 240;
            const maxPlatformY = groundY - 80;
            const targetY = clamp(lastPlatform.y + heightOffset, minPlatformY, maxPlatformY);
            lastPlatform = addPlatform(nextX, targetY, width, 24);
        }

        hero.x = clamp(hero.x, 0, Math.max(0, world.width - hero.width));
        const heroGroundY = groundY - hero.height;
        hero.y = Math.min(hero.y, heroGroundY);
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
        handleInput();

        // Horizontal movement
        const targetSpeed = hero.isCrouching ? hero.crouchSpeed : hero.speed;
        hero.vx = 0;
        if (inputState.left) {
            hero.vx = -targetSpeed;
            hero.facing = -1;
        } else if (inputState.right) {
            hero.vx = targetSpeed;
            hero.facing = 1;
        }

        // Apply gravity
        hero.vy += hero.gravity * delta;

        let nextX = hero.x + hero.vx * delta;
        let nextY = hero.y + hero.vy * delta;
        hero.isGrounded = false;

        // Platform collisions
        platforms.forEach((platform) => {
            const overlapsHorizontally =
                nextX < platform.x + platform.width &&
                nextX + hero.width > platform.x;

            const heroPrevBottom = hero.y + hero.height;
            const heroNextBottom = nextY + hero.height;

            if (overlapsHorizontally) {
                // Landing on top
                if (
                    heroPrevBottom <= platform.y &&
                    heroNextBottom >= platform.y
                ) {
                    nextY = platform.y - hero.height;
                    hero.vy = 0;
                    hero.isGrounded = true;
                }

                // Prevent going up through the platform
                if (
                    hero.y >= platform.y + platform.height &&
                    nextY <= platform.y + platform.height
                ) {
                    nextY = platform.y + platform.height;
                    hero.vy = Math.max(hero.vy, 0);
                }
            }
        });

        const floorY = world.height - floorOffset;

        // Floor collision
        if (nextY + hero.height >= floorY) {
            nextY = floorY - hero.height;
            hero.vy = 0;
            hero.isGrounded = true;
        }

        hero.x = nextX;
        hero.y = nextY;

        // Keep inside stage
        if (hero.x < 0) hero.x = 0;
        const maxHeroX = Math.max(0, world.width - hero.width);
        if (hero.x > maxHeroX) {
            hero.x = maxHeroX;
        }

        // Manage crouch height transitions
        const targetHeight = hero.isCrouching ? hero.crouchHeight : hero.standHeight;
        if (hero.height !== targetHeight) {
            const bottom = hero.y + hero.height;
            hero.height = targetHeight;
            hero.y = bottom - hero.height;
            if (hero.y + hero.height > floorY) {
                hero.y = floorY - hero.height;
            }
        }

        updateCoins();
        updateCamera();
        updateAnimation(delta);
        inputState.jumpRequested = false;
    }

    function updateCoins() {
        const heroRight = hero.x + hero.width;
        const heroBottom = hero.y + hero.height;

        coins.forEach((coin) => {
            if (coin.collected) {
                return;
            }

            const coinRight = coin.x + coin.size;
            const coinBottom = coin.y + coin.size;

            const isOverlapping =
                hero.x < coinRight &&
                heroRight > coin.x &&
                hero.y < coinBottom &&
                heroBottom > coin.y;

            if (isOverlapping) {
                coin.collected = true;
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
        if (inputState.jumpRequested && hero.isGrounded) {
            hero.vy = hero.jumpVelocity;
            hero.isGrounded = false;
        }

        hero.isCrouching = inputState.crouch && hero.isGrounded;
    }

    function updateAnimation(delta) {
        const moving = Math.abs(hero.vx) > 1;
        const shouldRun = moving && hero.isGrounded && !hero.isCrouching;

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
        const groundY = world.height - floorOffset - hero.height;
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

            const centerX = coin.x + coin.size / 2;
            const centerY = coin.y + coin.size / 2;

            ctx.beginPath();
            ctx.arc(centerX, centerY, coin.size / 2, 0, Math.PI * 2);
            ctx.fillStyle = "#ffd84d";
            ctx.fill();
            ctx.strokeStyle = "#f7c531";
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Hero
        const frame = heroFrames[hero.animFrame];
        if (frame) {
            const drawHeight = hero.height * 1.15;
            const drawWidth =
                drawHeight * (frame.naturalWidth / frame.naturalHeight || 0.8);
            const drawX = hero.x + hero.width / 2 - drawWidth / 2;
            const drawY = hero.y + hero.height - drawHeight;

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
        } else {
            // Placeholder rectangle if frames not ready
            ctx.fillStyle = "#ff7373";
            ctx.fillRect(hero.x, hero.y, hero.width, hero.height);
        }

        ctx.restore();
    }

    function setInputState(action, isActive) {
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

    function toggleFullscreen(shouldEnter) {
        if (shouldEnter) {
            if (!document.fullscreenElement) {
                if (stage.requestFullscreen) {
                    stage.requestFullscreen();
                }
            }
        } else if (document.fullscreenElement) {
            document.exitFullscreen?.();
        }
    }

    function bindFullscreenButtons() {
        document.querySelector('[data-action="enter-fullscreen"]').addEventListener("click", () => {
            toggleFullscreen(true);
        });
        document.querySelector('[data-action="exit-fullscreen"]').addEventListener("click", () => {
            toggleFullscreen(false);
        });
    }

    function rescaleWorld(scaleX, scaleY) {
        if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
            return;
        }

        const normalizedScaleX = Math.abs(scaleX - 1) < 0.001 ? 1 : scaleX;
        const normalizedScaleY = Math.abs(scaleY - 1) < 0.001 ? 1 : scaleY;

        if (normalizedScaleX === 1 && normalizedScaleY === 1) {
            return;
        }

        hero.x *= normalizedScaleX;
        hero.y *= normalizedScaleY;
        hero.width *= normalizedScaleX;
        hero.height *= normalizedScaleY;
        hero.standHeight *= normalizedScaleY;
        hero.crouchHeight *= normalizedScaleY;
        hero.vx *= normalizedScaleX;
        hero.vy *= normalizedScaleY;
        hero.speed *= normalizedScaleX;
        hero.crouchSpeed *= normalizedScaleX;
        hero.jumpVelocity *= normalizedScaleY;
        hero.gravity *= normalizedScaleY;

        world.width *= normalizedScaleX;
        world.height *= normalizedScaleY;
        camera.x *= normalizedScaleX;
        camera.y *= normalizedScaleY;

        platforms.forEach((platform) => {
            platform.x *= normalizedScaleX;
            platform.y *= normalizedScaleY;
            platform.width *= normalizedScaleX;
            platform.height *= normalizedScaleY;
        });

        coins.forEach((coin) => {
            coin.x *= normalizedScaleX;
            coin.y *= normalizedScaleY;
            coin.size *= (normalizedScaleX + normalizedScaleY) / 2;
        });
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

        const scaleX = displayWidth / previousWidth;
        const scaleY = displayHeight / previousHeight;

        rescaleWorld(scaleX, scaleY);

        world.width = Math.max(world.width, viewportWidth * 3);
        world.height = Math.max(world.height, viewportHeight);
        initializeWorldContent();
        updateCamera();
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
    bindFullscreenButtons();
    bindResizeObserver();
    init();
})();
