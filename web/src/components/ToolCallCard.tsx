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

function displayTitle(toolName: string) {
  if (toolName === 'execute_financial_query') return 'SQL Query'
  if (toolName === 'get_data_coverage') return 'Data Coverage'
  return toolName
}

export function ToolCallCard({
  toolName,
  args,
  result,
  rowCount,
  durationMs,
  error,
  isStreaming = false,
}: ToolCallCardProps) {
  const [open, setOpen] = useState(false)

  // Auto-expand while the query is running so the SQL types out live.
  useEffect(() => {
    if (isStreaming && !open) setOpen(true)
  }, [isStreaming, open])

  const sql = extractSql(args)
  const isSqlTool = toolName === 'execute_financial_query'

  const status = error ? (
    <Chip label="Error" size="small" color="error" variant="outlined" />
  ) : isStreaming ? (
    <Chip label="Running…" size="small" color="info" />
  ) : result ? (
    <Chip label="Done" size="small" color="success" variant="outlined" />
  ) : (
    <Chip label="Pending" size="small" variant="outlined" />
  )

  const meta: string[] = []
  if (durationMs != null) meta.push(`${durationMs}ms`)
  if (rowCount != null) meta.push(`${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`)

  return (
    <Accordion
      expanded={open}
      onChange={(_, v) => setOpen(v)}
      disableGutters
      elevation={0}
      sx={{ mt: 1, bgcolor: 'background.default', '&:before': { display: 'none' }, border: 1, borderColor: 'divider' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%', pr: 1 }}>
          <TerminalIcon fontSize="small" color="action" />
          <Typography variant="body2" fontWeight={600}>{displayTitle(toolName)}</Typography>
          {status}
          <Box sx={{ flexGrow: 1 }} />
          {meta.map((m) => (
            <Typography key={m} variant="caption" color="text.secondary">{m}</Typography>
          ))}
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0 }}>
        {/* Live SQL / arguments */}
        <Typography variant="overline" color="text.secondary">{isSqlTool ? 'SQL' : 'Arguments'}</Typography>
        <Box
          component="pre"
          sx={{
            mt: 0.5,
            mb: 1.5,
            p: 1.5,
            borderRadius: 1,
            fontSize: 13,
            overflowX: 'auto',
            bgcolor: '#0f172a',
            color: '#e2e8f0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            minHeight: 20,
            fontFamily: 'monospace',
          }}
        >
          {isSqlTool ? sql ?? args : args || '…'}
        </Box>

        {error && (
          <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'error.main', color: 'error.contrastText', fontSize: 13, mb: 1 }}>
            {error}
          </Box>
        )}

        {/* Tabular result */}
        {result?.columns && result?.rows && (
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {result.columns.map((col) => (
                    <TableCell key={col} sx={{ fontWeight: 600 }}>{col}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {result.rows.slice(0, 10).map((row, i) => (
                  <TableRow key={i} hover>
                    {result.columns!.map((col) => (
                      <TableCell key={col}>{String(row[col] ?? '')}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {result.rowCount != null && result.rowCount > 10 && (
              <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
                Showing 10 of {result.rowCount} rows
              </Typography>
            )}
          </TableContainer>
        )}

        {/* Non-tabular result (e.g. coverage) */}
        {result && !result.columns && (
          <Box component="pre" sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover', overflowX: 'auto', fontSize: 12, m: 0 }}>
            {JSON.stringify(result, null, 2)}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  )
}
