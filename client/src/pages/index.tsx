import {
  Banknote,
  FileText,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ModulePlaceholder } from "./ModulePlaceholder";

/**
 * Route surfaces.
 *
 * Built modules are re-exported from their own files; the rest render a
 * placeholder that states the phase they are scheduled for rather than a
 * hollow layout — see docs/_REVIEW-and-IMPLEMENTATION-PLAN.md §5.
 */

export { DashboardPage } from "./DashboardPage";
export { VendorsPage } from "./VendorsPage";
export { PuLfdPage } from "./PuLfdPage";
export { AlertsPage } from "./AlertsPage";
export { DetentionPage } from "./DetentionPage";

export const CostAnalysisPage = () => (
  <ModulePlaceholder
    title="Cost Analysis"
    description="True cost per container — estimated until an invoice arrives, then actual, with the estimate retained for variance."
    phase="Phase 4"
    icon={Banknote}
    capabilities={["Expected cost engine", "Variance analysis", "13 charge categories", "Forecasting"]}
  />
);



export const ReportsPage = () => (
  <ModulePlaceholder
    title="Reports"
    description="Operational, vendor, cost, D&D, container, synchronization and email reporting."
    phase="Phase 4"
    icon={FileText}
    capabilities={["PDF", "Excel", "CSV", "Scheduled reports"]}
  />
);

export const AiAssistantPage = () => (
  <ModulePlaceholder
    title="AI Assistant"
    description="Fifteen agents monitoring operations, email, OCR, invoices, cost, vendors and risk."
    phase="Phase 4"
    icon={Sparkles}
    capabilities={["AI Operations Center", "Recommendations", "Risk scoring", "Natural-language search"]}
  />
);

export const SynchronizationPage = () => (
  <ModulePlaceholder
    title="Synchronization"
    description="Source sheet status, the nine-stage pipeline, conflict queue and data-quality issues."
    phase="Phase 1 — in progress"
    icon={RefreshCw}
    capabilities={["Refresh Data", "Conflict queue", "Sync log", "Data quality"]}
  />
);

export const AdministrationPage = () => (
  <ModulePlaceholder
    title="Administration"
    description="Users, roles, permissions, system health, configuration and the audit trail."
    phase="Phase 5"
    icon={ShieldCheck}
    capabilities={["User management", "RBAC", "Audit trail", "Feature flags", "Health dashboard"]}
  />
);

export const SettingsPage = () => (
  <ModulePlaceholder
    title="Settings"
    description="Refresh interval, notifications, email processing, cost rules and reminder timing."
    phase="Phase 5"
    icon={Settings}
    capabilities={["Sync interval", "Notifications", "Cost rules", "Reminder timing"]}
  />
);
