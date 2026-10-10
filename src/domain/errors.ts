export type DomainErrorCode =
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "not_allowed"
  | "upstream_error";

/** An error the assistant can act on: a machine code, a message, and optional hints. */
export class DomainError extends Error {
  constructor(
    public code: DomainErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string, id: string) => new DomainError("not_found", `${what} ${id} does not exist`, { id });
