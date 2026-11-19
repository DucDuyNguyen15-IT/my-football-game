import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'assets-src/**',
      '.claude/**',
      'docs/design/generator/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
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
    // ADR-0011: replay phải giống nhau trên mọi engine JS; chỉ + − × ÷, sqrt, abs, min, max, floor… mới
    // được IEEE-754 bảo đảm. Hàm siêu việt dùng `math/det.ts`. Test được dùng thoải mái.
    files: ['packages/sim/src/**/*.ts'],
    ignores: ['**/*.test.ts', 'packages/sim/src/**/*.slow.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Dùng PRNG có seed của sim để giữ tính tất định.',
        },
        ...[
          'sin',
          'cos',
          'tan',
          'asin',
          'acos',
          'atan',
          'atan2',
          'sinh',
          'cosh',
          'tanh',
          'asinh',
          'acosh',
          'atanh',
          'log',
          'log2',
          'log10',
          'log1p',
          'exp',
          'expm1',
          'pow',
          'cbrt',
          'hypot',
        ].map((property) => ({
          object: 'Math',
          property,
          message: 'Kết quả khác nhau giữa các engine JS (phá replay): dùng math/det.ts hoặc sqrt.',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**']",
          message: 'Toán tử ** có thể khác nhau giữa các engine JS: nhân tay.',
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
