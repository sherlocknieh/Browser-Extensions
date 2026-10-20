import ScreenShot from 'js-web-screen-shot';

type ScreenshotError = {
    type: 'warning' | 'error';
    message: string;
    silent?: boolean;
};

const getMessage = (key: Parameters<typeof browser.i18n.getMessage>[0], fallback: string) =>
    browser.i18n.getMessage(key) || fallback;

const FLOATING_MAX_WIDTH = 1200;
const FLOATING_MAX_HEIGHT = 800;
const FLOATING_VIEWPORT_WIDTH_RATIO = 0.9;
const FLOATING_VIEWPORT_HEIGHT_RATIO = 0.8;

const SCREENSHOT_STYLE_ID = 'qr-screenshot-window-style';
const SCREENSHOT_ELEMENT_SELECTOR =
    '#screenShotContainer, #toolPanel, #optionIcoController, #optionPanel, #cutBoxSizePanel, #textInputPanel';
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
    const startScreenshot = () => {
        return new Promise<string>((resolve, reject) => {
            const { canvasWidth, canvasHeight, position } = getFloatingCanvasConfig();
            const screenshotStyles = installScreenshotStyles();
            let cleanedUp = false;
            let screenshot: ScreenShot | undefined;
            let outsideClick: ((event: PointerEvent) => void) | undefined;

            const cleanup = () => {
                if (cleanedUp) {
                    return;
                }
                cleanedUp = true;
                if (outsideClick) {
                    document.removeEventListener('pointerdown', outsideClick, true);
                    outsideClick = undefined;
                }
                screenshotStyles.remove();
            };

            // eslint-disable-next-line no-new
            screenshot = new ScreenShot({
                enableWebRtc: true,
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
                        screenshotStyles.show();
                        const cancelFromOutside = () => {
                            screenshot?.destroyComponents();
                            cleanup();
                            reject({
                                type: 'error',
                                message: '',
                                silent: true,
                            } as ScreenshotError);
                        };
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
                        cleanup();
                        reject({
                            type: 'warning',
                            message: response.msg || getMessage('screenshotFailed', 'Screenshot failed.'),
                        } as ScreenshotError);
                    }
                },
                cancelCallback: (response) => {
                    cleanup();
                    reject({
                        type: 'error',
                        message: response.msg || getMessage('screenshotCancelled', 'Screenshot cancelled.'),
                    } as ScreenshotError);
                },
            });
        });
    };

    return { startScreenshot };
}
