import * as Crypto from 'expo-crypto';

/** Kollisionssäkert ID (UUID v4) med läsbart prefix. */
export function newId(prefix: string): string {
  return `${prefix}_${Crypto.randomUUID()}`;
}
