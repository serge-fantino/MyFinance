/**
 * AI Chat Page — conversational financial assistant.
 *
 * v2: dataviz query engine architecture
 *   - Charts come as {viz, data} from the backend (not parsed from markdown)
 *   - Account selector sends account_ids scope with each message
 *   - LLM never sees raw data — integrity guaranteed
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
  ChevronRight,
  ChevronDown,
  Sparkles,
  Wallet,
  Check,
  Bug,
} from "lucide-react";
import { aiService, Conversation, ConversationDetail, ChatResponse } from "../../services/ai.service";
import type { DebugInfo } from "../../services/ai.service";
import { accountService } from "../../services/account.service";
import type { Account } from "../../types/account.types";
import ChatChart from "../../components/chat/ChatChart";
import type { ChartResult } from "../../components/chat/ChatChart";

interface DisplayMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  charts?: ChartResult[];
  debugInfo?: DebugInfo | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  isError?: boolean;
}

// Simple markdown renderer (bold, italic, headers, lists, code)
function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-muted rounded p-2 my-1 text-xs overflow-x-auto"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded text-sm">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-lg mt-3 mb-1">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[-\u2022] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n/g, "<br />");
}

function DebugPanel({ debug }: { debug: DebugInfo }) {
  const [open, setOpen] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());

  const toggleBlock = (idx: number) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="mt-2 border border-amber-200 bg-amber-50/50 rounded-lg text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-amber-700 hover:bg-amber-100/50 transition-colors rounded-lg"
      >
        <Bug className="w-3 h-3" />
        <span className="font-medium">Debug</span>
        <span className="text-amber-500 ml-1">
          {debug.dataviz_blocks_found} bloc{debug.dataviz_blocks_found !== 1 ? "s" : ""}
          {" \u00b7 "}LLM {debug.llm_duration_ms ? `${(debug.llm_duration_ms / 1000).toFixed(1)}s` : "?"}
          {" \u00b7 "}prompt {(debug.system_prompt_length / 1000).toFixed(1)}k chars
        </span>
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* Top-level error */}
          {debug.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 text-xs">
              <span className="font-medium">Erreur : </span>{debug.error}
            </div>
          )}

          {/* Summary */}
          <div className="flex flex-wrap gap-3 text-[11px] text-amber-700">
            <span>Scope: {debug.account_scope.length} comptes (IDs: {debug.account_scope.join(", ")})</span>
          </div>

          {/* LLM raw response */}
          <div>
            <div className="font-medium text-amber-700 mb-1">Réponse LLM brute :</div>
            <pre className="bg-white border border-amber-200 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap text-[10px] text-gray-700">
              {debug.llm_raw_response}
            </pre>
          </div>

          {/* Block traces */}
          {debug.block_traces.map((trace, idx) => (
            <div key={idx} className="border border-amber-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleBlock(idx)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-amber-100/50 transition-colors ${
                  trace.error ? "bg-red-50" : "bg-white"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${trace.error ? "bg-red-500" : "bg-green-500"}`} />
                <span className="font-medium text-amber-800">
                  Bloc #{idx + 1}: {(trace.viz as Record<string, unknown>)?.chart as string || "?"} &mdash; {(trace.viz as Record<string, unknown>)?.title as string || "sans titre"}
                </span>
                {trace.row_count != null && (
                  <span className="text-amber-500">{trace.row_count} lignes</span>
                )}
                {trace.duration_ms != null && (
                  <span className="text-amber-500">{trace.duration_ms.toFixed(0)}ms</span>
                )}
                <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${expandedBlocks.has(idx) ? "rotate-180" : ""}`} />
              </button>

              {expandedBlocks.has(idx) && (
                <div className="px-2.5 pb-2.5 space-y-2 bg-white">
                  {/* Query DSL */}
                  <div>
                    <div className="font-medium text-amber-700 mb-0.5">Query DSL :</div>
                    <pre className="bg-gray-50 border rounded p-1.5 overflow-x-auto text-[10px] text-gray-700 max-h-32 overflow-y-auto">
                      {JSON.stringify(trace.query, null, 2)}
                    </pre>
                  </div>

                  {/* SQL */}
                  {trace.sql && (
                    <div>
                      <div className="font-medium text-amber-700 mb-0.5">SQL compilé :</div>
                      <pre className="bg-gray-50 border rounded p-1.5 overflow-x-auto text-[10px] text-gray-700 max-h-32 overflow-y-auto">
                        {trace.sql}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {trace.error && (
                    <div className="bg-red-50 border border-red-200 rounded p-1.5 text-red-700">
                      {trace.error}
                    </div>
                  )}

                  {/* Data sample */}
                  {trace.data_sample.length > 0 && (
                    <div>
                      <div className="font-medium text-amber-700 mb-0.5">
                        Données ({trace.row_count} lignes, {trace.data_sample.length} affichées) :
                      </div>
                      <div className="overflow-x-auto">
                        <table className="text-[10px] border-collapse">
                          <thead>
                            <tr>
                              {Object.keys(trace.data_sample[0]).map((key) => (
                                <th key={key} className="border border-gray-200 px-1.5 py-0.5 bg-gray-50 font-medium text-left">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {trace.data_sample.map((row, ri) => (
                              <tr key={ri}>
                                {Object.values(row).map((val, ci) => (
                                  <td key={ci} className="border border-gray-200 px-1.5 py-0.5 text-gray-700">
                                    {val == null ? <span className="text-gray-300">null</span> : String(val)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, showDebug }: { msg: DisplayMessage; showDebug: boolean }) {
  const isUser = msg.role === "user";

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
          {/* Error indicator */}
          {msg.isError && (
            <div className="flex items-center gap-1.5 text-red-600 mb-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Erreur</span>
            </div>
          )}
          {/* Text content */}
          {msg.content && (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
          )}
          {/* Charts from query engine */}
          {msg.charts && msg.charts.map((chart, i) => (
            <ChatChart key={i} chart={chart} />
          ))}
        </div>
        {/* Debug panel — outside the bubble, full width */}
        {showDebug && msg.debugInfo && (
          <DebugPanel debug={msg.debugInfo} />
        )}
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

  // Account scope
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Debug mode
  const [debugMode, setDebugMode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Load on mount
  useEffect(() => {
    loadConversations();
    loadProviderStatus();
    loadAccounts();
  }, []);

  // Auto-scroll
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

  // Close account menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadAccounts() {
    try {
      const data = await accountService.list();
      setAccounts(data);
      // Default: all accounts selected
      setSelectedAccountIds(data.map((a) => a.id));
    } catch {
      // silently fail
    }
  }

  async function loadConversations() {
    try {
      const data = await aiService.listConversations();
      setConversations(data);
    } catch {
      // silently fail
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
            // Charts from metadata if available (stored in DB)
            charts: (m.metadata as Record<string, unknown>)?.charts as ChartResult[] | undefined,
            created_at: m.created_at,
          }))
      );
    } catch {
      // Failed to load
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

  function toggleAccount(accountId: number) {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId]
    );
  }

  function toggleAllAccounts() {
    if (selectedAccountIds.length === accounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(accounts.map((a) => a.id));
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
          account_ids: selectedAccountIds.length < accounts.length
            ? selectedAccountIds
            : undefined, // undefined = all accounts (default)
          debug: debugMode || undefined,
        });

        if (!activeConversation && response.conversation_id) {
          setActiveConversation(response.conversation_id);
        }

        // Build assistant message — may be a success or a server-side error
        const assistantMsg: DisplayMessage = {
          role: "assistant",
          content: response.error
            ? `Désolé, une erreur s'est produite : ${response.error}`
            : response.message,
          charts: response.charts,
          debugInfo: response.debug,
          metadata: response.metadata,
          created_at: new Date().toISOString(),
          isError: !!response.error,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        loadConversations();
      } catch (err: unknown) {
        // Network-level error (API unreachable, 401, etc.)
        const errorMessage =
          err instanceof Error ? err.message : "Erreur lors de l'envoi du message";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Désolé, une erreur s'est produite : ${errorMessage}`,
            created_at: new Date().toISOString(),
            isError: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, activeConversation, selectedAccountIds, accounts.length, debugMode]
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

  const accountScopeLabel =
    selectedAccountIds.length === 0
      ? "Aucun compte"
      : selectedAccountIds.length === accounts.length
      ? "Tous les comptes"
      : `${selectedAccountIds.length} compte${selectedAccountIds.length > 1 ? "s" : ""}`;

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden">
      {/* Main chat area — left */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded hover:bg-muted transition-colors"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform ${sidebarOpen ? "rotate-180" : ""}`}
            />
          </button>
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-sm">Assistant IA</span>

          {/* Debug toggle */}
          <button
            onClick={() => setDebugMode(!debugMode)}
            className={`ml-auto flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
              debugMode
                ? "bg-amber-100 border-amber-300 text-amber-700"
                : "hover:bg-muted text-muted-foreground"
            }`}
            title={debugMode ? "Mode debug actif" : "Activer le mode debug"}
          >
            <Bug className="w-3.5 h-3.5" />
            {debugMode && <span>Debug</span>}
          </button>

          {/* Account scope selector */}
          <div className="relative" ref={accountMenuRef}>
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border hover:bg-muted transition-colors"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{accountScopeLabel}</span>
            </button>
            {accountMenuOpen && accounts.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-background border rounded-lg shadow-lg z-50 py-1">
                <button
                  onClick={toggleAllAccounts}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                    selectedAccountIds.length === accounts.length ? "bg-primary border-primary" : ""
                  }`}>
                    {selectedAccountIds.length === accounts.length && (
                      <Check className="w-2.5 h-2.5 text-primary-foreground" />
                    )}
                  </span>
                  <span className="font-medium">Tous les comptes</span>
                </button>
                <div className="border-t my-1" />
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => toggleAccount(acc.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      selectedAccountIds.includes(acc.id) ? "bg-primary border-primary" : ""
                    }`}>
                      {selectedAccountIds.includes(acc.id) && (
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      )}
                    </span>
                    <span className="truncate">{acc.name}</span>
                    <span className="text-muted-foreground ml-auto">{acc.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
            messages.map((msg, i) => <MessageBubble key={i} msg={msg} showDebug={debugMode} />)
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
        <div className="flex-shrink-0 border-t p-3 bg-background">
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

      {/* Sidebar — right */}
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } flex-shrink-0 border-l bg-muted/30 transition-all duration-200 overflow-hidden`}
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
    </div>
  );
}
