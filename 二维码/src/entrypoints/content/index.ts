import { createApp } from 'vue';
import App from './App.vue';

// WXT 规定的内容脚本入口
export default defineContentScript({
    matches: ['<all_urls>'],    // [必填项] 匹配所有网址
    matchAboutBlank: true,      // 允许匹配 about:blank 页面
    cssInjectionMode: 'manifest',     // CSS 注入到 manifest 中

    // 内容脚本的主函数，接收一个上下文对象 ctx
    // ctx 负责自动管理组件的生命周期
    main(ctx) {
        // 创建并挂载 UI 组件
        const ui = createIntegratedUi(ctx, {
            anchor: 'body',     // <wxt-vue-ui> 元素将被挂载到 <body> 上
            append: 'last',     // <wxt-vue-ui> 将被添加到 <body> 的末尾
            position: 'overlay',// 挂载模式（overlay=脱离文档流，inline=嵌入文档流, modal=带覆盖层的弹窗）
            onMount: (container) => {
                const app = createApp(App);
                app.mount(container);
                return app;
            },
            onRemove: (app) => {
                app?.unmount();
            },
        });
        ui.mount(); // 执行挂载，<wxt-vue-ui> 元素会被添加到页面中，并触发 onMount 回调
    },
});
