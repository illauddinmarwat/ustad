/**
 * Workers, Nearby and posted jobs use skill keys (`plumber`, `electrician`, ...).
 * Service listings hang off service templates, which use their own category
 * names (`plumbing`, `electrical`, ...). Each admin-managed skill category carries
 * its template category, so this maps one vocabulary to the other and a category
 * chosen in one place filters the other.
 */
import { DEFAULT_SKILL_CATEGORIES, getSkillCategories } from './skillCategories';

export const SKILL_TO_TEMPLATE_CATEGORY: Record<string, string> = Object.fromEntries(
  DEFAULT_SKILL_CATEGORIES.filter((c) => c.templateCategory).map((c) => [c.key, c.templateCategory as string])
);

/** Template category for a skill key, or null for "all" / an unknown key. */
export function templateCategoryFor(skillKey: string | null | undefined): string | null {
  if (!skillKey) return null;
  return getSkillCategories().find((c) => c.key === skillKey)?.templateCategory ?? SKILL_TO_TEMPLATE_CATEGORY[skillKey] ?? null;
}

/** Skill key for a template category (used to hand a listing's category back to Nearby). */
export function skillForTemplateCategory(templateCategory: string | null | undefined): string | null {
  if (!templateCategory) return null;
  const hit = getSkillCategories().find((c) => c.templateCategory === templateCategory);
  if (hit) return hit.key;
  const fallback = Object.entries(SKILL_TO_TEMPLATE_CATEGORY).find(([, v]) => v === templateCategory);
  return fallback ? fallback[0] : null;
}
