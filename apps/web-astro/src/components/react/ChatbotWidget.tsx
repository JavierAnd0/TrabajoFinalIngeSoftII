import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Cpu,
  FileDown,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  User,
  X,
  Zap,
} from 'lucide-react';
import {
  getStoredUser,
  sendChatbotMessage,
  WORKER_API_BASE,
  type ChatbotResponsePayload,
} from '../../services/apiClient';
import { triggerAcademicSync } from '../../stores/academicStore';

interface ChatMessageItem {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  engineUsed?: string;
  intentDetected?: string;
  toolCalled?: string | null;
  latencyMs?: number;
  dataAttachment?: ChatbotResponsePayload['dataAttachment'];
}

interface ChatbotWidgetProps {
  defaultStudentId?: string;
  studentName?: string;
}

const DEFAULT_QUICK_REPLIES = [
  '📊 Ver mis notas y promedio',
  '🎯 ¿Cuánto necesito en el Corte 3?',
  '📄 Generar certificado en PDF',
  '📅 Horario y fechas de matrícula',
];

export default function ChatbotWidget({
  defaultStudentId = '44444444-4444-4444-8444-444444444403',
  studentName = 'Álvaro Javier Andrade',
}: ChatbotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preferredMode, setPreferredMode] = useState<
    'auto' | 'gemini' | 'groq' | 'deterministic'
  >('auto');
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(
    () => `sess-usco-${Math.random().toString(36).slice(2, 9)}`
  );
  const [quickReplies, setQuickReplies] = useState<string[]>(DEFAULT_QUICK_REPLIES);

  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      id: 'welcome-msg',
      sender: 'bot',
      text: `¡Hola ${studentName}! Soy USCO-Bot IA, tu asistente académico distribuido (Arquitectura Híbrida con Function Calling + Motor Determinista < 5 ms). ¿En qué te puedo colaborar hoy?`,
      timestamp: new Date().toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      engineUsed: 'HYBRID_READY',
      latencyMs: 2,
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const resolveActiveStudentId = (): string => {
    const stored = getStoredUser();
    if (stored && stored.role === 'STUDENT' && stored.id) {
      return stored.id;
    }
    return defaultStudentId;
  };

  const handleSendText = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessageItem = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setSending(true);

    try {
      const response = await sendChatbotMessage({
        studentId: resolveActiveStudentId(),
        sessionId,
        message: trimmed,
        preferredMode,
      });

      const botMsg: ChatMessageItem = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        engineUsed: response.engineUsed,
        intentDetected: response.intentDetected,
        toolCalled: response.toolCalled,
        latencyMs: response.latencyMs,
        dataAttachment: response.dataAttachment,
      };

      setMessages((prev) => [...prev, botMsg]);
      if (response.suggestedQuickReplies?.length) {
        setQuickReplies(response.suggestedQuickReplies);
      }
      if (
        response.toolCalled === 'generar_certificado_academico' ||
        response.dataAttachment?.type === 'CERTIFICATE_CARD'
      ) {
        triggerAcademicSync();
      }
    } catch (err: any) {
      const fallbackMsg: ChatMessageItem = {
        id: `err-${Date.now()}`,
        sender: 'bot',
        text:
          err?.message ||
          'No se pudo contactar con el microservicio Chatbot IA en el puerto 4003.',
        timestamp: new Date().toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        engineUsed: 'FALLBACK_ERROR',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendText(inputValue);
  };

  const renderDataAttachment = (attachment: ChatbotResponsePayload['dataAttachment']) => {
    if (!attachment) return null;

    const type = attachment.type;
    const gradesList =
      attachment.enrollments || attachment.courses || attachment.grades || [];

    if (type === 'GRADES_TABLE' && Array.isArray(gradesList) && gradesList.length > 0) {
      return (
        <div
          data-testid="chatbot-grades-attachment"
          className="mt-2.5 rounded-xl overflow-hidden border border-slate-700 bg-slate-950/90 text-xs"
        >
          <div className="px-3 py-1.5 bg-usco-wine/40 border-b border-slate-700 flex items-center justify-between">
            <span className="font-bold text-usco-gold">Resumen Académico 2026-2</span>
            {attachment.pga !== undefined && (
              <span className="font-mono font-bold text-white">
                PGA: {Number(attachment.pga).toFixed(2)}
              </span>
            )}
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                <th className="py-1.5 px-2.5">Curso</th>
                <th className="py-1.5 px-1.5 text-center">C1</th>
                <th className="py-1.5 px-1.5 text-center">C2</th>
                <th className="py-1.5 px-1.5 text-center">C3</th>
                <th className="py-1.5 px-2 text-right">Def.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {gradesList.map((row: any, i: number) => {
                const c1 = row.cut1 ?? row.grade?.cut1 ?? null;
                const c2 = row.cut2 ?? row.grade?.cut2 ?? null;
                const c3 = row.cut3 ?? row.grade?.cut3 ?? null;
                const def = row.finalGrade ?? row.grade?.finalGrade ?? 0;
                return (
                  <tr key={i} className="text-[11px]">
                    <td className="py-1.5 px-2.5 font-medium text-white">
                      <span className="font-mono text-usco-gold">
                        {row.courseCode || row.code}
                      </span>{' '}
                      <span className="text-slate-300 truncate block max-w-[130px]">
                        {row.courseName || row.name}
                      </span>
                    </td>
                    <td className="py-1.5 px-1.5 text-center font-mono text-slate-200">
                      {c1 !== null ? Number(c1).toFixed(1) : '—'}
                    </td>
                    <td className="py-1.5 px-1.5 text-center font-mono text-slate-200">
                      {c2 !== null ? Number(c2).toFixed(1) : '—'}
                    </td>
                    <td className="py-1.5 px-1.5 text-center font-mono text-amber-300">
                      {c3 !== null ? Number(c3).toFixed(1) : 'Pend.'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-400">
                      {Number(def).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    if (
      type === 'CERTIFICATE_CARD' ||
      attachment.jobId ||
      attachment.verificationCode ||
      attachment.pdfUrl
    ) {
      const jobId = attachment.jobId || attachment.id || '88888888-8888-4888-8888-888888888801';
      const rawUrl = attachment.pdfUrl || `${WORKER_API_BASE}/public/certificates/${jobId}.pdf`;
      const pdfHref = rawUrl.startsWith('http')
        ? rawUrl
        : `${WORKER_API_BASE}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;

      return (
        <div
          data-testid="chatbot-certificate-attachment"
          className="mt-2.5 p-3 rounded-xl bg-slate-950 border border-usco-gold/40 space-y-2 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-usco-gold">Certificado Académico Oficial</span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
              {attachment.status || 'READY'}
            </span>
          </div>
          {attachment.verificationCode && (
            <p className="font-mono text-[11px] text-slate-300">
              Código QR: <strong className="text-white">{attachment.verificationCode}</strong>
            </p>
          )}
          <a
            href={pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="chatbot-certificate-download-btn"
            className="w-full py-2 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold flex items-center justify-center gap-1.5 transition-all"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Descargar Certificado PDF con QR</span>
          </a>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Ventana de Chat Desplegable */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Asistente Virtual Académico USCO-Bot IA"
          data-testid="chatbot-window"
          className="mb-3 w-[360px] sm:w-[410px] max-h-[600px] flex flex-col rounded-2xl bg-slate-900 border border-usco-gold/40 shadow-2xl overflow-hidden"
        >
          {/* Cabecera del Chatbot + Selector de Motor en Vivo */}
          <div className="usco-gradient p-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-950/60 text-usco-gold border border-usco-gold/40">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    USCO-Bot IA
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/90 text-emerald-300 border border-emerald-700">
                      Online :4003
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-200">
                    Function Calling + Árbol Determinista (&lt; 5 ms)
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cerrar asistente virtual"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-200 hover:bg-slate-950/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selector de Motor en Vivo */}
            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between gap-2">
              <label
                htmlFor="chatbot-engine-select"
                className="text-[11px] font-semibold text-usco-gold flex items-center gap-1 shrink-0"
              >
                <Cpu className="w-3.5 h-3.5" /> Motor IA:
              </label>
              <select
                id="chatbot-engine-select"
                data-testid="chatbot-mode-selector"
                value={preferredMode}
                onChange={(e) =>
                  setPreferredMode(
                    e.target.value as 'auto' | 'gemini' | 'groq' | 'deterministic'
                  )
                }
                className="w-full px-2.5 py-1 rounded-lg bg-slate-950/90 border border-usco-gold/40 text-xs text-white font-medium focus:outline-none"
              >
                <option value="auto">Auto (Híbrido IA + Fallback Determinista)</option>
                <option value="gemini">IA Gratuita (Gemini / Groq Function Calling)</option>
                <option value="deterministic">Árbol de Reglas Deterministas (&lt; 5 ms)</option>
                <option value="groq">Groq Llama 3.3 70B Function Calling</option>
              </select>
            </div>
          </div>

          {/* Historial de Mensajes */}
          <div
            data-testid="chatbot-messages-list"
            className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[320px] bg-slate-950/70"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-usco-wine text-white border border-usco-gold/30 rounded-br-sm'
                      : 'bg-slate-900 text-slate-100 border border-slate-800 rounded-bl-sm'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 opacity-75 text-[10px]">
                    {msg.sender === 'user' ? (
                      <>
                        <User className="w-3 h-3 text-usco-gold" />
                        <span>Estudiante</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-usco-gold" />
                        <span className="font-mono text-usco-gold">
                          {msg.engineUsed || 'USCO-BOT'}
                        </span>
                        {msg.latencyMs !== undefined && (
                          <span className="font-mono text-emerald-400">
                            · {msg.latencyMs}ms
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <p className="whitespace-pre-line">{msg.text}</p>
                  {msg.sender === 'bot' && renderDataAttachment(msg.dataAttachment || null)}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-usco-gold px-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Ejecutando consulta académica en tiempo real...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Botones de Consulta Rápida */}
          <div className="px-3 py-2 bg-slate-900 border-t border-slate-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
              <Zap className="w-3 h-3 text-usco-gold" /> Consultas Rápidas en 1 Clic:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickReplies.map((qText) => (
                <button
                  key={qText}
                  type="button"
                  disabled={sending}
                  onClick={() => handleSendText(qText)}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-usco-wine/40 text-slate-200 hover:text-white border border-slate-800 hover:border-usco-gold/40 text-[11px] transition-all"
                >
                  {qText}
                </button>
              ))}
            </div>
          </div>

          {/* Input de Envío */}
          <form
            onSubmit={handleFormSubmit}
            className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              data-testid="chatbot-input"
              aria-label="Escribe tu consulta para el asistente académico"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ej: ¿Cuánto necesito en el Corte 3?"
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:border-usco-gold focus:outline-none"
            />
            <button
              type="submit"
              data-testid="chatbot-send-btn"
              disabled={sending || !inputValue.trim()}
              aria-label="Enviar mensaje al asistente"
              className="p-2.5 rounded-xl bg-usco-wine hover:bg-usco-wineLight text-usco-gold border border-usco-gold/40 transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Botón Flotante Principal */}
      <button
        type="button"
        data-testid="chatbot-toggle-btn"
        aria-label={isOpen ? 'Cerrar USCO-Bot IA' : 'Abrir Asistente Académico USCO-Bot IA'}
        onClick={() => setIsOpen((prev) => !prev)}
        className="group flex items-center gap-2.5 px-4 py-3 rounded-full usco-gradient text-white border-2 border-usco-gold shadow-2xl hover:scale-105 transition-all"
      >
        <MessageSquare className="w-5 h-5 text-usco-gold" />
        <span className="text-xs font-bold tracking-wide">USCO-Bot IA</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
      </button>
    </div>
  );
}
