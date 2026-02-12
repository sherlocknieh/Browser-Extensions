import { createApp } from 'vue';
import App from './App.vue';
import { ContentScriptContext } from 'wxt/utils/content-script-context';

export async function createContentUi(ctx: ContentScriptContext) {
    const ui = await createShadowRootUi(ctx, {
        name: 'wxt-vue-ui',
        anchor: 'body',
        append: 'last',
        position: 'overlay',
        onMount: (container) => {
            // container.classList.add('my-extension-root');
            // Object.assign(container.style, {
            //     position: 'fixed',
            //     bottom: '20px',
            //     right: '20px',
            //     zIndex: '2147483647',
            // });
            const app = createApp(App);
            app.provide('shadowRootContainer', container);
            app.mount(container);
            return app;
        },
        onRemove: (app) => {
            app?.unmount();
        },
    });
    return ui;
}
