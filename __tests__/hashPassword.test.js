describe('scripts/hash-password.js', () => {
  const SCRIPT_PATH = '../scripts/hash-password';
  const ORIGINAL_ARGV = process.argv;

  let exitSpy;
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit called with ${code}`);
    });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
    jest.restoreAllMocks();
  });

  test('prints a usage error and exits with code 1 when no password is given', () => {
    process.argv = ['node', 'scripts/hash-password.js'];

    expect(() => require(SCRIPT_PATH)).toThrow('process.exit called with 1');

    expect(errorSpy).toHaveBeenCalledWith('Usage: node scripts/hash-password.js <password>');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('logs a bcrypt hash of the given password', () => {
    process.argv = ['node', 'scripts/hash-password.js', 'super-secret'];

    require(SCRIPT_PATH);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
  });
});
