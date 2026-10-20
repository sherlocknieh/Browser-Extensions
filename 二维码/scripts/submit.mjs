#!/usr/bin/env node
// 跨平台提交脚本：清理旧包 -> 构建 ZIP -> 提交到商店
// 用法: node scripts/submit.mjs [chrome|edge|firefox|all] [--dry-run ...]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputDir = join(root, '.output');
const wxtBin = join(root, 'node_modules', 'wxt', 'bin', 'wxt.mjs');

const STORES = ['chrome', 'edge', 'firefox'];
const argv = process.argv.slice(2);
const target = STORES.includes(argv[0]) || argv[0] === 'all' ? argv.shift() : 'all';
const extraArgs = argv; // 透传参数，如 --dry-run
const stores = target === 'all' ? STORES : [target];

const run = (args) => {
  const result = spawnSync(process.execPath, [wxtBin, ...args], {
    cwd: root,
    stdio: 'inherit',
    // Node 原生 fetch 默认不读 https_proxy，设为 1 才能连上商店 API
    env: { ...process.env, NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY ?? '1' },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// 1. 清理旧包，避免通配符/版本混杂
if (existsSync(outputDir)) {
  const old = readdirSync(outputDir).filter((file) => file.endsWith('.zip'));
  for (const file of old) unlinkSync(join(outputDir, file));
  if (old.length) console.log(`[submit] 已清理 ${old.length} 个旧 ZIP`);
}

// 2. 构建 ZIP
if (stores.includes('chrome') || stores.includes('edge')) run(['zip']);
if (stores.includes('firefox')) run(['zip', '-b', 'firefox', '--mv3']);

// 3. 解析 ZIP 路径（Windows 下 shell 不会展开通配符，这里直接读目录）
const files = readdirSync(outputDir);
const pick = (pattern, label) => {
  const matches = files.filter((file) => pattern.test(file));
  if (matches.length !== 1) {
    console.error(`[submit] 期望 1 个${label}，实际找到 ${matches.length} 个: ${matches.join(', ') || '无'}`);
    process.exit(1);
  }
  return join(outputDir, matches[0]);
};

const args = [...extraArgs];
if (stores.includes('chrome')) args.push('--chrome-zip', pick(/-chrome\.zip$/, ' Chrome ZIP'));
if (stores.includes('edge')) args.push('--edge-zip', pick(/-chrome\.zip$/, ' Chrome ZIP'));
if (stores.includes('firefox')) {
  args.push('--firefox-zip', pick(/-firefox\.zip$/, ' Firefox ZIP'));
  args.push('--firefox-sources-zip', pick(/-sources\.zip$/, ' Firefox 源码 ZIP'));
}

// 4. 提交
run(['submit', ...args]);
