/**
 * Workers, Nearby and posted jobs use skill keys (`plumber`, `electrician`, ...).
 * Service listings hang off service templates, which use their own category
 * names (`plumbing`, `electrical`, ...). This maps one vocabulary to the other so
 * a category chosen in one place filters the other.
 */
export const SKILL_TO_TEMPLATE_CATEGORY: Record<string, string> = {
  electrician: 'electrical',
  plumber: 'plumbing',
  carpenter: 'carpentry',
  painter: 'painting',
  ac_technician: 'hvac',
  welder: 'welding',
};

/** Template category for a skill key, or null for "all" / an unknown key. */
export function templateCategoryFor(skillKey: string | null | undefined): string | null {
  if (!skillKey) return null;
  return SKILL_TO_TEMPLATE_CATEGORY[skillKey] ?? null;
}

/** Skill key for a template category (used to hand a listing's category back to Nearby). */
export function skillForTemplateCategory(templateCategory: string | null | undefined): string | null {
  if (!templateCategory) return null;
  const hit = Object.entries(SKILL_TO_TEMPLATE_CATEGORY).find(([, v]) => v === templateCategory);
  return hit ? hit[0] : null;
}
