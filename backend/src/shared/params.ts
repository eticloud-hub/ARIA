/**
 * Express 5 params helper — params can be string | string[].
 * This safely extracts the first string value.
 */
export function param(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}
