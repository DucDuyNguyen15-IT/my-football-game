import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/server/**/*.ts', '*.config.{js,ts}', 'apps/web/scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // ADR-0001/0009: sim là TS thuần, không được phụ thuộc engine vẽ (Three.js), React hay DOM.
    files: ['packages/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*', 'phaser', 'phaser/*'],
              message: 'packages/sim không được import engine vẽ (Three.js/Phaser).',
            },
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'packages/sim không được import React.',
            },
            { group: ['node:*'], message: 'packages/sim phải chạy được trên trình duyệt.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'performance'],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Dùng PRNG có seed của sim để giữ tính tất định.',
        },
      ],
    },
  },
  {
    // PRD §6.3: random ở server cho gacha/ép thẻ phải là CSPRNG.
    files: ['apps/server/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Dùng node:crypto (randomInt) thay cho Math.random.',
        },
      ],
    },
  },
);
