import { redirect } from "next/navigation";
import GeoValidationClient from "../GeoValidationClient";

export default async function GeoValidationValidatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const bucket = params.bucket;
  if (!bucket) redirect("/admin/lab/geo-validation");

  return <GeoValidationClient bucket={bucket} />;
}
