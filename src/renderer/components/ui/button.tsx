import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/65',
  {
    variants: {
      variant: {
        default: 'text-[var(--btn-default-text)] border border-transparent bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover)]',
        fox: 'text-[var(--btn-fox-text)] border border-[var(--btn-fox-border)] bg-[var(--btn-fox-bg)] hover:bg-[var(--btn-fox-hover)]',
        secondary:
          'text-textMain border border-[var(--btn-neutral-border)] bg-[var(--btn-neutral-bg)] hover:bg-[var(--btn-neutral-hover)]',
        danger: 'text-textMain border border-[var(--danger-border)] bg-[var(--danger-bg)] hover:brightness-95',
        ghost: 'text-textMain border border-transparent bg-transparent hover:bg-[var(--history-hover)]'
      },
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-xs',
        icon: 'h-9 w-9 rounded-lg'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
