export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireCondition(
  test: unknown,
  code: string,
  message: string,
  status = 400,
): asserts test {
  if (!test) throw new AppError(code, message, status);
}
