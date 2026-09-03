'use client';

import { LoaderCircle, MessageCircle, Send, X } from 'lucide-react';
import { FormEvent, useRef, useState } from 'react';
import styles from './support-chat.module.css';

type ChatSource = { title: string; href: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string; sources?: ChatSource[] };

const welcome: ChatMessage = { role: 'assistant', content: '您好，我是合軒科技的測試版網站助理。我可以協助您了解產品領域、代理品牌、聯絡方式與詢價流程。' };
const suggestions = ['有哪些食品分選方案？', 'X 光檢測能協助什麼？', '如何聯絡或詢價？'];

function errorMessage(code?: string) {
  if (code === 'rate_limited') return '目前詢問較多，請稍後一分鐘再試。';
  if (code === 'chat_not_configured') return '測試版聊天服務正在設定中，請稍後再試或直接聯絡合軒科技。';
  return '目前無法取得回覆，請稍後再試或直接使用詢價系統。';
}

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function send(text = value) {
    const message = text.trim();
    if (!message || sending) return;
    const priorMessages = messages.slice(1);
    const nextMessages = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextMessages);
    setValue('');
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: priorMessages }),
      });
      const payload = await response.json() as { answer?: string; error?: string; sources?: ChatSource[] };
      setMessages((current) => [...current, { role: 'assistant', content: response.ok && payload.answer ? payload.answer : errorMessage(payload.error), sources: response.ok ? payload.sources : undefined }]);
    } catch {
      setMessages((current) => [...current, { role: 'assistant', content: errorMessage() }]);
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return <>
    {open && <section id="support-chat-panel" className={styles.panel} aria-label="合軒科技網站助理">
      <header className={styles.header}><div><strong>合軒科技網站助理</strong><small>測試版｜公開資訊問答</small></div><button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label="關閉聊天"><X size={20} /></button></header>
      <div className={styles.messages} aria-live="polite">
        {messages.length === 1 && <div className={styles.suggestions}>{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)}>{suggestion}</button>)}</div>}
        {messages.map((message, index) => <div key={`${message.role}-${index}`}><p className={`${styles.message} ${message.role === 'user' ? styles.user : ''}`}>{message.content}</p>{message.role === 'assistant' && message.sources && message.sources.length > 0 && <div className={styles.sources}>參考網站內容：{message.sources.map((source) => <a href={source.href} key={source.href}>{source.title}</a>)}</div>}</div>)}
        {sending && <p className={styles.message}><LoaderCircle size={16} aria-label="正在回覆" /></p>}
      </div>
      <p className={styles.notice}>請勿輸入個資、報價或其他機密資訊。</p>
      <form className={styles.form} onSubmit={submit}><textarea ref={textareaRef} value={value} onChange={(event) => setValue(event.target.value)} maxLength={700} rows={2} placeholder="請輸入您的問題" aria-label="聊天問題" /><button type="submit" disabled={sending || !value.trim()} aria-label="送出問題"><Send size={18} /></button></form>
    </section>}
    <button className={styles.launcher} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="support-chat-panel" aria-label={open ? '關閉聊天' : '開啟聊天'}>{open ? <X size={26} /> : <MessageCircle size={27} />}</button>
  </>;
}
