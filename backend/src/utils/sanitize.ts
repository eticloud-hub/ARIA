import xss from 'xss';

/**
 * Strips all HTML tags and potentially dangerous scripts from user input.
 * To be used as a Zod transformer on user-controlled string fields, preventing Stored XSS.
 */
export function sanitizeHtml(input: string): string {
    return xss(input, {
        whiteList: {}, // Empty whitelist removes all HTML tags
        stripIgnoreTag: true, // Remove tags not in whitelist instead of escaping them
        stripIgnoreTagBody: ['script', 'style'], // Remove content of script and style tags
    });
}
