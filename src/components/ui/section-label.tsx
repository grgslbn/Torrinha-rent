interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionLabel({ children, className = "" }: SectionLabelProps) {
  return (
    <p
      className={`text-[10px] font-semibold uppercase tracking-widest text-t-text-muted ${className}`}
    >
      {children}
    </p>
  );
}
