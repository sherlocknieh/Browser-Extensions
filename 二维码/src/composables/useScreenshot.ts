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
const SCREENSHOT_SIZE_PANEL_SELECTOR = '#cutBoxSizePanel';
const SCREENSHOT_TOOL_SELECTOR =
    '#toolPanel, #optionIcoController, #optionPanel, #cutBoxSizePanel';
const SCREENSHOT_ELEMENT_SELECTOR =
    `#screenShotContainer, #toolPanel, #optionIcoController, #optionPanel, ${SCREENSHOT_SIZE_PANEL_SELECTOR}, #textInputPanel, #qr-screenshot-close-button`;
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
    position: fixed !important;
    border: 1px solid rgba(255, 255, 255, 0.7) !important;
    border-radius: 12px !important;
    box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.18),
        0 20px 45px rgba(0, 0, 0, 0.42) !important;
    animation: ${ready ? 'qr-screenshot-window-enter 220ms ease-out both' : 'none'};
}

${SCREENSHOT_TOOL_SELECTOR} {
    position: fixed !important;
    zoom: var(--qr-screenshot-ui-scale, 1);
}

#${SCREENSHOT_CLOSE_BUTTON_ID} {
    position: fixed;
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
        scale,
        position: {
            left: Math.floor((viewportWidth - canvasWidth) / 2),
            top: Math.floor((viewportHeight - canvasHeight) / 2),
        },
    };
}

function installScreenshotStyles(scale: number) {
    const existingStyle = document.getElementById(SCREENSHOT_STYLE_ID);
    existingStyle?.remove();

    const style = document.createElement('style');
    style.id = SCREENSHOT_STYLE_ID;
    style.textContent = SCREENSHOT_WINDOW_STYLES(false);
    document.head.appendChild(style);
    document.documentElement.style.setProperty('--qr-screenshot-ui-scale', String(scale));

    return {
        show: () => {
            style.textContent = SCREENSHOT_WINDOW_STYLES(true);
        },
        remove: () => {
            style.remove();
            document.documentElement.style.removeProperty('--qr-screenshot-ui-scale');
        },
    };
}

