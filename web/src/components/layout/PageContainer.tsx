import { CSSProperties, ReactNode } from 'react';

interface PageContainerProps {
  children:  ReactNode;
  className?: string;
  style?:    CSSProperties;
}

export function PageContainer({ children, className, style }: PageContainerProps) {
  return (
    <div className={`pf-page-container${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}
