(() => {
    const root = document.documentElement;
    const frame = document.getElementById("appFrame");
    const DEFAULT_PAGE = "menu";
    const ALLOWED_PAGES = new Set(["menu", "intro", "play"]);

    function resolveInitialPage() {
        if (!frame) {
            return `${DEFAULT_PAGE}.html`;
        }
        let page = DEFAULT_PAGE;

        try {
            const url = new URL(window.location.href);
            const requestedPage = (url.searchParams.get("page") || "").toLowerCase();

            if (requestedPage && ALLOWED_PAGES.has(requestedPage)) {
                page = requestedPage;
            }
        } catch (_) {
            // Ignore malformed URL scenarios.
        }

        return `${page}.html`;
    }

    function updateViewportHeight() {
        const height = Math.max(window.innerHeight || 0, 0);
        if (height > 0) {
            root.style.setProperty("--app-viewport-height", `${height}px`);
        }
    }

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    window.addEventListener("pageshow", updateViewportHeight);

    if (frame) {
        const initialSrc = resolveInitialPage();
        if (frame.getAttribute("src") !== initialSrc) {
            frame.setAttribute("src", initialSrc);
        }
        frame.setAttribute("allowtransparency", "true");
    }
})();
