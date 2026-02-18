import { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function SectionHeader({ title, subtitle, right }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

