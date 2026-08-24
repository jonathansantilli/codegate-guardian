/**
 * Where the console's own API lives.
 *
 * Every screen fetches through this prefix. Stated once because a base path
 * that is right on eleven screens and wrong on the twelfth fails only when
 * the console is mounted somewhere other than the root — which is exactly
 * when nobody is looking.
 */
export const API_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fleet`;
