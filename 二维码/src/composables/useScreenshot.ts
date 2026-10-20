import ScreenShot from 'js-web-screen-shot';

type ScreenshotError = {
    type: 'warning' | 'error';
    message: string;
};

const getMessage = (key: Parameters<typeof browser.i18n.getMessage>[0], fallback: string) =>
    browser.i18n.getMessage(key) || fallback;

const FLOATING_MAX_WIDTH = 1200;
const FLOATING_MAX_HEIGHT = 800;
const FLOATING_VIEWPORT_WIDTH_RATIO = 0.9;
const FLOATING_VIEWPORT_HEIGHT_RATIO = 0.8;

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

export function useScreenshot() {
    const startScreenshot = () => {
        return new Promise<string>((resolve, reject) => {
            const { canvasWidth, canvasHeight, position } = getFloatingCanvasConfig();

            // eslint-disable-next-line no-new
            new ScreenShot({
                enableWebRtc: true,
                canvasWidth,
                canvasHeight,
                position,
                level: 2147483647,
                showScreenData: true,
                completeCallback: ({ base64 }) => resolve(base64),
                closeCallback: () => {
                    // Close callback has no error info, keep silent.
                },
                triggerCallback: (response) => {
                    if (response.code !== 0) {
                        reject({
                            type: 'warning',
                            message: response.msg || getMessage('screenshotFailed', 'Screenshot failed.'),
                        } as ScreenshotError);
                    }
                },
                cancelCallback: (response) => {
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
