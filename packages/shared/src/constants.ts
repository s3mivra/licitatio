/** Editable list. Defaults for the civil engineer to confirm against current PCAB rules. */
export const PCAB_CATEGORIES = ['AAAA', 'AAA', 'AA', 'A', 'B', 'C', 'D', 'Trade/E'] as const;

export const DEFAULT_EXPIRY_THRESHOLDS: readonly number[] = [60, 30, 7];
export const VAULT_VERSION_LIMIT = 25;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Suggestions for experience project categories; the field stays free text. */
export const PROJECT_CATEGORY_SUGGESTIONS = [
  'Buildings', 'Roads and bridges', 'Flood control and drainage', 'Water supply', 'Electrical works', 'Site development', 'Renovation', 'Other',
] as const;
