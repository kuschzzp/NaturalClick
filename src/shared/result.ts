export type Ok<T> = { ok: true; value: T };
export type Err<E extends string = string, D = unknown> = { ok: false; error: E; message: string; details?: D };
export type Result<T, E extends string = string, D = unknown> = Ok<T> | Err<E, D>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E extends string, D = unknown>(error: E, message: string, details?: D): Err<E, D> {
  return details === undefined ? { ok: false, error, message } : { ok: false, error, message, details };
}
