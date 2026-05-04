import { Pinwheel } from "./Pinwheel";

interface PageLoaderProps {
  label?: string;
}

export function PageLoader({ label }: PageLoaderProps) {
  return (
    <div className="pf-page-loader">
      <Pinwheel size={64} />
      {label && <span className="pf-page-loader-label">{label}</span>}
    </div>
  );
}
