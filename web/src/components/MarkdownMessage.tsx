import { useTheme } from '@mui/material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface ChartSpec {
  type: 'bar' | 'line'
  x: string
  series: string[]
  data: Record<string, unknown>[]
  title: string
}

interface MarkdownMessageProps {
  content: string
}

function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const theme = useTheme()
  const Chart = spec.type === 'line' ? LineChart : BarChart
  const DataKey = spec.type === 'line' ? Line : Bar
  const axisColor = theme.palette.text.disabled

  return (
    <div style={{ margin: '12px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: theme.palette.text.primary }}>
        {spec.title}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <Chart data={spec.data}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis dataKey={spec.x} tick={{ fontSize: 12, fill: axisColor }} />
          <YAxis tick={{ fontSize: 12, fill: axisColor }} />
          <Tooltip
            contentStyle={{
              background: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {spec.series.map((serie) => (
            <DataKey key={serie} dataKey={serie} fill={theme.palette.primary.main} stroke={theme.palette.primary.main} />
          ))}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}

function tryParseChart(code: string): ChartSpec | null {
  try {
    const parsed = JSON.parse(code)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'type' in parsed &&
      'x' in parsed &&
      'series' in parsed &&
      'data' in parsed &&
      'title' in parsed
    ) {
      return parsed as ChartSpec
    }
  } catch {
    // Not valid JSON yet (or not a chart) → fall back to a normal code block.
  }
  return null
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const theme = useTheme()
  const t = theme.palette

  // Intercept ```chart fences to render Recharts; everything else is styled
  // via theme-aware inline styles so it adapts to light/dark mode.
  const components: Components = {
    pre({ children }: any) {
      const codeEl: any = Array.isArray(children) ? children[0] : children
      const className: string = codeEl?.props?.className ?? ''
      if (className.includes('language-chart')) {
        const text = String(codeEl.props.children ?? '').replace(/\n$/, '')
        const spec = tryParseChart(text)
        if (spec) return <ChartRenderer spec={spec} />
      }
      return (
        <pre
          style={{
            background: t.mode === 'dark' ? '#0b1220' : '#0f172a',
            color: '#e2e8f0',
            padding: 12,
            borderRadius: 8,
            overflowX: 'auto',
            fontSize: 13,
            margin: '8px 0',
          }}
        >
          {children}
        </pre>
      )
    },
    code({ children }: any) {
      return (
        <code style={{ background: t.action.hover, padding: '1px 4px', borderRadius: 4, fontSize: '0.85em' }}>
          {children}
        </code>
      )
    },
    table({ children }: any) {
      return (
        <div style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
        </div>
      )
    },
    th({ children }: any) {
      return (
        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `2px solid ${t.divider}`, fontWeight: 600 }}>
          {children}
        </th>
      )
    },
    td({ children }: any) {
      return <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.divider}` }}>{children}</td>
    },
    a({ children, href }: any) {
      return (
        <a href={href} style={{ color: t.primary.main }} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    },
  }

  return (
    <div style={{ lineHeight: 1.6, fontSize: 15 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
