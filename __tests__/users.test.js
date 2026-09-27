const users = require('../users');

describe('users', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });

  it('has unique usernames', () => {
    const names = users.map(u => u.username);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(users.map(u => [u.username, u]))('user "%s" has a username and a bcrypt password hash', (_name, user) => {
    expect(typeof user.username).toBe('string');
    expect(user.username.length).toBeGreaterThan(0);
    expect(typeof user.passwordHash).toBe('string');
    // bcrypt hashes look like $2a$10$... / $2b$... and are 60 chars long
    expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
  });
});
