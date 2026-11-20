import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
};

export function IconButton({
  label,
  type = "button",
  className = "",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      type={type}
      className={`icon-button ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
