import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

type ActionButtonProps = {
  className?: string;
  variant?: 'default' | 'fox' | 'secondary' | 'danger' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
  label: string;
  busyText: string;
  loading: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  onClick: () => void;
};

function ActionButton(props: ActionButtonProps) {
  const { className, variant = 'secondary', size = 'default', label, busyText, loading, disabled, icon: Icon, onClick } = props;

  return (
    <Button className={cn(className)} type="button" variant={variant} size={size} disabled={disabled || loading} onClick={onClick}>
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{loading ? busyText : label}</span>
    </Button>
  );
}

export default ActionButton;
