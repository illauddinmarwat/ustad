import type { StringId } from '../i18n/strings';

export type SkillCategory = {
  key: string;
  labelId: StringId;
  icon: number;
};

// Exact icon artwork cropped from refrence/skill-category-icons.jpeg, one
// image per trade (see refrence/skill-icon-*.png).
export const SKILL_CATEGORIES: SkillCategory[] = [
  { key: 'electrician', labelId: 'register.skill.electrician', icon: require('../../assets/skills/skill-icon-electrician.png') },
  { key: 'plumber', labelId: 'register.skill.plumber', icon: require('../../assets/skills/skill-icon-plumber.png') },
  { key: 'carpenter', labelId: 'register.skill.carpenter', icon: require('../../assets/skills/skill-icon-carpenter.png') },
  { key: 'painter', labelId: 'register.skill.painter', icon: require('../../assets/skills/skill-icon-painter.png') },
  { key: 'ac_technician', labelId: 'register.skill.acTechnician', icon: require('../../assets/skills/skill-icon-ac_technician.png') },
  { key: 'welder', labelId: 'register.skill.welder', icon: require('../../assets/skills/skill-icon-welder.png') },
];
