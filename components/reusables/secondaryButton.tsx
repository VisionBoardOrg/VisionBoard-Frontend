import React from "react";
import Link from "next/link";
import { BUTTON_SIZE_CLASSES, type ButtonProps } from "./primaryButton";

export default function SecondaryButton({
  size = "md",
  children,
  className = "",
  ...props
}: ButtonProps) {
  const classes = `inline-flex items-center justify-center font-semibold tracking-tight transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-transparent text-blue border-[1.5px] border-blue-light hover:bg-blue-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${BUTTON_SIZE_CLASSES[size]} ${className}`;

  if ("href" in props && props.href !== undefined) {
    const { href, prefetch, ...anchorProps } = props;
    return (
      <Link href={href} prefetch={prefetch} className={classes} {...anchorProps}>
        {children}
      </Link>
    );
  }

  const { type = "button", ...buttonProps } = props as Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children"
  >;
  return (
    <button type={type} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
