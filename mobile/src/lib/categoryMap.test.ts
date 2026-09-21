import { SKILL_TO_TEMPLATE_CATEGORY, skillForTemplateCategory, templateCategoryFor } from './categoryMap';
import { SKILL_CATEGORIES } from './skillCategories';

describe('categoryMap', () => {
  it('maps every skill category to a template category', () => {
    for (const c of SKILL_CATEGORIES) {
      expect(templateCategoryFor(c.key)).toBeTruthy();
    }
  });

  it('uses a different template category for each skill', () => {
    const values = Object.values(SKILL_TO_TEMPLATE_CATEGORY);
    expect(new Set(values).size).toBe(values.length);
  });

  it('maps and reverses known categories', () => {
    expect(templateCategoryFor('plumber')).toBe('plumbing');
    expect(templateCategoryFor('ac_technician')).toBe('hvac');
    expect(skillForTemplateCategory('electrical')).toBe('electrician');
  });

  it('returns null for all, unknown and missing values', () => {
    expect(templateCategoryFor(null)).toBeNull();
    expect(templateCategoryFor(undefined)).toBeNull();
    expect(templateCategoryFor('')).toBeNull();
    expect(templateCategoryFor('astronaut')).toBeNull();
    expect(skillForTemplateCategory('cleaning')).toBeNull();
    expect(skillForTemplateCategory(null)).toBeNull();
  });
});
