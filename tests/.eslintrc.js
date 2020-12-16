module.exports = {
    plugins: ['jest'],
    extends: [
        'plugin:jest/recommended',
        'plugin:jest/style'
    ],
    env: {
        jest: true
    },
    rules: {
        'jest/no-done-callback': 0
    }
};
