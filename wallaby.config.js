module.exports = function (wallaby) {
    return {
        files: [
            'src/**/*.js',
            '!tests/**/*.spec.js',
            'tests/**/*.*',
            'index.js'
        ],
        tests: [
            'tests/**/*.spec.js'
        ],
        env: {
            type: 'node'
        }
    };
};
