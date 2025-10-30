(() => {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const stage = document.getElementById("gameStage");

    const heroFrameSources = Array.from({ length: 11 }, (_, index) => {
        const frameIndex = String(index + 1).padStart(2, "0");
        return `img-hero/run/run_${frameIndex}.png`;
    });

    const heroFrames = [];
    const hero = {
        x: 120,
        y: 180,
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
        isGrounded: false,
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
    const floorOffset = 40;
    let viewportWidth = canvas.width;
    let viewportHeight = canvas.height;
    let deviceScale = window.devicePixelRatio || 1;
    const platforms = [
        { x: 80, y: viewportHeight - floorOffset - 120, width: 320, height: 24 },
        { x: 520, y: viewportHeight - floorOffset - 220, width: 280, height: 24 },
    ];

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
        Promise.all(heroFrameSources.map(loadImage))
            .then((frames) => {
                heroFrames.push(...frames);
                requestAnimationFrame(loop);
            })
            .catch((err) => {
                console.error("Не удалось загрузить спрайты героя", err);
            });
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

        const floorY = viewportHeight - floorOffset;

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
        if (hero.x + hero.width > viewportWidth) {
            hero.x = viewportWidth - hero.width;
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

        updateAnimation(delta);
        inputState.jumpRequested = false;
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

        // Background
        const gradient = ctx.createLinearGradient(0, 0, 0, viewportHeight);
        gradient.addColorStop(0, "#3c3c3c");
        gradient.addColorStop(1, "#1f1f1f");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, viewportWidth, viewportHeight);

        // Platforms
        ctx.fillStyle = "#5b5b5b";
        platforms.forEach((platform) => {
            ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
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

        platforms.forEach((platform) => {
            platform.x *= normalizedScaleX;
            platform.y *= normalizedScaleY;
            platform.width *= normalizedScaleX;
            platform.height *= normalizedScaleY;
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
