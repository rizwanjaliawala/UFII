import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Banknote,
  Bell,
  Boxes,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  RefreshCw,
  Settings,
  Ship,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import type { ComponentType } from "react";
import clsx from "clsx";
import { BrandLogo } from "../components/startup/BrandLogo";

/**
 * Primary navigation (doc 03 §Main Navigation).
 *
 * 280px expanded, 80px collapsed (doc 02 §Navigation).
 *
 * "Container 360" is deliberately not a nav entry: it is contextual and needs
 * a container, so as a top-level item it would open an empty screen — which
 * doc 02 §Empty States forbids. It is reached by selecting any container, and
 * is deep-linkable at /containers/:containerNumber.
 */

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  badge?: number;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/containers", label: "Container Search", icon: Boxes },
  { to: "/pu-lfd", label: "PU / LFD", icon: Ship },
  { to: "/detention", label: "Detention & Demurrage", icon: FileText },
  { to: "/cost-analysis", label: "Cost Analysis", icon: Banknote },
  { to: "/vendors", label: "Vendor Management", icon: Truck },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/alerts", label: "Alerts & Reminders", icon: Bell },
  { to: "/ai", label: "AI Assistant", icon: Sparkles },
  { to: "/sync", label: "Synchronization", icon: RefreshCw },
  { to: "/administration", label: "Administration", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 280 }}
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
      className="glass relative z-20 flex shrink-0 flex-col border-y-0 border-l-0 border-r-[var(--color-border)]"
      aria-label="Main navigation"
    >
      {/* ---- Brand ---- */}
      <div className="flex h-[var(--header-height)] items-center gap-3 border-b border-[var(--color-border)] px-5">
        <span className="shrink-0 text-[var(--color-primary)]">
          <BrandLogo size={30} />
        </span>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, delay: 0.06 }}
            className="min-w-0 leading-none"
          >
            <div className="truncate text-[0.95rem] font-bold text-[var(--color-text-primary)]">
              Utopia TMS
            </div>
            <div className="mt-1 truncate text-[0.65rem] tracking-[0.14em] text-[var(--color-text-secondary)] uppercase">
              Enterprise Edition
            </div>
          </motion.div>
        )}
      </div>

      {/* ---- Navigation ---- */}
      <nav className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  clsx(
                    "group relative flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-[0.85rem] transition-colors duration-150",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "bg-[var(--color-primary-wash)] font-semibold text-[var(--color-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunk)] hover:text-[var(--color-text-primary)]",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active rail — a 3px emerald edge, not a full-bleed fill */}
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-[var(--color-primary)]"
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      />
                    )}
                    <item.icon size={18} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && !!item.badge && (
                      <span className="data ml-auto rounded-full bg-[var(--color-danger-wash)] px-1.5 py-0.5 text-[0.65rem] font-semibold text-[var(--color-danger)]">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---- Collapse ---- */}
      <div className="border-t border-[var(--color-border)] p-3">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={clsx(
            "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunk)] hover:text-[var(--color-text-primary)]",
            collapsed && "justify-center px-0",
          )}
        >
          <motion.span
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="flex shrink-0"
          >
            <ChevronLeft size={18} />
          </motion.span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
