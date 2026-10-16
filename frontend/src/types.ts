export type Role = "business" | "client";

export type QuestionType =
  | "rating_5"
  | "rating_10"
  | "nps"
  | "text"
  | "long_text"
  | "multiple_choice"
  | "checkbox"
  | "yes_no";

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Company {
  id: number;
  owner_id: number;
  name: string;
  description: string | null;
  notification_email: string | null;
  notify_on_response: boolean;
  created_at: string;
}

export interface ClientContact {
  id: number;
  company_id: number;
  email: string;
  full_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface Question {
  id: number;
  form_id: number;
  type: QuestionType;
  label: string;
  options: unknown;
  order: number;
  required: boolean;
}

export interface QuestionDraft {
  type: QuestionType;
  label: string;
  options?: unknown;
  order: number;
  required: boolean;
}

export interface Form {
  id: number;
  company_id: number;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  questions: Question[];
}

export interface PublicFormSummary {
  id: number;
  company_id: number;
  company_name: string;
  title: string;
  description: string | null;
  question_count: number;
}

export interface AnswerSubmit {
  question_id: number;
  value_text?: string;
  value_number?: number;
  value_options?: unknown;
}

export interface ResponseAnswer {
  id: number;
  response_id: number;
  question_id: number;
  value_text: string | null;
  value_number: number | null;
  value_options: unknown;
  sentiment_score: number | null;
  sentiment_label: string | null;
  keywords: unknown;
  question: Question;
}

export interface FeedbackResponse {
  id: number;
  form_id: number;
  client_id: number | null;
  submitted_at: string;
  overall_sentiment_score: number | null;
  overall_sentiment_label: string | null;
  answers: ResponseAnswer[];
}

export interface PaginatedResponses {
  total: number;
  limit: number;
  offset: number;
  items: FeedbackResponse[];
}

export interface LatestResponseSummary {
  id: number;
  form_id: number;
  form_title: string;
  client_id: number | null;
  submitted_at: string;
  overall_sentiment_score: number | null;
  overall_sentiment_label: string | null;
}

export interface OverviewAnalytics {
  total_forms: number;
  total_responses: number;
  active_forms: number;
  average_rating: number | null;
  sentiment_distribution: Record<string, number>;
  latest_responses: LatestResponseSummary[];
}

export interface FormAnalytics {
  form_id: number;
  title: string;
  total_responses: number;
  average_rating: Array<{
    question_id: number;
    label: string;
    type: string;
    average_rating: number | null;
    response_count: number;
  }>;
  choice_distribution: Array<{
    question_id: number;
    label: string;
    type: string;
    choices: Array<{ value: unknown; count: number }>;
  }>;
  sentiment_distribution: Record<string, number>;
  top_keywords: Array<{ keyword: string; count: number }>;
}

export interface FormInvitationResult {
  queued: number;
  assigned: number;
  smtp_configured: boolean;
  form_url: string;
}

export interface ClientContactInviteResult {
  queued: number;
  assigned: number;
  smtp_configured: boolean;
  form_url: string;
}
