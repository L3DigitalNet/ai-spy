// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // .venv/ ships third-party JavaScript (basedpyright's bundled language server,
  // coverage's HTML report assets, an entire vendored npm). Without this ignore
  // ESLint walks into it and reports thousands of violations in code we do not own.
  globalIgnores(['.venv/', 'node_modules/', 'dist/']),
  {
    files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
