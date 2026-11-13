import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  FileDown,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  User,
  X,
} from 'lucide-react';
import {
  sendChatbotMessage,
  WORKER_API_BASE,
  type ChatbotResponsePayload,
} from '../../services/apiClient';
import { triggerAcademicSync } from '../../stores/academicStore';

interface ChatbotWidgetProps {
  token?: string | null;
  studentName?: string;
}

interface ChatMessageItem {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  engineUsed?: string;
  latencyMs?: number;
  dataAttachment?: ChatbotResponsePayload['dataAttachment'];
}

const INITIAL_QUICK_REPLIES = [
  'Ver mis notas y promedio',
  '¿Cuánto necesito en el Corte 3?',
  'Generar certificado en PDF',
  'Calendario académico 2026-2',
];

function renderInlineMarkdown(line: string): React.ReactNode[] {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-usco-wine/25 text-usco-gold font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return token;
  });
}

function FormattedChatMessage({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 break-words">
      {lines.map((rawLine, i) => {
        const line = rawLine.trim();
        if (!line) return <div key={i} className="h-1" />;

        const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-2 pl-0.5">
              <span className="font-mono text-[11px] font-bold text-usco-gold shrink-0 mt-0.5">
                {numMatch[1]}.
              </span>
              <span className="flex-1">{renderInlineMarkdown(numMatch[2])}</span>
            </div>
          );
        }

        if (line.startsWith('• ') || line.startsWith('- ')) {
          return (
            <div key={i} className="flex items-start gap-2 pl-0.5">
              <span className="text-usco-gold font-bold shrink-0">•</span>
              <span className="flex-1">{renderInlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }

        return <p key={i}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

export default function ChatbotWidget({
  token = null,
  studentName = '',
}: ChatbotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preferredMode, setPreferredMode] = useState<'auto' | 'gemini' | 'groq' | 'deterministic'>(
    'auto'
  );
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(() => `usco-chat-${Date.now()}`);
  const [quickReplies, setQuickReplies] = useState<string[]>(INITIAL_QUICK_REPLIES);

  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      id: 'welcome-msg',
      sender: 'bot',
      text: `Hola${studentName ? ` ${studentName.split(' ')[0]}` : ''}. Soy el asistente académico de la Universidad Surcolombiana. Puedo consultar tus calificaciones, simular la nota requerida en el Corte 3 o expedir tu certificado oficial en PDF.`,
      timestamp: 'Ahora',
      engineUsed: 'USCO-ASISTENTE',
      latencyMs: 2,
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendText = async (rawText: string) => {
    const cleanText = rawText.trim();
    if (!cleanText || sending) return;

    const userMsg: ChatMessageItem = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: cleanText,
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
        token,
        sessionId,
        message: cleanText,
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
        latencyMs: response.latencyMs,
        dataAttachment: response.dataAttachment,
      };

      setMessages((prev) => [...prev, botMsg]);
      if (response.suggestedQuickReplies?.length) {
        setQuickReplies(
          response.suggestedQuickReplies.map((r) =>
            r.replace(/^[^\w¿¡]+\s*/, '')
          )
        );
      }
      if (
        response.toolCalled === 'generar_certificado_academico' ||
        response.dataAttachment?.type === 'CERTIFICATE_CARD'
      ) {
        triggerAcademicSync();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo procesar la consulta en este momento.';
      const fallbackMsg: ChatMessageItem = {
        id: `err-${Date.now()}`,
        sender: 'bot',
        text: msg,
        timestamp: new Date().toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        engineUsed: 'SISTEMA',
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
          className="mt-2.5 rounded-lg overflow-hidden border border-slate-700/90 bg-[#070A12] text-xs"
        >
          <div className="px-3 py-1.5 bg-usco-wine/30 border-b border-slate-800 flex items-center justify-between">
            <span className="font-semibold text-usco-gold">Resumen 2026-2</span>
            {attachment.pga !== undefined && (
              <span className="font-mono font-bold text-white">
                PGA: {Number(attachment.pga).toFixed(2)}
              </span>
            )}
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                <th className="py-1.5 px-2.5">Asignatura</th>
                <th className="py-1.5 px-1.5 text-center">C1</th>
                <th className="py-1.5 px-1.5 text-center">C2</th>
                <th className="py-1.5 px-1.5 text-center">C3</th>
                <th className="py-1.5 px-2 text-right">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {gradesList.map((row, i: number) => {
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
                      {c3 !== null ? Number(c3).toFixed(1) : 'En curso'}
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
      const jobId = attachment.jobId || attachment.id || '';
      const rawUrl = attachment.pdfUrl || `/api/certificates/${jobId}.pdf`;
      const pdfHref =
        rawUrl.startsWith('http') || rawUrl.startsWith('/api/certificates/')
          ? rawUrl
          : `${WORKER_API_BASE}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;

      return (
        <div
          data-testid="chatbot-certificate-attachment"
          className="mt-2.5 p-3 rounded-lg bg-[#070A12] border border-slate-700 space-y-2 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-usco-gold">Certificado Oficial Expedido</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              {attachment.status || 'COMPLETED'}
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
            className="w-full py-2 px-3 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Descargar Certificado PDF</span>
          </a>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex flex-col items-end">
      {/* Ventana de Chat Desplegable */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Asistente Virtual Académico USCO"
          data-testid="chatbot-window"
          className="mb-3 w-[calc(100vw-2rem)] sm:w-[400px] max-h-[580px] flex flex-col rounded-xl bg-[#0D1322] border border-slate-700/90 shadow-2xl overflow-hidden"
        >
          {/* Cabecera del Asistente */}
          <div className="usco-gradient px-4 py-3.5 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#070A12]/70 text-usco-gold border border-usco-gold/30">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    Asistente Académico USCO
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#070A12]/80 text-emerald-300 border border-emerald-800/70">
                      Activo
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Consultas de registro académico y certificados
                  </p>
                </div>
              </div>
              <button
                type="button"
                title="Reiniciar conversación"
                aria-label="Reiniciar conversación"
                onClick={() => {
                  setMessages((prev) => prev.slice(0, 1));
                  setQuickReplies(INITIAL_QUICK_REPLIES);
                }}
                className="p-1.5 rounded-lg text-slate-300 hover:bg-black/30 hover:text-white transition-colors shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Selector de Modo de Respuesta */}
            <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
              <label
                htmlFor="chatbot-engine-select"
                className="text-[11px] font-medium text-slate-200 shrink-0"
              >
                Tipo de respuesta:
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
                className="w-full min-w-0 px-2 py-1 rounded bg-[#070A12]/90 border border-slate-700 text-[11px] text-white font-medium focus:border-usco-gold focus:outline-none"
              >
                <option value="auto">Recomendado</option>
                <option value="gemini">Conversacional</option>
                <option value="deterministic">Respuesta rápida</option>
                <option value="groq">Conversacional alternativo</option>
              </select>
            </div>
          </div>

          {/* Historial de Mensajes */}
          <div
            data-testid="chatbot-messages-list"
            className="flex-1 p-3.5 space-y-3 overflow-y-auto max-h-[310px] bg-[#070A12]/90"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-usco-wine text-white border border-usco-gold/25 rounded-br-sm'
                      : 'bg-[#0D1322] text-slate-100 border border-slate-800 rounded-bl-sm'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                    {msg.sender === 'user' ? (
                      <>
                        <User className="w-3 h-3 text-usco-gold" />
                        <span className="text-slate-200">Estudiante</span>
                      </>
                    ) : (
                      <>
                        <span className="text-usco-gold font-medium">Asistente USCO</span>
                      </>
                    )}
                  </div>
                  <FormattedChatMessage text={msg.text} />
                  {msg.sender === 'bot' && renderDataAttachment(msg.dataAttachment || null)}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-slate-300 px-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-usco-gold" />
                <span>Consultando expediente académico...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Botones de Consulta Rápida */}
          <div className="px-3 py-2 bg-[#0D1322] border-t border-slate-800">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">
              Consultas frecuentes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickReplies.map((qText) => (
                <button
                  key={qText}
                  type="button"
                  disabled={sending}
                  onClick={() => handleSendText(qText)}
                  className="px-2.5 py-1 rounded-md bg-[#070A12] hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 text-[11px] transition-colors"
                >
                  {qText}
                </button>
              ))}
            </div>
          </div>

          {/* Input de Envío */}
          <form
            onSubmit={handleFormSubmit}
            className="p-2.5 bg-[#070A12] border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              data-testid="chatbot-input"
              aria-label="Escribe tu consulta para el asistente académico"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Escribe tu consulta académica..."
              className="flex-1 px-3 py-2 rounded-lg bg-[#0D1322] border border-slate-700/90 text-xs text-white placeholder-slate-500 focus:border-usco-gold focus:outline-none"
            />
            <button
              type="submit"
              data-testid="chatbot-send-btn"
              disabled={sending || !inputValue.trim()}
              aria-label="Enviar mensaje al asistente"
              className="p-2 rounded-lg bg-usco-wine hover:bg-usco-wineLight text-white border border-usco-gold/30 transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Botón Flotante Principal (Sin ping desbordado) */}
      <button
        type="button"
        data-testid="chatbot-toggle-btn"
        aria-label={isOpen ? 'Cerrar asistente académico' : 'Abrir asistente académico USCO'}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 p-3 sm:px-4 sm:py-2.5 rounded-full sm:rounded-lg bg-usco-wine hover:bg-usco-wineLight text-white border border-usco-gold/50 shadow-xl transition-colors"
      >
        {isOpen ? (
          <>
            <X className="w-5 h-5 sm:w-4 sm:h-4 text-usco-gold" />
            <span className="hidden sm:inline text-xs font-semibold tracking-tight">Cerrar asistente</span>
          </>
        ) : (
          <>
            <MessageSquare className="w-5 h-5 sm:w-4 sm:h-4 text-usco-gold" />
            <span className="hidden sm:inline text-xs font-semibold tracking-tight">Asistente Académico</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </>
        )}
      </button>
    </div>
  );
}