export function useScreenshot() {
    const startScreenshot = async () => {
        const webRtcResult = await waitForWebRtcSupport();
        if (webRtcResult) {
            return Promise.reject(webRtcResult);
        }

        return new Promise<string>((resolve, reject) => {
            const { canvasWidth, canvasHeight, scale, position } = getFloatingCanvasConfig();
            const screenshotStyles = installScreenshotStyles(scale);
            let cleanedUp = false;
            let screenshot: ScreenShot | undefined;
            let outsideClick: ((event: PointerEvent) => void) | undefined;
            let closeButton: HTMLButtonElement | undefined;
            let silentlyClosing = false;
            let captureStarted = false;
            let resizeFrame: number | undefined;
            let positionedElements: HTMLElement[] = [];
            let selectionInteractionEnd: (() => void) | undefined;
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
                window.removeEventListener('resize', handleResize);
                if (resizeFrame !== undefined) {
                    window.cancelAnimationFrame(resizeFrame);
                    resizeFrame = undefined;
                }
                if (outsideClick) {
                    document.removeEventListener('pointerdown', outsideClick, true);
                    outsideClick = undefined;
                }
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                if (selectionInteractionEnd) {
                    document.removeEventListener('mouseup', selectionInteractionEnd, true);
                    selectionInteractionEnd = undefined;
                }
                closeButton?.remove();
                document.getElementById(SCREENSHOT_CLOSE_BUTTON_ID)?.remove();
                positionedElements = [];
                closeButton = undefined;
                screenshotStyles.remove();
            };

            const clamp = (value: number, min: number, max: number) =>
                Math.min(Math.max(value, min), Math.max(min, max));

            // 浮层使用了 CSS zoom，left/top 也会被按比例缩放，需要换算回 zoom 前的坐标
            const setFloatingPosition = (element: HTMLElement, left: number, top: number) => {
                const factor = element.matches(SCREENSHOT_TOOL_SELECTOR) ? scale : 1;
                element.style.left = `${Math.round(left / factor)}px`;
                element.style.top = `${Math.round(top / factor)}px`;
            };

            const updateFloatingPanelPositions = () => {
                if (!screenshot) {
                    return;
                }
                const container = document.getElementById('screenShotContainer');
                if (!(container instanceof HTMLElement)) {
                    return;
                }

                const cutBox = screenshot.getCutBoxInfo();
                if (cutBox.width <= 0 || cutBox.height <= 0) {
                    return;
                }

                const containerRect = container.getBoundingClientRect();
                // clientLeft/clientTop 抵消截图窗口的 1px 边框
                const selectionLeft = containerRect.left + container.clientLeft + cutBox.startX;
                const selectionTop = containerRect.top + container.clientTop + cutBox.startY;
                const selectionBottom = selectionTop + cutBox.height;
                const viewportWidth = Math.max(window.innerWidth, 1);
                const viewportHeight = Math.max(window.innerHeight, 1);

                const toolbar = document.getElementById('toolPanel');
                if (toolbar instanceof HTMLElement) {
                    const toolbarRect = toolbar.getBoundingClientRect();
                    const belowTop = selectionBottom + 8;
                    const aboveTop = selectionTop - toolbarRect.height - 8;
                    const left = clamp(
                        selectionLeft + (cutBox.width - toolbarRect.width) / 2,
                        0,
                        viewportWidth - toolbarRect.width,
                    );
                    const top =
                        belowTop + toolbarRect.height <= viewportHeight ? belowTop : aboveTop;
                    setFloatingPosition(toolbar, left, Math.max(0, top));
                }

                const sizePanel = document.querySelector<HTMLElement>(
                    SCREENSHOT_SIZE_PANEL_SELECTOR,
                );
                if (sizePanel instanceof HTMLElement) {
                    const sizePanelRect = sizePanel.getBoundingClientRect();
                    const preferredTop = selectionTop - sizePanelRect.height - 10;
                    const top = preferredTop >= 0 ? preferredTop : selectionTop + 8;
                    const left = clamp(selectionLeft, 0, viewportWidth - sizePanelRect.width);
                    setFloatingPosition(sizePanel, left, top);
                }
            };

            const updateScreenshotPosition = () => {
                const container = document.getElementById('screenShotContainer');
                if (!(container instanceof HTMLElement)) {
                    return;
                }

                const containerRect = container.getBoundingClientRect();
                const viewportWidth = Math.max(window.innerWidth, 1);
                const viewportHeight = Math.max(window.innerHeight, 1);
                const offsetX = Math.max(0, (viewportWidth - containerRect.width) / 2);
                const offsetY = Math.max(0, (viewportHeight - containerRect.height) / 2);
                const left = Math.floor(offsetX);
                const top = Math.floor(offsetY);
                const deltaX = left - containerRect.left;
                const deltaY = top - containerRect.top;

                if (deltaX !== 0 || deltaY !== 0) {
                    container.style.left = `${left}px`;
                    container.style.top = `${top}px`;
                    positionedElements.forEach((element) => {
                        if (element === container) {
                            return;
                        }
                        const elementRect = element.getBoundingClientRect();
                        setFloatingPosition(
                            element,
                            elementRect.left + deltaX,
                            elementRect.top + deltaY,
                        );
                    });
                }
                updateFloatingPanelPositions();
            };

            const scheduleFloatingPanelUpdate = () => {
                window.requestAnimationFrame(updateFloatingPanelPositions);
            };

            const collectPositionedElements = () => {
                const allElements = Array.from(
                    document.querySelectorAll<HTMLElement>(SCREENSHOT_ELEMENT_SELECTOR),
                );
                positionedElements = allElements.filter(
                    (element) =>
                        !element.matches(SCREENSHOT_SIZE_PANEL_SELECTOR) &&
                        !allElements.some((parent) => parent !== element && parent.contains(element)),
                );
            };

            const handleResize = () => {
                if (resizeFrame !== undefined) {
                    return;
                }
                resizeFrame = window.requestAnimationFrame(() => {
                    resizeFrame = undefined;
                    updateScreenshotPosition();
                });
            };

            const startScreenshotCapture = () => {
                try {
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
                                window.addEventListener('resize', handleResize);
                                const cancelFromOutside = () => {
                                    cleanup();
                                    screenshot?.destroyComponents();
                                    reject({
                                        type: 'cancelled',
                                        silent: true,
                                    } satisfies ScreenshotResult);
                                };
                                const closeSilently = () => {
                                    silentlyClosing = true;
                                    cleanup();
                                    reject({
                                        type: 'cancelled',
                                        silent: true,
                                    } satisfies ScreenshotResult);
                                    screenshot?.destroyComponents();
                                };
                                closeButton = document.createElement('button');
                                closeButton.id = SCREENSHOT_CLOSE_BUTTON_ID;
                                closeButton.type = 'button';
                                closeButton.textContent = '×';
                                closeButton.setAttribute(
                                    'aria-label',
                                    getMessage('screenshotCancelled', 'Close screenshot'),
                                );
                                closeButton.style.left = `${position.left + canvasWidth - 42}px`;
                                closeButton.style.top = `${position.top + 10}px`;
                                closeButton.addEventListener('pointerdown', (event) => {
                                    event.stopPropagation();
                                });
                                closeButton.addEventListener('click', closeSilently);
                                document.body.appendChild(closeButton);
                                collectPositionedElements();
                                selectionInteractionEnd = scheduleFloatingPanelUpdate;
                                document.addEventListener(
                                    'mouseup',
                                    selectionInteractionEnd,
                                    true,
                                );
                                updateScreenshotPosition();
                                outsideClick = (event) => {
                                    const target = event.target;
                                    if (
                                        target instanceof Element &&
                                        target.closest(SCREENSHOT_ELEMENT_SELECTOR)
                                    ) {
                                        return;
                                    }
                                    cancelFromOutside();
                                };
                                document.addEventListener('pointerdown', outsideClick, true);
                                return;
                            }

                            const pageReady = document.readyState === 'complete';
                            cleanup();
                            reject(
                                pageReady && !visibilityInterrupted && hasBeenVisibleLongEnough()
                                    ? ({ type: 'failed' } satisfies ScreenshotResult)
                                    : ({ type: 'webRtcFailed' } satisfies ScreenshotResult),
                            );
                        },
                        cancelCallback: () => {
                            if (silentlyClosing) {
                                return;
                            }
                            const pageReady = document.readyState === 'complete';
                            if (!captureStarted) {
                                cleanup();
                                reject(
                                    pageReady &&
                                        !visibilityInterrupted &&
                                        hasBeenVisibleLongEnough()
                                        ? ({ type: 'failed' } satisfies ScreenshotResult)
                                        : ({ type: 'webRtcFailed' } satisfies ScreenshotResult),
                                );
                                return;
                            }
                            cleanup();
                            reject(
                                pageReady && !visibilityInterrupted && hasBeenVisibleLongEnough()
                                    ? ({ type: 'cancelled' } satisfies ScreenshotResult)
                                    : ({ type: 'webRtcFailed' } satisfies ScreenshotResult),
                            );
                        },
                    });
                } catch (error) {
                    cleanup();
                    reject(error);
                }
            };

            startScreenshotCapture();
        });
    };

    return { startScreenshot };
}
