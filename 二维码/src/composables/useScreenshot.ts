import ScreenShot from 'js-web-screen-shot';

type ScreenshotError = {
    type: 'warning' | 'error';
    message: string;
};

export function useScreenshot() {
    const startScreenshot = () => {
        return new Promise<string>((resolve, reject) => {
            // eslint-disable-next-line no-new
            new ScreenShot({
                enableWebRtc: true,
                completeCallback: ({ base64 }) => resolve(base64),
                closeCallback: () => {
                    // Close callback has no error info, keep silent.
                },
                triggerCallback: (response) => {
                    if (response.code !== 0) {
                        reject({ type: 'warning', message: response.msg || 'Screenshot failed.' } as ScreenshotError);
                    }
                },
                cancelCallback: (response) => {
                    reject({ type: 'error', message: response.msg || 'Screenshot cancelled.' } as ScreenshotError);
                },
            });
        });
    };

    return { startScreenshot };
}
