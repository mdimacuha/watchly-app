import { Anton } from 'next/font/google';

/**
 * Anton, the editorial display face (.type-display). Set once on <body> in the
 * root layout, so every page title can use it; a few components still add
 * the variable themselves, which is harmless.
 */
export const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton' });
