export interface RollbackInput {
  readonly path: string;
  readonly content?: string;
  readonly sha256?: string;
}
export type ByteCheck = 'MATCHED_SELECTED_BYTES' | 'MISMATCH' | 'NOT_CHECKED';
export interface RollbackRow {
  readonly generation: string;
  readonly installedAt: string;
  readonly sourceSha: string;
  readonly binarySha256: string;
  readonly platform: 'linux' | 'win32' | 'darwin';
  readonly pointer: 'current' | 'previous' | 'retained';
  readonly byteCheck: ByteCheck;
}
export interface RollbackProjection {
  readonly state: 'RECORDED' | 'PARTIAL' | 'EMPTY' | 'INVALID';
  readonly firstRed: string | null;
  readonly rows: ReadonlyArray<RollbackRow>;
  readonly errors: ReadonlyArray<string>;
  readonly pointers?: { readonly current: string | null; readonly previous: string | null };
  readonly qualification?: 'RECEIPT_PROJECTION_ONLY';
}
export declare function classifyRollbackFile(path: string): 'receipt' | 'pointer' | 'executable' | null;
export declare function parseRollbackHistory(records: ReadonlyArray<RollbackInput>): RollbackProjection;
