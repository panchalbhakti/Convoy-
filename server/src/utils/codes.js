import crypto from 'node:crypto';

// No 0/O/1/I/L so codes can be read aloud or typed from a screenshot without mistakes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomFrom(alphabet, length) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export const makeJoinCode = () => randomFrom(ALPHABET, 6);
export const makeJourneyId = () => randomFrom('abcdefghijkmnpqrstuvwxyz23456789', 12);

export const VEHICLE_COLORS = [
  '#2F7F79', '#D1495B', '#EDAE49', '#3D5A80', '#8E5572',
  '#5B8E3E', '#E07A2F', '#4A4E69', '#17A2B8', '#A0522D',
];
