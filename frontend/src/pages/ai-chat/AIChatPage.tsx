/**
 * AI Chat Page — conversational financial assistant.
 *
 * Features:
 * - Conversation list sidebar
 * - Real-time chat with markdown + inline chart rendering
 * - Provider status indicator
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Bot,
  User,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import { aiService, Conversation, ConversationDetail, ChatResponse } from "../../services/ai.service";
import ChatChart, { parseChartBlocks } from "../../components/chat/ChatChart";

interface DisplayMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

// Simple markdown renderer (bold, italic, headers, lists, code)
function renderMarkdown(text: string): string {
  return text
    // Code blocks (non-chart)
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-muted rounded p-2 my-1 text-xs overflow-x-auto"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded text-sm">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-lg mt-3 mb-1">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Unordered lists
    .replace(/^[-•] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Line breaks
    .replace(/\n/g, "<br />");
}

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === "user";
  const segments = isUser ? [{ type: "text" as const, content: msg.content }] : parseChartBlocks(msg.content);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-primary text-primary-foreground" : "bg-blue-100 text-blue-700"
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`max-w-[80%] ${isUser ? "text-right" : ""}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted rounded-tl-sm"
          }`}
        >
          {segments.map((seg, i) =>
            seg.type === "chart" ? (
              <ChatChart key={i} chart={seg.chart} />
            ) : (
              <div
                key={i}
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.content) }}
              />
            )
          )}
        </div>
        {msg.created_at && (
          <div className="text-[10px] text-muted-foreground mt-1 px-1">
            {new Date(msg.created_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const SUGGESTION_PROMPTS = [
  "Quel est mon solde actuel sur tous mes comptes ?",
  "Quelle est la répartition de mes dépenses ce mois-ci ?",
  "Comment a évolué mon cashflow ces 3 derniers mois ?",
  "Quelles sont mes plus grosses dépenses du mois ?",
];

export default function AIChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [providerStatus, setProviderStatus] = useState<{ provider: string; available: boolean } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations and provider status on mount
  useEffect(() => {
    loadConversations();
    loadProviderStatus();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  async function loadConversations() {
    try {
      const data = await aiService.listConversations();
      setConversations(data);
    } catch {
      // silently fail — conversations list is not critical
    }
  }

  async function loadProviderStatus() {
    try {
      const status = await aiService.getProviderStatus();
      setProviderStatus(status);
    } catch {
      setProviderStatus({ provider: "unknown", available: false });
    }
  }

  async function loadConversation(id: number) {
    try {
      const detail: ConversationDetail = await aiService.getConversation(id);
      setActiveConversation(id);
      setMessages(
        detail.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            metadata: m.metadata,
            created_at: m.created_at,
          }))
      );
    } catch {
      // Failed to load conversation
    }
  }

  function startNewConversation() {
    setActiveConversation(null);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function deleteConversation(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await aiService.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversation === id) {
        startNewConversation();
      }
    } catch {
      // ignore
    }
  }

  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text || input).trim();
      if (!content || loading) return;

      setInput("");
      const userMsg: DisplayMessage = {
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const response: ChatResponse = await aiService.chat({
          content,
          conversation_id: activeConversation || undefined,
        });

        // Update active conversation
        if (!activeConversation) {
          setActiveConversation(response.conversation_id);
        }

        const assistantMsg: DisplayMessage = {
          role: "assistant",
          content: response.message,
          metadata: response.metadata,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Refresh conversations list
        loadConversations();
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "Erreur lors de l'envoi du message";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Désolé, une erreur s'est produite : ${errorMessage}`,
            created_at: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, activeConversation]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const providerLabel =
    providerStatus?.provider === "OllamaChatProvider"
      ? "Ollama (local)"
      : providerStatus?.provider === "OpenAIChatProvider"
      ? "OpenAI"
      : "IA";

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar — conversations */}
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } flex-shrink-0 border-r bg-muted/30 transition-all duration-200 overflow-hidden`}
      >
        <div className="w-64 h-full flex flex-col">
          <div className="p-3 border-b">
            <button
              onClick={startNewConversation}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-dashed hover:bg-muted transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouvelle conversation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                Aucune conversation
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors text-sm ${
                    activeConversation === conv.id ? "bg-muted font-medium" : ""
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{conv.title}</span>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Provider status */}
          {providerStatus && (
            <div className="p-3 border-t text-xs flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  providerStatus.available ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-muted-foreground">
                {providerLabel}
                {providerStatus.available ? "" : " (indisponible)"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded hover:bg-muted transition-colors"
          >
            <ChevronLeft
              className={`w-4 h-4 transition-transform ${sidebarOpen ? "" : "rotate-180"}`}
            />
          </button>
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-sm">Assistant IA</span>
          {loading && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <Loader2 className="w-3 h-3 animate-spin" />
              Réflexion...
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="rounded-full bg-blue-100 p-4 mb-4">
                <Bot className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Assistant Financier IA</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Posez-moi des questions sur vos finances. J'analyse vos transactions,
                catégories et cashflow pour vous donner des insights personnalisés.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                {SUGGESTION_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-sm px-3 py-2.5 rounded-lg border hover:bg-muted transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
          )}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-blue-700" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Provider unavailable warning */}
        {providerStatus && !providerStatus.available && (
          <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Le provider {providerLabel} n'est pas disponible. Vérifiez la configuration.
          </div>
        )}

        {/* Input area */}
        <div className="border-t p-3 bg-background">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez une question sur vos finances..."
              rows={1}
              className="flex-1 resize-none rounded-xl border bg-muted/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center text-[10px] text-muted-foreground mt-1.5">
            L'IA analyse vos données financières réelles. Les réponses sont indicatives.
          </div>
        </div>
      </div>
    </div>
  );
}
