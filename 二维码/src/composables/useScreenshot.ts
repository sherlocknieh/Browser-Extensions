import ScreenShot from 'js-web-screen-shot';

export type ScreenshotResult =
    | { type: 'failed' }
    | { type: 'cancelled'; silent?: boolean }
    | { type: 'webRtcFailed' };

const getMessage = (key: Parameters<typeof browser.i18n.getMessage>[0], fallback: string) =>
    browser.i18n.getMessage(key) || fallback;

const MIN_VISIBLE_DURATION = 10_000;
let visibleSince = document.visibilityState === 'visible' ? Date.now() : undefined;

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        visibleSince = Date.now();
    } else {
        visibleSince = undefined;
    }
});

function hasBeenVisibleLongEnough() {
    return visibleSince !== undefined && Date.now() - visibleSince >= MIN_VISIBLE_DURATION;
}

function getWebRtcSupportResult(): ScreenshotResult | undefined {
    if (!window.isSecureContext) {
        return { type: 'failed' };
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
        return { type: 'failed' };
    }

    return undefined;
}

function waitForWebRtcSupport(): Promise<ScreenshotResult | undefined> {
    return Promise.resolve(getWebRtcSupportResult());
}

const FLOATING_MAX_WIDTH = 1200;
const FLOATING_MAX_HEIGHT = 800;
const FLOATING_VIEWPORT_WIDTH_RATIO = 0.9;
const FLOATING_VIEWPORT_HEIGHT_RATIO = 0.8;

const SCREENSHOT_STYLE_ID = 'qr-screenshot-window-style';
const SCREENSHOT_CLOSE_BUTTON_ID = 'qr-screenshot-close-button';
const SCREENSHOT_ELEMENT_SELECTOR =
    '#screenShotContainer, #toolPanel, #optionIcoController, #optionPanel, #cutBoxSizePanel, #textInputPanel, #qr-screenshot-close-button';
const SCREENSHOT_WINDOW_STYLES = (ready: boolean) => `
@keyframes qr-screenshot-window-enter {
    from {
        opacity: 0;
        filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0));
    }
    to {
        opacity: 1;
        filter: drop-shadow(0 20px 45px rgba(0, 0, 0, 0.42));
    }
}

${SCREENSHOT_ELEMENT_SELECTOR} {
    z-index: 2147483647 !important;
    visibility: ${ready ? 'visible' : 'hidden'} !important;
}

#screenShotContainer {
    border: 1px solid rgba(255, 255, 255, 0.7) !important;
    border-radius: 12px !important;
    box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.18),
        0 20px 45px rgba(0, 0, 0, 0.42) !important;
    animation: ${ready ? 'qr-screenshot-window-enter 220ms ease-out both' : 'none'};
}

${SCREENSHOT_ELEMENT_SELECTOR} {
    z-index: 2147483647 !important;
    border: 1px solid rgba(0, 0, 0, 0.18) !important;
    border-radius: 8px !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28) !important;
}

#${SCREENSHOT_CLOSE_BUTTON_ID} {
    position: absolute;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.72) !important;
    border-radius: 50% !important;
    background: rgba(25, 25, 25, 0.82);
    color: #fff;
    cursor: pointer;
    font: 22px/26px Arial, sans-serif;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35) !important;
    transition: background-color 120ms ease, transform 120ms ease;
}

#${SCREENSHOT_CLOSE_BUTTON_ID}:hover {
    background: #d93025;
    transform: scale(1.08);
}
`;

function getFloatingCanvasConfig() {
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    const maxWidth = Math.min(FLOATING_MAX_WIDTH, Math.floor(viewportWidth * FLOATING_VIEWPORT_WIDTH_RATIO));
    const maxHeight = Math.min(FLOATING_MAX_HEIGHT, Math.floor(viewportHeight * FLOATING_VIEWPORT_HEIGHT_RATIO));
    const scale = Math.min(maxWidth / viewportWidth, maxHeight / viewportHeight, 1);

    const canvasWidth = Math.max(1, Math.floor(viewportWidth * scale));
    const canvasHeight = Math.max(1, Math.floor(viewportHeight * scale));

    return {
        canvasWidth,
        canvasHeight,
        position: {
            left: Math.floor(window.scrollX + (viewportWidth - canvasWidth) / 2),
            top: Math.floor(window.scrollY + (viewportHeight - canvasHeight) / 2),
        },
    };
}

function installScreenshotStyles() {
    const existingStyle = document.getElementById(SCREENSHOT_STYLE_ID);
    existingStyle?.remove();

    const style = document.createElement('style');
    style.id = SCREENSHOT_STYLE_ID;
    style.textContent = SCREENSHOT_WINDOW_STYLES(false);
    document.head.appendChild(style);

    return {
        show: () => {
            style.textContent = SCREENSHOT_WINDOW_STYLES(true);
        },
        remove: () => style.remove(),
    };
}

