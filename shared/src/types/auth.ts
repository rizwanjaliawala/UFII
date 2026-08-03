import type { ROLES } from "../constants.js";

export type Role = (typeof ROLES)[number];

/**
 * Application user.
 *
 * SECURITY: user records including password hashes are stored OUTSIDE
 * TMS Master. That sheet is shared to enable the Google integration, so
 * anyone with view access would otherwise read every hash and role, and an
 * editor could escalate their own privileges by typing in a cell.
 */
export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  mustChangePassword: boolean;
  createdBy: string;
  createdDate: string;
  updatedDate: string;
}

/** Never leaves the server. */
export interface UserCredentials {
  userId: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  rememberMe: boolean;
}

/* ------------------------------------------------------------------ */
/* Permissions (doc 09 §Permission Matrix)                             */
/* ------------------------------------------------------------------ */

export const PERMISSION_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "administer",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_MODULES = [
  "dashboard",
  "containers",
  "pu-lfd",
  "detention",
  "cost-analysis",
  "vendors",
  "reports",
  "alerts",
  "ai",
  "sync",
  "administration",
  "settings",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export type Permission = `${PermissionModule}:${PermissionAction}`;

/**
 * Role → permission mapping, derived directly from doc 09.
 * Enforced on the server for every endpoint; the client uses the same map
 * only to hide controls. Frontend checks are never the authority (doc 09).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[] | "*"> = {
  Administrator: "*",

  "Operations Manager": [
    "dashboard:view",
    "containers:view", "containers:create", "containers:edit", "containers:export",
    "pu-lfd:view", "pu-lfd:edit", "pu-lfd:approve",
    "detention:view", "detention:edit", "detention:approve", "detention:export",
    "cost-analysis:view", "cost-analysis:edit", "cost-analysis:approve", "cost-analysis:export",
    "vendors:view", "vendors:create", "vendors:edit", "vendors:export",
    "reports:view", "reports:export",
    "alerts:view", "alerts:create", "alerts:edit",
    "ai:view",
    "sync:view", "sync:create",
  ],

  Dispatcher: [
    "dashboard:view",
    "containers:view", "containers:edit",
    "pu-lfd:view", "pu-lfd:edit",
    "detention:view",
    "cost-analysis:view",
    "vendors:view",
    "reports:view",
    "alerts:view", "alerts:create",
    "ai:view",
    "sync:view",
  ],

  Finance: [
    "dashboard:view",
    "containers:view",
    "detention:view", "detention:approve", "detention:export",
    "cost-analysis:view", "cost-analysis:approve", "cost-analysis:export",
    "vendors:view",
    "reports:view", "reports:export",
    "ai:view",
  ],

  "Read Only": [
    "dashboard:view",
    "containers:view",
    "pu-lfd:view",
    "detention:view",
    "cost-analysis:view",
    "vendors:view",
    "reports:view",
    "alerts:view",
    "ai:view",
    "sync:view",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return granted === "*" || granted.includes(permission);
}

/** Audit record — doc 09 requires old and new values on every change. */
export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  username: string;
  action: string;
  module: PermissionModule | "auth" | "system";
  entityType: string | null;
  entityKey: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  ipAddress: string | null;
  device: string | null;
  status: "Success" | "Failure";
}
