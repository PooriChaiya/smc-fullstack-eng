import { useEffect, useState } from 'react'
import { Box, LinearProgress, Typography, Tooltip } from '@mui/material'
import { getUsage, Usage } from '@/lib/api'

/**
 * Per-user spend for the current fixed window. Refetches on `refreshKey`
 * (bumped by the chat view after each turn) and every 60s while mounted.
 */
export function BudgetIndicator({ refreshKey }: { refreshKey: number }) {
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    let active = true
    const load = () => getUsage().then((u) => active && setUsage(u)).catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [refreshKey])

  if (!usage) return null

  const pct = Math.min(100, (usage.spent / usage.limit) * 100)
  const color = pct > 90 ? 'error' : pct > 70 ? 'warning' : 'success'

  return (
    <Tooltip
      title={`Resets ${new Date(usage.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
      arrow
    >
      <Box sx={{ minWidth: 170, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Typography variant="caption" color="text.secondary">
          Budget · ${usage.spent.toFixed(4)} / ${usage.limit.toFixed(2)}
        </Typography>
        <LinearProgress variant="determinate" value={pct} color={color} sx={{ height: 6, borderRadius: 3 }} />
      </Box>
    </Tooltip>
  )
}
