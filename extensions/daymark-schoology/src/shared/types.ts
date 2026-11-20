export interface SchoologyCourse {
  externalId: string;
  name: string;
  url?: string;
  assignments: SchoologyAssignment[];
}

export interface SchoologyAssignment {
  externalId: string;
  courseExternalId: string;
  title: string;
  description?: string;
  url?: string;
  dueAt?: string | null;
  availableAt?: string | null;
  maxPoints?: number | null;
  completed?: boolean | null;
}

export interface SchoologySnapshot {
  pageUrl: string;
  scannedAt: string;
  courses: SchoologyCourse[];
  assignments: SchoologyAssignment[];
  warnings: string[];
}

export type ScanResult =
  | { kind: "unsupported" }
  | { kind: "schoology"; snapshot: SchoologySnapshot };

export interface ExtensionSettings {
  daymarkOrigin: string;
  schoologyHost?: string;
  token?: string;
  connectedAt?: string;
  pairingMessage?: string;
  pendingFlow?: PendingExtensionFlow | null;
}

export interface PendingExtensionFlow {
  flowId: string;
  pollToken: string;
  extensionToken: string;
  expiresAt: string;
}

export interface SyncResult {
  detectedCourses: number;
  detectedAssignments: number;
  imported: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

export const STORAGE_KEYS = {
  settings: "daymarkSettings",
  snapshot: "lastSchoologySnapshot",
  sync: "lastSyncResult",
} as const;
