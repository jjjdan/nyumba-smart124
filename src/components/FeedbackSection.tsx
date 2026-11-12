import React, { useEffect, useState } from 'react';
import * as feedbackApi from '../api/feedback';

interface FeedbackSectionProps {
  isAdmin?: boolean;
}

export default function FeedbackSection({ isAdmin = false }: FeedbackSectionProps) {
  const [items, setItems] = useState<feedbackApi.Feedback[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setItems(await feedbackApi.listFeedback()); } catch { setItems([]); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    try {
      await feedbackApi.submitFeedback(subject.trim(), message.trim());
      setSubject(''); setMessage(''); await load();
    } finally { setBusy(false); }
  };

  return (
    <section className="p-4 rounded-xl bg-[#131318] border border-white/5 space-y-3">
      <div>
        <h3 className="text-xs font-black text-white uppercase tracking-wider">
          {isAdmin ? 'User feedback' : 'Share feedback'}
        </h3>
        {!isAdmin && <p className="text-[11px] text-neutral-500 mt-1">Tell us what we can improve.</p>}
      </div>
      {!isAdmin && (
        <form onSubmit={submit} className="space-y-2">
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
            className="w-full bg-black/30 border border-white/10 rounded px-2.5 py-2 text-xs text-white" />
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Your feedback"
            rows={3} className="w-full bg-black/30 border border-white/10 rounded px-2.5 py-2 text-xs text-white" />
          <button disabled={busy} className="px-3 py-2 rounded bg-indigo-500/20 text-indigo-300 text-xs font-bold">
            {busy ? 'Sending…' : 'Send feedback'}
          </button>
        </form>
      )}
      <div className="space-y-2">
        {items.length === 0 && <p className="text-xs text-neutral-600">No feedback yet.</p>}
        {items.map(item => (
          <div key={item.id} className="rounded-lg bg-black/20 border border-white/5 p-3">
            <div className="flex justify-between gap-2">
              <span className="text-xs font-bold text-white">{item.subject}</span>
              <span className="text-[10px] uppercase text-neutral-500">{item.status.replace('_', ' ')}</span>
            </div>
            {isAdmin && item.userName && <p className="text-[10px] text-neutral-500 mt-1">{item.userName}</p>}
            <p className="text-xs text-neutral-300 mt-2">{item.message}</p>
            {item.replies?.map(r => <p key={r.id} className="text-[11px] text-indigo-300 mt-2 border-l border-indigo-400/40 pl-2">{r.message}</p>)}
            {isAdmin && item.status !== 'resolved' && (
              <div className="flex gap-2 mt-3">
                <input value={reply[item.id] || ''} onChange={e => setReply({ ...reply, [item.id]: e.target.value })}
                  placeholder="Reply" className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
                <button onClick={async () => { if (reply[item.id]?.trim()) { await feedbackApi.replyToFeedback(item.id, reply[item.id].trim()); setReply({ ...reply, [item.id]: '' }); await load(); } }}
                  className="text-[10px] font-bold text-indigo-300">Reply</button>
                <button onClick={async () => { await feedbackApi.resolveFeedback(item.id); await load(); }}
                  className="text-[10px] font-bold text-emerald-300">Resolve</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
