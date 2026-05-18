import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export default function PrimaryButton({ size = 'md', children, className = '', ...props }: ButtonProps) {
  const sizeClasses = {
    sm: 'h-8 px-4 text-[14px] rounded-md gap-1',
    md: 'h-11 px-6 text-[16px] rounded-lg gap-2',
    lg: 'h-[52px] px-8 text-[16px] rounded-[10px] gap-2',
  };

  return (
    <button
      className={`inline-flex items-center justify-center font-semibold tracking-tight transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        bg-blue text-white shadow-[--shadow-primary] hover:bg-blue-mid
        ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}