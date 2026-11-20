import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "subtle" | "danger";
  size?: "default" | "small";
  children: ReactNode;
};

export function Button({
  variant = "subtle",
  size = "default",
  type = "button",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button ${variant}${size === "small" ? " small-button" : ""} ${className}`.trim()}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
