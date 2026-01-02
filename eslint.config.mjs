import antfu from '@antfu/eslint-config'

export default antfu({
  // Disable markdown linting (code examples in docs)
  markdown: false,
  ignores: [
    'dist',
    '**/dist/**',
    'dist-demo',
    '**/dist-demo/**',
    'node_modules',
    '**/node_modules/**',
    'coverage',
    '**/coverage/**',
    '*.log',
    '**/*.log/**',
    '.DS_Store',
    '**/.DS_Store/**',
    '.vscode',
    '**/.vscode/**',
    '**/*.md',
  ],
  rules: {
    // Allow console.log in specific contexts (demo, scripts, api)
    'no-console': ['error', { allow: ['warn', 'error', 'info', 'log'] }],
    // Allow alert in demo code
    'no-alert': 'off',
    // Allow process and Buffer globals in Node.js contexts
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',
    // Allow no-new-func for formula evaluation (intentional)
    'no-new-func': 'off',
    // Allow assignment in while loops (common regex pattern)
    'no-cond-assign': ['error', 'except-parens'],
    // Allow new for side effects (validation)
    'no-new': 'off',
    // Relax regex rules for existing patterns
    'regexp/no-super-linear-backtracking': 'off',
    'regexp/optimal-quantifier-concatenation': 'off',
    // Allow multiple statements per line in some cases
    'style/max-statements-per-line': 'off',
    // Allow ternary without newlines
    'style/multiline-ternary': 'off',
    // Allow use before define in Vue setup scripts (common pattern)
    'ts/no-use-before-define': 'off',
    // Allow unused vars/args prefixed with underscore or in type definitions
    'no-unused-vars': 'off',
    'unused-imports/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
  },
})
