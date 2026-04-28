import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-t-accent text-white hover:bg-t-accent-hover disabled:opacity-50",
  secondary:
    "bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50",
  outline:
    "border border-t-border text-t-text hover:bg-t-accent-light disabled:opacity-50",
  ghost:
    "text-t-text-muted hover:text-t-text hover:bg-gray-100 disabled:opacity-50",
  danger:
    "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs rounded-[var(--t-radius-sm)]",
  md: "px-3.5 py-1.5 text-sm rounded-[var(--t-radius-md)]",
  lg: "px-5 py-2.5 text-sm rounded-[var(--t-radius-md)]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      {...props}
      className={`inline-flex items-center justify-center font-medium transition-colors cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    />
  )
);
Button.displayName = "Button";

export { Button };
