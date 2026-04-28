interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] ${className}`}
    >
      {children}
    </div>
  );
}
