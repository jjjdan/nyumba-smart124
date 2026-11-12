import { api } from './client';

export interface FeedbackReply {
  id: string;
  message: string;
  userId?: string;
  createdAt?: string;
}

export interface Feedback {
  id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  userName?: string;
  createdAt?: string;
  replies: FeedbackReply[];
}

export async function listFeedback(): Promise<Feedback[]> {
  const res = await api.get<{ feedback: Feedback[] }>('/feedback');
  return res.feedback || [];
}

export async function submitFeedback(subject: string, message: string): Promise<Feedback> {
  const res = await api.post<{ feedback: Feedback }>('/feedback', { subject, message });
  return res.feedback;
}

export async function replyToFeedback(id: string, message: string): Promise<FeedbackReply> {
  const res = await api.post<{ reply: FeedbackReply }>(`/feedback/${id}/reply`, { message });
  return res.reply;
}

export async function resolveFeedback(id: string): Promise<Feedback> {
  const res = await api.patch<{ feedback: Feedback }>(`/feedback/${id}/resolve`);
  return res.feedback;
}
