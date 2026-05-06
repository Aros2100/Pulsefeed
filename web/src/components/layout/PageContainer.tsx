import { ReactNode } from 'react';

interface PageContainerProps {
  children:      ReactNode;
  paddingTop?:    string;
  paddingBottom?: string;
  className?:    string;
}

export function PageContainer({ children, paddingTop, paddingBottom, className }: PageContainerProps) {
  return (
    <div
      className={`pf-page-container${className ? ` ${className}` : ''}`}
      style={{ paddingTop, paddingBottom }}
    >
      {children}
    </div>
  );
}
