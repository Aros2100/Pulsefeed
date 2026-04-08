export const SPECIALTIES = [
  { slug: "neurosurgery",      label: "Neurosurgery",       active: true  },
  { slug: "cardiology",        label: "Cardiology",         active: false },
  { slug: "orthopedics",       label: "Orthopedics",        active: false },
  { slug: "oncology",          label: "Oncology",           active: false },
  { slug: "radiology",         label: "Radiology",          active: false },
  { slug: "general-surgery",   label: "General Surgery",    active: false },
  { slug: "internal-medicine", label: "Internal Medicine",  active: false },
  { slug: "other",             label: "Other",              active: false },
] as const;

export type SpecialtySlug = (typeof SPECIALTIES)[number]["slug"];

export const SPECIALTY_SLUGS = SPECIALTIES.map((s) => s.slug);

export const ACTIVE_SPECIALTY = SPECIALTIES.find((s) => s.active)!.slug;
