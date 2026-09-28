const bcrypt = require('bcryptjs');
const users = require('../users');

describe('users', () => {
  test('exports a non-empty array', () => {
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });

  test('every user has a username and a bcrypt password hash', () => {
    const bcryptHashPattern = /^\$2[aby]\$\d{2}\$.{53}$/;

    users.forEach((user) => {
      expect(typeof user.username).toBe('string');
      expect(user.username.length).toBeGreaterThan(0);

      expect(typeof user.passwordHash).toBe('string');
      expect(user.passwordHash).toMatch(bcryptHashPattern);
    });
  });

  test('usernames are unique', () => {
    const usernames = users.map((u) => u.username);
    expect(new Set(usernames).size).toBe(usernames.length);
  });

  test('stored hashes reject an arbitrary incorrect password', () => {
    users.forEach((user) => {
      expect(bcrypt.compareSync('definitely-not-the-password', user.passwordHash)).toBe(false);
    });
  });
});
