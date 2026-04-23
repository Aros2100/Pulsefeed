import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import TextValidationClient from "../../condensation/TextValidationClient";

export default async function CondensationTextSessionPage() {
  const specialty = ACTIVE_SPECIALTY;
  const label = ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1);

  return (
    <TextValidationClient
      specialty={specialty}
      label={label}
      scoringEndpoint="/api/lab/score-condensation-text"
      backHref="/admin/lab/condensation-text"
    />
  );
}
