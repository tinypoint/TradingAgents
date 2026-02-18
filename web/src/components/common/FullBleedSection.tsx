import { ReactNode } from "react";

type FullBleedSectionProps = {
  children: ReactNode;
  className?: string;
};

export function FullBleedSection({ children, className = "" }: FullBleedSectionProps) {
  return <section className={`-mx-5 px-5 py-8 ${className}`}>{children}</section>;
}

