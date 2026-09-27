const categories = require('../categories');

describe('categories', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = categories.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(categories.map(c => [c.id, c]))('category "%s" has all required fields', (_id, category) => {
    expect(typeof category.id).toBe('string');
    expect(category.id.length).toBeGreaterThan(0);
    expect(typeof category.name).toBe('string');
    expect(category.name.length).toBeGreaterThan(0);
    expect(typeof category.icon).toBe('string');
    expect(typeof category.description).toBe('string');
    expect(category.description.length).toBeGreaterThan(0);

    expect(Array.isArray(category.tags)).toBe(true);
    expect(category.tags.length).toBeGreaterThan(0);
    category.tags.forEach(tag => expect(typeof tag).toBe('string'));

    expect(Array.isArray(category.searchTerms)).toBe(true);
    expect(category.searchTerms.length).toBeGreaterThan(0);
    category.searchTerms.forEach(term => expect(typeof term).toBe('string'));
  });
});
