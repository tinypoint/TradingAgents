import { ReactNode } from "react";

type SectionProps = {
  children: ReactNode;
  className?: string;
  muted?: boolean;
};

export function Section({ children, className = "", muted = false }: SectionProps) {
  return (
    <section className={`rounded-xl border border-gray-200 p-6 ${muted ? "bg-gray-100" : "bg-white"} ${className}`}>
      {children}
    </section>
  );
}
