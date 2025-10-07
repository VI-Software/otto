module.exports = {
    extends: ['eslint:recommended'],
    env: {
        node: true
    },
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
    },
    rules: {
        indent: [
            'error',
            4,
            {
                SwitchCase: 1,
            },
        ],
        'linebreak-style': ['error', 'unix'],
        quotes: ['error', 'single'],
        semi: ['error', 'never'],
        'no-var': ['error'],
        'no-console': [0],
        'no-control-regex': [0],
        'no-unused-vars': [
            'error',
            {
                vars: 'all',
                args: 'none',
                ignoreRestSiblings: false,
                argsIgnorePattern: 'reject',
            },
        ],
        'no-async-promise-executor': [0],
        'no-undef': 0,
    },
}