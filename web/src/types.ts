export type Priority = "immediate" | "prompt" | "routine" | "answered";
export type IntakeStatus = "new" | "acknowledged" | "on_the_way" | "resolved";
export type NoteStatus = "pending" | "approved" | "rejected";

export interface Intake {
  id: string;
  room: string;
  resident_name: string;
  created_at: string;
  raw_request: string;
  summary: string;
  category: string;
  model_urgency: string;
  priority: Priority;
  confidence: string;
  needs_staff: boolean;
  status: IntakeStatus;
  suggested_action: string;
  rationale: string;
  answer_given: string | null;
  source: string;
}

export interface NoteCandidate {
  id: string;
  intake_id: string;
  room: string;
  resident_name: string;
  content: string;
  source_quote: string;
  created_at: string;
  status: NoteStatus;
}

export interface DashboardStats {
  waiting: number;
  immediate: number;
  acknowledged: number;
  answered_today: number;
}

export interface DashboardData {
  requests: Intake[];
  notes: NoteCandidate[];
  stats: DashboardStats;
}

export interface PublicConfig {
  facility_name: string;
  resident_name: string;
  room: string;
  agent_phone: string | null;
}
