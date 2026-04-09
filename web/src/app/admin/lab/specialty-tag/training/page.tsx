import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import TrainingClient from "./TrainingClient";

export default async function TrainingPage() {
  return <TrainingClient specialty={ACTIVE_SPECIALTY} label={ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1)} />;
}
