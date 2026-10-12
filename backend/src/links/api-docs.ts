export const SHORT_CODE_PARAM = {
  name: 'shortCode',
  description: '7-character code of letters and digits',
  schema: { type: 'string', pattern: '^[A-Za-z0-9]{7}$', example: 'Ab3xY9z' },
} as const;
