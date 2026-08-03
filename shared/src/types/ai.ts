/**
 * AI agent domain (doc 08).
 *
 * Agents observe, analyse, recommend and predict. They never silently change
 * operational data — every recommendation that would alter a record requires
 * human approval (doc 08 §Human Approval, doc 11 §AI Rules).
 *
 * Agents do not call each other; they communicate through TMS Master.
 */

export const AGENT_IDS = [
  "operations-monitoring",
  "email-intelligence",
  "ocr",
  "invoice-intelligence",
  "cost-intelligence",
  "vendor-performance",
  "reminder",
  "document-intelligence",
  "synchronization",
  "container-health",
  "predictive-risk",
  "executive-insights",
  "ai-search",
  "recommendation",
  "data-quality",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

/**
 * Agents that need a language model. The remaining eleven are deterministic
 * rule engines — auditable and unit-tested, which matters because they drive
 * cost and vendor decisions.
 */
export const GENERATIVE_AGENTS: AgentId[] = [
  "email-intelligence",
  "executive-insights",
  "ai-search",
  "recommendation",
];

export interface AgentDefinition {
  id: AgentId;
  name: string;
  purpose: string;
  requiresLlm: boolean;
  /** Event-driven agents run after the named pipeline stage. */
  schedule: "manual" | "on-sync" | "interval" | "event";
  intervalMinutes: number | null;
  enabled: boolean;
}

export interface AgentRun {
  id: string;
  agentId: AgentId;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: "Running" | "Success" | "Failed" | "Skipped";
  itemsProcessed: number;
  recommendationsGenerated: number;
  error: string | null;
  /** Set when the run used the LLM, so cost and latency are attributable. */
  llmCalls: number;
  llmTokens: number | null;
}

export type RecommendationKind =
  | "Assign Vendor"
  | "Schedule Pickup"
  | "Request Appointment"
  | "Contact Vendor"
  | "Contact Terminal"
  | "Send Reminder"
  | "Review Invoice"
  | "Approve OCR"
  | "Investigate Delay"
  | "Verify Cost"
  | "Resolve Conflict"
  | "Fix Data Quality";

export interface Recommendation {
  id: string;
  agentId: AgentId;
  createdAt: string;
  containerNumber: string | null;
  entityType: "container" | "invoice" | "vendor" | "sync" | "system";
  entityKey: string | null;
  kind: RecommendationKind;
  priority: "Low" | "Medium" | "High" | "Critical";
  title: string;
  detail: string;
  confidence: number; // 0–1
  /** Never executed automatically — a human accepts or dismisses. */
  status: "Open" | "Accepted" | "Dismissed" | "Expired";
  actionedBy: string | null;
  actionedAt: string | null;
}

export interface RiskAssessment {
  containerNumber: string;
  assessedAt: string;
  level: "Low" | "Medium" | "High" | "Critical";
  score: number; // 0–100
  factors: RiskFactor[];
  expectedDdCost: number | null;
  confidence: number;
}

export interface RiskFactor {
  factor: string;
  weight: number;
  contribution: number;
  detail: string;
}

export interface HealthAssessment {
  containerNumber: string;
  assessedAt: string;
  score: number; // 0–100
  status: "Healthy" | "Attention" | "At Risk" | "Critical";
  components: {
    appointment: number;
    vendorResponse: number;
    invoice: number;
    lfd: number;
    documents: number;
    cost: number;
    timeline: number;
  };
}

/** Every AI action is logged with input, output, confidence and duration. */
export interface AgentLogEntry {
  id: string;
  at: string;
  agentId: AgentId;
  runId: string;
  input: string;
  output: string;
  confidence: number | null;
  processingMs: number;
  error: string | null;
}

/**
 * LLM abstraction. Agents depend on this, never on a vendor SDK, so the
 * model or provider can change without touching agent logic. When no key is
 * configured the provider degrades to templated output and the application
 * stays fully usable (doc 10 §Disaster Recovery).
 */
export interface LlmRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  tokensUsed: number | null;
  model: string;
  /** True when generated without a model call. */
  fallback: boolean;
}
