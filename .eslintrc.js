module.exports = {
  env: {
    es6: true,
    node: true,
  },
  ignorePatterns: ['dist/', 'node_modules/'],
  plugins: ['@typescript-eslint', 'jest', 'import'],
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  parserOptions: {
    // This setting is required if you want to use rules which require type information
    // https://github.com/typescript-eslint/typescript-eslint/tree/master/packages/parser#parseroptionsproject
    project: ['./tsconfig.eslint.json'],
  },
  extends: [
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    'prettier/@typescript-eslint', // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
    'plugin:jest/recommended',
    'eslint:recommended',
  ],
  rules: {
    'import/order': [
      'error',
      {
        alphabetize: { order: 'asc' },
        'newlines-between': 'never',
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
      },
    ],
    'no-console': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'error',
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/camelcase': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
  },
};
