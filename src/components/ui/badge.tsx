type Variant = "success" | "warning" | "danger" | "accent" | "neutral" | "info";

const variantClasses: Record<Variant, string> = {
  success: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  accent: "bg-t-accent-light text-t-accent-text",
  neutral: "bg-gray-100 text-gray-600",
  info: "bg-blue-50 text-blue-700",
};

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[var(--t-radius-sm)] text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
