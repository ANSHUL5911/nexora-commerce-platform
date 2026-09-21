import React from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Lock,
  Clock,
  User,
  LogOut,
  Search,
  Menu,
  X,
  ArrowRight,
  Eye,
  Trash2,
  Plus,
  Minus,
  Info,
  ShoppingBag,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';

const ICONS = {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Lock,
  Clock,
  User,
  LogOut,
  Search,
  Menu,
  X,
  ArrowRight,
  Eye,
  Trash2,
  Plus,
  Minus,
  Info,
  ShoppingBag,
  ExternalLink,
  RotateCcw,
};

/**
 * Standardized Icon wrapper for Nexora Commerce.
 * Enforces unified size (default 16px), stroke width (default 1.75px),
 * and currentColor inheritance across the entire application.
 * Uses explicit icon mapping for optimal tree-shaking and ultra-fast initial paint.
 */
export function Icon({
  name,
  icon: ComponentProp,
  size = 16,
  strokeWidth = 1.75,
  color = 'currentColor',
  className = '',
  'aria-hidden': ariaHidden = true,
  ...rest
}) {
  const ResolvedIcon = ComponentProp || (name && ICONS[name] ? ICONS[name] : null);

  if (!ResolvedIcon) {
    if (import.meta.env?.DEV && name) {
      console.warn(`[Nexora Icon] Unknown icon name: "${name}"`);
    }
    return null;
  }

  return (
    <ResolvedIcon
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={`nx-icon ${className}`.trim()}
      aria-hidden={ariaHidden}
      {...rest}
    />
  );
}

export default Icon;
