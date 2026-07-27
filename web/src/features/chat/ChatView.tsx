import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  Alert,
  Stack,
  Tooltip,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { getMessages, Message as ApiMessage, ToolCall, LimitExceeded } from '@/lib/api'
import { ToolCallCard } from '@/components/ToolCallCard'
import { MarkdownMessage } from '@/components/MarkdownMessage'

interface ChatViewProps {
  conversationId: string
  onTurnComplete?: () => void
}

const EXAMPLE_PROMPTS = [
  "What was Apple's revenue in 2024?",
  'Compare Tesla and Microsoft net income',
  'Show me the most profitable companies',
  'What sectors do you have data for?',
]

export function ChatView({ conversationId, onTurnComplete }: ChatViewProps) {
  const [messages, setMessages] = useState<ApiMessage[]>([])
  const [streaming, setStreaming] = useState<ApiMessage | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [limitError, setLimitError] = useState<LimitExceeded | null>(null)
  const [isScrolledUp, setIsScrolledUp] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load history when the conversation changes.
  useEffect(() => {
    setLoadingHistory(true)
    setLimitError(null)
    getMessages(conversationId)
      .then((msgs) => {
        // Filter out incomplete streaming messages from interrupted sessions
        // (empty content + status=streaming means the connection was dropped)
        setMessages(msgs.filter(m => !(m.role === 'assistant' && m.status === 'streaming' && !m.content)))
      })
      .finally(() => setLoadingHistory(false))
  }, [conversationId])

  // Auto-scroll to bottom unless the user has scrolled up.
  useEffect(() => {
    if (isScrolledUp) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streaming, isScrolledUp])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 80
    setIsScrolledUp(!atBottom)
  }, [])

  const updateStreaming = (fn: (m: ApiMessage) => ApiMessage) =>
    setStreaming((prev) => (prev ? fn(prev) : prev))

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return
    setLimitError(null)
    setIsLoading(true)
    setIsScrolledUp(false)

    const controller = new AbortController()
    abortRef.current = controller

    const userMsg: ApiMessage = {
      id: `temp-${Date.now()}`,
      conversationId,
      seq: -1,
      role: 'user',
      content: message,
      status: 'complete',
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setStreaming({
      id: 'streaming',
      conversationId,
      seq: -1,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: new Date().toISOString(),
      tool_calls: [],
    })

    let turnRan = false
    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationId, message }),
        signal: controller.signal,
      })

      if (res.status === 429) {
        setLimitError((await res.json()) as LimitExceeded)
        return
      }
      if (!res.ok) throw new Error('Failed to send message')
      turnRan = true

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No response body')

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            handleChunk(JSON.parse(data))
          } catch {
            /* ignore unparseable partial */
          }
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        console.error('Stream error:', err)
      }
    } finally {
      if (turnRan) {
        try {
          setMessages(await getMessages(conversationId))
        } catch {
          /* keep optimistic state if reload fails */
        }
        onTurnComplete?.()
      } else {
        // No server turn happened (429 / network) → drop the optimistic user msg.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
      }
      setStreaming(null)
      setIsLoading(false)
      abortRef.current = null
    }
  }

  // Apply one SSE chunk to the in-flight streaming message.
  function handleChunk(chunk: { type: string; data?: any }) {
    const { type, data } = chunk
    switch (type) {
      case 'text-delta':
        updateStreaming((m) => ({ ...m, content: m.content + (data ?? '') }))
        break
      case 'tool-input-start': {
        const tc: ToolCall = {
          id: data.toolCallId,
          messageId: 'streaming',
          tool_name: data.toolName,
          arguments: '',
          createdAt: new Date().toISOString(),
        }
        updateStreaming((m) => ({ ...m, tool_calls: [...(m.tool_calls ?? []), tc] }))
        break
      }
      case 'tool-input-delta':
        updateStreaming((m) => ({
          ...m,
          tool_calls: (m.tool_calls ?? []).map((t) =>
            t.id === data.toolCallId ? { ...t, arguments: (typeof t.arguments === 'string' ? t.arguments : '') + (data.argsDelta ?? '') } : t,
          ),
        }))
        break
      case 'tool-output-available':
        updateStreaming((m) => ({
          ...m,
          tool_calls: (m.tool_calls ?? []).map((t) =>
            t.id === data.toolCallId
              ? { ...t, result: data.result, row_count: data.rowCount, duration_ms: data.durationMs }
              : t,
          ),
        }))
        break
      case 'tool-output-error':
        updateStreaming((m) => ({
          ...m,
          tool_calls: (m.tool_calls ?? []).map((t) =>
            t.id === data.toolCallId ? { ...t, error: data.error } : t,
          ),
        }))
        break
      case 'error':
        updateStreaming((m) => ({ ...m, status: 'error', content: m.content + `\n\n⚠️ ${data?.message ?? 'Error'}` }))
        break
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    const msg = input
    setInput('')
    sendMessage(msg)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit(e as unknown as React.FormEvent)
    }
  }

  const handleStop = () => abortRef.current?.abort()

  const pickExample = (prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  const rendered = [...messages]
  if (streaming) rendered.push(streaming)
  const showEmpty = !loadingHistory && rendered.length === 0
  const isThinking = !!streaming && streaming.content === '' && (streaming.tool_calls?.length ?? 0) === 0

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {limitError && <LimitBanner resetsAt={limitError.resetsAt} limit={limitError.limit} onDismiss={() => setLimitError(null)} />}

      <Box ref={scrollRef} onScroll={onScroll} sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, md: 4 }, py: 3 }}>
        {loadingHistory ? (
          <Box sx={{ textAlign: 'center', color: 'text.secondary', mt: 6 }}>Loading messages…</Box>
        ) : showEmpty ? (
          <Stack spacing={1.5} sx={{ maxWidth: 640, mx: 'auto', mt: { xs: 4, md: 8 } }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <AutoAwesomeIcon color="primary" />
              <Typography variant="h6">Ask about company financials</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Every figure comes from a live SQL query you can inspect. Try one:
            </Typography>
            {EXAMPLE_PROMPTS.map((p) => (
              <Paper
                key={p}
                variant="outlined"
                onClick={() => pickExample(p)}
                sx={{ p: 1.5, cursor: 'pointer', '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' } }}
              >
                <Typography variant="body2">{p}</Typography>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Stack spacing={3} sx={{ maxWidth: 820, mx: 'auto' }}>
            {rendered.map((msg) => (
              <MessageRow key={msg.id} msg={msg} thinking={msg.id === 'streaming' && isThinking} />
            ))}
          </Stack>
        )}
      </Box>

      <Paper elevation={0} square sx={{ borderTop: 1, borderColor: 'divider', p: { xs: 1.5, md: 2 }, bgcolor: 'background.paper' }}>
        <Box component="form" onSubmit={onSubmit} sx={{ maxWidth: 820, mx: 'auto', display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            inputRef={inputRef}
            multiline
            minRows={1}
            maxRows={5}
            fullWidth
            placeholder="Ask about financials…  (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isLoading}
          />
          {isLoading ? (
            <Tooltip title="Stop generating">
              <IconButton color="error" onClick={handleStop} sx={{ border: 1, borderColor: 'error.main', p: 1.2 }}>
                <StopCircleIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <IconButton type="submit" color="primary" disabled={!input.trim()} sx={{ border: 1, borderColor: 'divider', p: 1.2 }}>
              <SendIcon />
            </IconButton>
          )}
        </Box>
      </Paper>
    </Box>
  )
}

function MessageRow({ msg, thinking }: { msg: ApiMessage; thinking: boolean }) {
  const isUser = msg.role === 'user'
  const hasStreamingTools = msg.tool_calls?.some(tc => !tc.result && !tc.error)

  return (
    <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <Box sx={{ width: 'fit-content', maxWidth: 720 }}>
        {thinking && !hasStreamingTools && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon fontSize="small" />
            Thinking...
          </Typography>
        )}
        {msg.tool_calls?.map((tc) => (
          <ToolCallCard
            key={tc.id}
            toolName={tc.tool_name}
            args={typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)}
            result={tc.result as any}
            rowCount={tc.row_count ?? undefined}
            durationMs={tc.duration_ms ?? undefined}
            error={tc.error ?? undefined}
            isStreaming={!tc.result && !tc.error}
          />
        ))}
        {/* Only show text bubble if there's content, or if it's a user message, or if it's actively thinking with no tools */}
        {(msg.content || isUser || (thinking && !hasStreamingTools)) && (
          <Paper
            variant={isUser ? 'elevation' : 'outlined'}
            elevation={isUser ? 0 : 0}
            sx={{
              px: 2,
              py: 1.5,
              display: 'inline-block',
              bgcolor: isUser ? 'primary.main' : 'background.paper',
              color: isUser ? 'primary.contrastText' : 'text.primary',
              borderTopLeftRadius: isUser ? 10 : 2,
              borderTopRightRadius: isUser ? 2 : 10,
              maxWidth: '100%'
            }}
          >
            {isUser ? (
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{msg.content}</Typography>
            ) : msg.content ? (
              <MarkdownMessage content={msg.content} />
            ) : thinking && !hasStreamingTools ? (
              <TypingDots />
            ) : null}
          </Paper>
        )}


      </Box>
    </Box>
  )
}

function TypingDots() {
  return (
    <Stack direction="row" spacing={0.5} sx={{ py: 0.5 }}>
      {[0, 150, 300].map((d) => (
        <Box
          key={d}
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: 'text.disabled',
            animation: 'chatBlink 1.4s infinite',
            animationDelay: `${d}ms`,
          }}
        />
      ))}
      <style>{`@keyframes chatBlink{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </Stack>
  )
}

function LimitBanner({ resetsAt, limit, onDismiss }: { resetsAt: string; limit: number; onDismiss: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((new Date(resetsAt).getTime() - Date.now()) / 1000)))
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(resetsAt).getTime() - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [resetsAt])

  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60
  return (
    <Alert
      severity="warning"
      onClose={onDismiss}
      sx={{ borderRadius: 0 }}
    >
      You've reached your ${limit.toFixed(2)} budget for this window. Try again in {mm}:{ss.toString().padStart(2, '0')}.
    </Alert>
  )
}
