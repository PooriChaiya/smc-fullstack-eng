import { useState, useEffect } from 'react'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Chip,
  Box,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PendingIcon from '@mui/icons-material/Pending'
import TerminalIcon from '@mui/icons-material/Terminal'

interface ToolCallCardProps {
  toolName: string
  args: string
  result?: {
    columns?: string[]
    rows?: Record<string, unknown>[]
    rowCount?: number
    rationale?: string
    [k: string]: unknown
  }
  rowCount?: number
  durationMs?: number
  error?: string
  isStreaming?: boolean
}

function extractSql(argsStr: string): string | null {
  try {
    const parsed = JSON.parse(argsStr)
    return typeof parsed?.sql === 'string' ? parsed.sql : null
  } catch {
    return null
  }
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/^\d+/.test(str)) {
    return str.replace(/[^0-9.\-]+/g, '')
  }
  return str
}

// Display name for tool
function getToolLabel(toolName: string): string {
  if (toolName === 'execute_financial_query') return 'SQL Query'
  if (toolName === 'get_data_coverage') return 'Data Coverage'
  return toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Summary title for all tools in a message
function getSummaryTitle(toolNames: string[], isAnyStreaming: boolean): string {
  if (toolNames.includes('get_data_coverage') && toolNames.includes('execute_financial_query')) {
    return isAnyStreaming ? 'Finding the company data >' : 'Found the company data'
  }
  if (toolNames.includes('execute_financial_query')) {
    return isAnyStreaming ? 'Querying financial data >' : 'Queried financial data'
  }
  return isAnyStreaming ? 'Running tools >' : 'Tools completed'
}

// Individual tool call accordion item
function ToolCallItem({
  toolName,
  args,
  result,
  rowCount,
  durationMs,
  error,
  isStreaming,
}: ToolCallCardProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isStreaming && !open) setOpen(true)
  }, [isStreaming, open])

  const sql = extractSql(args)
  const isSqlTool = toolName === 'execute_financial_query'
  const toolLabel = getToolLabel(toolName)

  // Build metadata string
  const metaParts: string[] = []
  if (durationMs != null) metaParts.push(`${durationMs}ms`)
  if (rowCount != null) metaParts.push(`${rowCount} rows`)

  return (
    <Accordion
      expanded={open}
      onChange={(_, v) => setOpen(v)}
      disableGutters
      elevation={0}
      sx={{
        '&:before': { display: 'none' },
        border: 'none',
        boxShadow: 'none',
        backgroundColor: 'transparent'
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
        sx={{
          minHeight: 32,
          '& .MuiAccordionSummary-content': { margin: '4px 0' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
            {toolLabel}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {metaParts.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              {metaParts.join(' • ')}
            </Typography>
          )}
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ p: 2 }}>
        {/* SQL / arguments */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, textTransform: 'uppercase' }}>
            {isSqlTool ? 'SQL' : 'Arguments'}
          </Typography>
          <Box
            component="pre"
            sx={{
              mt: 0.5,
              p: 1,
              borderRadius: 1,
              fontSize: 12,
              overflowX: 'auto',
              bgcolor: '#0f172a',
              color: '#e2e8f0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
            }}
          >
            {isSqlTool ? sql ?? args : args || '…'}
          </Box>
        </Box>

        {error && (
          <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'error.dark', color: 'error.contrastText', fontSize: 12 }}>
            {error}
          </Box>
        )}

        {/* Tabular result */}
        {result?.columns && result?.rows && (
          <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: '100%', overflowX: 'auto', borderRadius: 1, borderColor: 'divider' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {result.columns.map((col) => (
                    <TableCell key={col} sx={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12, bgcolor: 'action.hover' }}>
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {result.rows.slice(0, 5).map((row, i) => (
                  <TableRow key={i} hover>
                    {result.columns!.map((col) => (
                      <TableCell key={col} sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {formatCellValue(row[col] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {result.rowCount != null && result.rowCount > 5 && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.5, display: 'block' }}>
                + {result.rowCount - 5} more rows
              </Typography>
            )}
          </TableContainer>
        )}

        {/* Non-tabular result */}
        {result && !result.columns && (
          <Box component="pre" sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover', overflowX: 'auto', fontSize: 11 }}>
            {JSON.stringify(result, null, 2)}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  )
}

// Container for all tool calls in a message
export function ToolCallCard({ toolName, args, result, rowCount, durationMs, error, isStreaming }: ToolCallCardProps) {
  // For backward compatibility: single tool call
  return <ToolCallItem toolName={toolName} args={args} result={result} rowCount={rowCount} durationMs={durationMs} error={error} isStreaming={isStreaming} />
}

// Multi-step container for use in ChatView
interface ToolCallStepsProps {
  toolCalls: Array<{
    id: string
    tool_name: string
    arguments: string | Record<string, unknown>
    result?: unknown
    row_count?: number
    duration_ms?: number
    error?: string
  }>
}

export function ToolCallSteps({ toolCalls }: ToolCallStepsProps) {
  const [expanded, setExpanded] = useState(false)

  const anyStreaming = toolCalls.some(tc => !tc.result && !tc.error)
  const allDone = toolCalls.every(tc => tc.result || tc.error)

  // Aggregate metadata
  const totalRows = toolCalls.reduce((sum, tc) => sum + (tc.row_count ?? 0), 0)
  const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.duration_ms ?? 0), 0)
  const metaParts: string[] = []
  if (!anyStreaming && totalDuration > 0) metaParts.push(`${totalDuration}ms`)
  if (!anyStreaming && totalRows > 0) metaParts.push(`${totalRows} rows`)

  const summaryTitle = getSummaryTitle(
    toolCalls.map(tc => tc.tool_name),
    anyStreaming
  )

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, v) => setExpanded(v)}
      disableGutters
      elevation={0}
      sx={{
        mt: 1,
        mb: 1.5,
        '&:before': { display: 'none' },
        backgroundColor: 'transparent'
      }}
    >
      <AccordionSummary
        expandIcon={<ChevronRightIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
        sx={{
          minHeight: 36,
          '& .MuiAccordionSummary-content': { margin: '6px 0' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <TerminalIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {summaryTitle}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {metaParts.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              {metaParts.join(' • ')}
            </Typography>
          )}
          {anyStreaming ? (
            <Chip label="Running…" size="small" color="info" sx={{ height: 20, fontSize: '0.7rem' }} />
          ) : allDone ? (
            <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
          ) : (
            <PendingIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          )}
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ p: 0 }}>
        {toolCalls.map((tc) => (
          <ToolCallItem
            key={tc.id}
            toolName={tc.tool_name}
            args={typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)}
            result={tc.result as any}
            rowCount={tc.row_count}
            durationMs={tc.duration_ms}
            error={tc.error}
            isStreaming={!tc.result && !tc.error}
          />
        ))}
        {allDone && (
          <Box sx={{ py: 1, pl: 1.5 }}>
            <Typography variant="body2" sx={{ color: 'success.main', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 13 }}>
              <CheckCircleIcon sx={{ fontSize: 14 }} /> Done
            </Typography>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  )
}
