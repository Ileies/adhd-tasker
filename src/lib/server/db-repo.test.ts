/// <reference types="bun" />
import { describeRepo } from '#test/repo-contract.js';
import { resetDb } from '#test/db.js';
import { makeUser } from '#test/fixtures.js';
import { dbRepo } from '#lib/server/db-repo.js';

describeRepo('db repo', {
	reset: resetDb,
	async open(email) {
		await makeUser({ email });
		return dbRepo(email);
	}
});
