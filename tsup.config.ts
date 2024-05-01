import { rmSync } from 'fs';
import { defineConfig } from 'tsup';

rmSync('./dist', { recursive: true, force: true });

export default defineConfig((opts) => ({
    name: 'tsup',
    target: 'node18',
    entry: {
        extension: './src/extension.ts',
        server: './src/server/server.ts',
    },
    cjsInterop: true,
    sourcemap: opts.watch ? true : false,
    format: 'cjs',
    external: ['vscode'],
}));
