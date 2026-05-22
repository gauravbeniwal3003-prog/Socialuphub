import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Initialize DOMPurify for server-side or client-side
const window = (new JSDOM('')).window;
const purify = DOMPurify(window as any);

/**
 * Sanitizes a string to prevent XSS attacks.
 */
export const sanitize = (input: string): string => {
    if (!input) return '';
    return purify.sanitize(input, {
        ALLOWED_TAGS: [], // No HTML tags allowed by default for plain text inputs
        ALLOWED_ATTR: []
    });
};

/**
 * Validates if a string is a valid URL.
 */
export const isValidUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
};

/**
 * Validates data against a Zod schema and returns sanitized data.
 */
export const validateAndSanitize = <T>(schema: any, data: any): T => {
    const validated = schema.parse(data);
    // Recursively sanitize strings in the validated object
    return sanitizeObject(validated);
};

const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') return sanitize(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (typeof obj === 'object' && obj !== null) {
        const newObj: any = {};
        for (const key in obj) {
            newObj[key] = sanitizeObject(obj[key]);
        }
        return newObj;
    }
    return obj;
};
