/**
 * Overall coverage from an lcov report. Bun's own `coverageThreshold` applies to every file on its
 * own and its "All files" row is a plain mean of the file percentages, so `verify` weighs by lines
 * and functions here instead.
 */
export type Coverage = { lines: number; functions: number };

/** Sums the line and function counters (`LF`/`LH`, `FNF`/`FNH`) of every file in the report. */
export function overallCoverage(lcov: string): Coverage {
	const total = { LF: 0, LH: 0, FNF: 0, FNH: 0 };
	for (const match of lcov.matchAll(/^(LF|LH|FNF|FNH):(\d+)$/gm)) {
		total[match[1] as keyof typeof total] += Number(match[2]);
	}
	return {
		lines: total.LF === 0 ? 1 : total.LH / total.LF,
		functions: total.FNF === 0 ? 1 : total.FNH / total.FNF
	};
}

/** One message per measure under `minimum`, empty when the report passes. */
export function coverageFailures(coverage: Coverage, minimum: number): string[] {
	return (['lines', 'functions'] as const)
		.filter((measure) => coverage[measure] < minimum)
		.map(
			(measure) =>
				`${measure} ${percent(coverage[measure])} is under the minimum of ${percent(minimum)}`
		);
}

export const percent = (ratio: number) => `${(ratio * 100).toFixed(2)} %`;
