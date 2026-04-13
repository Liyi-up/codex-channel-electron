import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] tracking-wide', {
  variants: {
    variant: {
      default: 'status-pill',
      current: 'status-pill status-pill-current'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