export function useScreenshot() {
    const startScreenshot = async () => {
        const pageReadyAtStart = document.readyState === 'complete';
        if (!pageReadyAtStart || !hasBeenVisibleLongEnough()) {
            return Promise.reject({
                type: 'webRtcFailed',
            } satisfies ScreenshotResult);
        }

        const webRtcResult = await waitForWebRtcSupport();
        if (webRtcResult) {
            return Promise.reject(webRtcResult);
        }

        return new Promise<string>((resolve, reject) => {
            const { canvasWidth, canvasHeight, position } = getFloatingCanvasConfig();
            const screenshotStyles = installScreenshotStyles();
            let cleanedUp = false;
            let screenshot: ScreenShot | undefined;
            let outsideClick: ((event: PointerEvent) => void) | undefined;
            let closeButton: HTMLButtonElement | undefined;
            let silentlyClosing = false;
            let captureStarted = false;
            let visibilityInterrupted = document.visibilityState !== 'visible';
            const handleVisibilityChange = () => {
                if (document.visibilityState !== 'visible') {
                    visibilityInterrupted = true;
                }
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);

            const cleanup = () => {
                if (cleanedUp) {
                    return;
                }
                cleanedUp = true;
                if (outsideClick) {
                    document.removeEventListener('pointerdown', outsideClick, true);
                    outsideClick = undefined;
                }
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                closeButton?.remove();
                document.getElementById(SCREENSHOT_CLOSE_BUTTON_ID)?.remove();
                closeButton = undefined;
                screenshotStyles.remove();
            };

            const startScreenshotCapture = () => {
                screenshot = new ScreenShot({
                canvasWidth,
                canvasHeight,
                position,
                level: 2147483647,
                showScreenData: true,
                    completeCallback: ({ base64 }) => {
                        resolve(base64);
                    },
                    closeCallback: () => {
                        cleanup();
                    },
                    triggerCallback: (response) => {
                    if (response.code === 0) {
                        captureStarted = true;
                        screenshotStyles.show();
                        const cancelFromOutside = () => {
                            cleanup();
                            screenshot?.destroyComponents();
                            reject({ type: 'cancelled', silent: true } satisfies ScreenshotResult);
                        };
                        const closeSilently = () => {
                            silentlyClosing = true;
                            cleanup();
                            reject({ type: 'cancelled', silent: true } satisfies ScreenshotResult);
                            screenshot?.destroyComponents();
                        };
                        closeButton = document.createElement('button');
                        closeButton.id = SCREENSHOT_CLOSE_BUTTON_ID;
                        closeButton.type = 'button';
                        closeButton.textContent = '×';
                        closeButton.setAttribute('aria-label', getMessage('screenshotCancelled', 'Close screenshot'));
                        closeButton.style.left = `${position.left + canvasWidth - 42}px`;
                        closeButton.style.top = `${position.top + 10}px`;
                        closeButton.addEventListener('pointerdown', (event) => {
                            event.stopPropagation();
                        });
                        closeButton.addEventListener('click', closeSilently);
                        document.body.appendChild(closeButton);
                        outsideClick = (event) => {
                            const target = event.target;
                            if (target instanceof Element && target.closest(SCREENSHOT_ELEMENT_SELECTOR)) {
                                return;
                            }
                            cancelFromOutside();
                        };
                        document.addEventListener('pointerdown', outsideClick, true);
                        return;
                    }
                        if (response.code !== 0) {
                            const pageReady = pageReadyAtStart && document.readyState === 'complete';
                            cleanup();
                            reject(
                                pageReady && !visibilityInterrupted
                                    ? ({ type: 'failed' } satisfies ScreenshotResult)
                                    : ({ type: 'webRtcFailed' } satisfies ScreenshotResult),
                            );
                        }
                    },
                    cancelCallback: () => {
                        if (silentlyClosing) {
                            return;
                        }
                        const pageReady = pageReadyAtStart && document.readyState === 'complete';
                        if (!captureStarted) {
                            cleanup();
                            reject(
                                pageReady && !visibilityInterrupted
                                    ? ({ type: 'failed' } satisfies ScreenshotResult)
                                    : ({ type: 'webRtcFailed' } satisfies ScreenshotResult),
                            );
                            return;
                        }
                        cleanup();
                        reject(
                            pageReady && !visibilityInterrupted
                                ? ({ type: 'cancelled' } satisfies ScreenshotResult)
                                : ({ type: 'webRtcFailed' } satisfies ScreenshotResult),
                        );
                    },
                });
            };

            startScreenshotCapture();
        });
    };

    return { startScreenshot };
}
