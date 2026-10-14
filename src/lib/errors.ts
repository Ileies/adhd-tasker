/** What an error page says. Never the server's message or a stack trace. */
export type ErrorCopy = {
	title: string;
	message: string;
	action: { label: string; kind: 'home' | 'retry' };
};

export function errorCopy(status: number): ErrorCopy {
	if (status === 404)
		return {
			title: 'This page does not exist',
			message: 'The link may be old or mistyped.',
			action: { label: 'Back to Now', kind: 'home' }
		};
	return {
		title: 'Something went wrong',
		message: 'Nothing you planned is lost. Try again in a moment.',
		action: { label: 'Try again', kind: 'retry' }
	};
}
