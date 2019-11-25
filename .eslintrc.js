module.exports = {
    root: true,
    env: {
        commonjs: true,
        es6: true,
        node: true
    },
    extends: [
        'standard',
        'eslint:recommended'
    ],
    globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly'
    },
    parserOptions: {
        ecmaVersion: 2019
    },
    rules: {
        indent: [2, 4],
        semi: [2, 'always'],
        'no-var': 2
    }
};
