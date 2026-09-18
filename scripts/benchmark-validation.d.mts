export interface SearchTimingSample {
  id: number;
}

export interface SearchTimingValidation {
  expected: number;
  observed: number;
  uniqueIds: number;
  duplicateIds: number[];
  valid: boolean;
}

export function validateSearchTimings(
  samples: readonly SearchTimingSample[],
  expected: number,
): SearchTimingValidation;
