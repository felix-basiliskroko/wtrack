declare module 'argon2-browser' {
  export const ArgonType: {
    Argon2d: 0;
    Argon2i: 1;
    Argon2id: 2;
  };

  export function hash(params: {
    pass: string | Uint8Array;
    salt: string | Uint8Array;
    time?: number;
    mem?: number;
    hashLen?: number;
    parallelism?: number;
    type?: number;
  }): Promise<{ hash: Uint8Array; hashHex: string; encoded: string }>;
}

declare module 'argon2-browser/dist/argon2-bundled.min.js' {
  const argon2: {
    ArgonType: {
      Argon2d: 0;
      Argon2i: 1;
      Argon2id: 2;
    };
    hash(params: {
      pass: string | Uint8Array;
      salt: string | Uint8Array;
      time?: number;
      mem?: number;
      hashLen?: number;
      parallelism?: number;
      type?: number;
    }): Promise<{ hash: Uint8Array; hashHex: string; encoded: string }>;
  };
  export default argon2;
}
