module.exports = {
    transform: {
        '^.+\\.[tj]sx?$': 'babel-jest',
    },
    transformIgnorePatterns: ['/node_modules/(?!your-esm-package-name)/'],
};