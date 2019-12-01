module.exports = function (wallaby) {
    return {
        name: 'Webpack Import Map Plugin',
        files: [
            './src/**/*.js',
            '!./tests/**/*.spec.js',
            './tests/**/*.*',
            './index.js',
            { pattern: 'node_modules/**/*', instrument: false }
        ],
        testFramework: 'mocha',
        tests: [
            './tests/**/*.spec.js'
        ],
        env: {
            type: 'node',
            runner: 'node'
        },
        setup (wallaby) {
            wallaby.testFramework.timeout(5000);
        }
    };
};
