const path = require('path');
const { execFileSync } = require('child_process');
const bcrypt = require('bcryptjs');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'hash-password.js');

describe('scripts/hash-password.js', () => {
  it('prints a bcrypt hash that verifies the given password', () => {
    const output = execFileSync('node', [SCRIPT_PATH, 'my-secret-password']).toString().trim();
    expect(output).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    expect(bcrypt.compareSync('my-secret-password', output)).toBe(true);
    expect(bcrypt.compareSync('wrong-password', output)).toBe(false);
  });

  it('exits with an error and usage message when no password is given', () => {
    expect(() => execFileSync('node', [SCRIPT_PATH])).toThrow();

    try {
      execFileSync('node', [SCRIPT_PATH], { stdio: 'pipe' });
      throw new Error('expected the script to exit non-zero');
    } catch (err) {
      expect(err.status).toBe(1);
      expect(err.stderr.toString()).toContain('Usage:');
    }
  });
});
