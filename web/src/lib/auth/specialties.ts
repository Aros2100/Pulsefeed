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

export const SUBSPECIALTIES_BY_SPECIALTY: Record<
  string,
  readonly { slug: string; label: string }[]
> = {
  neurosurgery: [
    { slug: "spine",           label: "Spine" },
    { slug: "neuro-oncology",  label: "Neuro-oncology" },
    { slug: "cerebrovascular", label: "Cerebrovascular" },
    { slug: "functional",      label: "Functional" },
    { slug: "pediatric",       label: "Pediatric Neurosurgery" },
    { slug: "neurotrauma",     label: "Neurotrauma" },
  ],
  cardiology: [
    { slug: "interventional",        label: "Interventional Cardiology" },
    { slug: "electrophysiology",     label: "Electrophysiology" },
    { slug: "heart-failure",         label: "Heart Failure" },
    { slug: "cardiac-imaging",       label: "Cardiac Imaging" },
    { slug: "preventive-cardiology", label: "Preventive Cardiology" },
    { slug: "pediatric-cardiology",  label: "Pediatric Cardiology" },
  ],
  orthopedics: [
    { slug: "joint-replacement", label: "Joint Replacement" },
    { slug: "sports-medicine",   label: "Sports Medicine" },
    { slug: "spine-ortho",       label: "Spine" },
    { slug: "trauma-ortho",      label: "Trauma" },
    { slug: "hand-surgery",      label: "Hand Surgery" },
    { slug: "pediatric-ortho",   label: "Pediatric Orthopaedics" },
  ],
  oncology: [
    { slug: "breast-oncology", label: "Breast Oncology" },
    { slug: "gi-oncology",     label: "Gastrointestinal Oncology" },
    { slug: "thoracic-onc",    label: "Thoracic Oncology" },
    { slug: "hematology",      label: "Hematology / Oncology" },
    { slug: "neuro-onc",       label: "Neuro-oncology" },
    { slug: "immunotherapy",   label: "Immunotherapy" },
  ],
  radiology: [
    { slug: "neuroradiology",           label: "Neuroradiology" },
    { slug: "interventional-radiology", label: "Interventional Radiology" },
    { slug: "breast-imaging",           label: "Breast Imaging" },
    { slug: "body-mri",                 label: "Body MRI" },
    { slug: "nuclear-medicine",         label: "Nuclear Medicine" },
    { slug: "pediatric-radiology",      label: "Pediatric Radiology" },
  ],
  "general-surgery": [
    { slug: "hepatobiliary",     label: "Hepatobiliary" },
    { slug: "colorectal",        label: "Colorectal" },
    { slug: "bariatric",         label: "Bariatric" },
    { slug: "endocrine-surgery", label: "Endocrine Surgery" },
    { slug: "min-invasive",      label: "Minimally Invasive" },
    { slug: "surgical-oncology", label: "Surgical Oncology" },
  ],
  "internal-medicine": [
    { slug: "gastroenterology",  label: "Gastroenterology" },
    { slug: "pulmonology",       label: "Pulmonology" },
    { slug: "nephrology",        label: "Nephrology" },
    { slug: "rheumatology",      label: "Rheumatology" },
    { slug: "endocrinology",     label: "Endocrinology" },
    { slug: "infectious-disease", label: "Infectious Disease" },
  ],
  other: [],
};
