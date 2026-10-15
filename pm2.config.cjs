const { join } = require('path');
const packageJson = require('./package.json');

module.exports = {
	name: packageJson.name,
	script: join(__dirname, 'build', 'index.js'),
	interpreter: 'bun',
	env: {
		NODE_ENV: 'production',
		PORT: 3002,
		// The adapter refuses bigger requests (512 kB by default), a full plan moving into an account is larger
		BODY_SIZE_LIMIT: '8M'
	}
};
