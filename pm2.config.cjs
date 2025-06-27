const { join } = require('path');
const packageJson = require('./package.json');

module.exports = {
	name: packageJson.name,
	script: join(__dirname, 'index.js'),
	interpreter: 'bun',
	env: {
		NODE_ENV: 'production',
		PORT: 3002
	}
};
