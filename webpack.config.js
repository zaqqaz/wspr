const path = require('path');

module.exports = {
    target: 'node',
    entry: './src/wspr.ts',
    output: {
        libraryTarget: "commonjs",
        filename: 'wspr.js',
        path: path.resolve(__dirname, 'bin'),
    },
    module: {
        rules: [
            { test: /\.tsx?$/, loader: "ts-loader" }
        ]
    }
};
