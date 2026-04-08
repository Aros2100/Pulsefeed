import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import PicoValidationClient from "../PicoValidationClient";

export default async function PicoValidationPage() {
  const specialty = ACTIVE_SPECIALTY;
  const label = ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1);

  return <PicoValidationClient specialty={specialty} label={label} />;
}
