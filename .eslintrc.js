module.exports = {
	root: true,
	env: {
		node: true,
		es2020: true,
		jest: true,
	},
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'prettier',
	],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'prettier'],
	rules: {
		'prettier/prettier': 'warn',
		'no-unused-vars': 'warn',
		'@typescript-eslint/no-unused-vars': 'warn',
	},
};
