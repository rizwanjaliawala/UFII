/**
 * Vendor / party records.
 *
 * A "vendor" in the UI is the trucker. KPI attribution is deliberately split
 * because the source data distinguishes who hauled a container from who paid
 * for its delays:
 *
 *   onTimePickupRate, avgDelayHours, appointmentCompliance, responseTime
 *     → scored against `trucker` (they control these)
 *   ddCostAttributable
 *     → scored against `responsibleParty` (they absorbed the cost)
 *
 * Attributing D&D to the trucker when Utopia accepted responsibility would
 * produce false vendor scores and drive wrong commercial decisions.
 */
export interface Vendor {
  name: string; // primary key
  email: string | null;
  phone: string | null;
  dispatcherName: string | null;
  /** Email domain used to match inbound mail to this vendor. */
  domain: string | null;
  active: boolean;
  kpi: VendorKpi;
  lastContact: string | null;
  createdDate: string;
  updatedDate: string;
}

export interface VendorKpi {
  /** Rolling window these figures were computed over. */
  windowDays: number;
  computedAt: string;

  /* Operational — attributed to the trucker */
  activeContainers: number;
  completedContainers: number;
  onTimePickupRate: number; // 0–1
  avgDelayHours: number;
  appointmentCompliance: number; // 0–1

  /* Communication */
  avgResponseHours: number;
  reminderResponseRate: number; // 0–1
  outstandingReminders: number;

  /* Financial — attributed to the responsible party */
  avgCostPerContainer: number;
  ddCostAttributable: number;

  /** Composite 0–100. See scoring service for weighting. */
  score: number;
}

/** Point-in-time KPI snapshot, retained so trends survive recomputation. */
export interface VendorKpiSnapshot {
  vendorName: string;
  capturedAt: string;
  score: number;
  onTimePickupRate: number;
  avgResponseHours: number;
  ddCostAttributable: number;
  activeContainers: number;
}
