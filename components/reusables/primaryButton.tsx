import React from "react";
import Link from "next/link";

interface BaseButtonProps {
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  className?: string;
}

export type ButtonProps =
  | (BaseButtonProps & {
      href: string;
      prefetch?: boolean;
    } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">)
  | (BaseButtonProps & {
      href?: undefined;
    } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">);

export const BUTTON_SIZE_CLASSES = {
  sm: "h-9 px-4 text-[14px] rounded-md gap-1.5",
  md: "h-11 px-6 text-[16px] rounded-lg gap-2",
  lg: "h-[52px] px-8 text-[16px] rounded-[10px] gap-2",
} as const;

export default function PrimaryButton({
  size = "md",
  children,
  className = "",
  ...props
}: ButtonProps) {
  const classes = `inline-flex items-center justify-center font-semibold tracking-tight transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-blue text-white shadow-(--shadow-primary) hover:bg-blue-mid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${BUTTON_SIZE_CLASSES[size]} ${className}`;

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
