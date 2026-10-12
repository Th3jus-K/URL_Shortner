import { randomInt } from 'node:crypto';

export const SHORT_CODE_PATTERN = /^[A-Za-z0-9]{7}$/;
export const CODE_GENERATOR = Symbol('CODE_GENERATOR');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 7;

export type CodeGenerator = () => string;

/** 7 characters from a 62-char alphabet; randomInt avoids modulo bias. */
export function generateShortCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
