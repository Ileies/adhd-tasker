/** The error a promise rejects with. Fails the test when it resolves, so a missing refusal cannot pass. */
export async function failureOf(work: Promise<unknown>): Promise<Error & { status?: number }> {
	try {
		await work;
	} catch (thrown) {
		return thrown as Error & { status?: number };
	}
	throw new Error('expected the work to fail, but it succeeded');
}
