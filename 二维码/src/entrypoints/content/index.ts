import { createContentUi } from './ui';

export default defineContentScript({
    matches: ['<all_urls>'],
    matchAboutBlank: true,
    cssInjectionMode: 'ui',
    async main(ctx) {
        const ui = await createContentUi(ctx);
        ui.mount();
    },
});
