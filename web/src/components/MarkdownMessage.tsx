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
  const Chart = spec.type === 'line' ? LineChart : BarChart
  const DataKey = spec.type === 'line' ? Line : Bar

  return (
    <div className="my-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{spec.title}</h4>
      <ResponsiveContainer width="100%" height={300}>
        <Chart data={spec.data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={spec.x} />
          <YAxis />
          <Tooltip />
          <Legend />
          {spec.series.map((serie) => (
            <DataKey key={serie} dataKey={serie} fill="#3b82f6" stroke="#3b82f6" />
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
    // Fall through to normal code block
  }
  return null
}

const components: Components = {
  code({ node, inline, className, children, ...props }: any) {
    if (inline) {
      return <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>
    }

    const code = String(children).replace(/\n$/, '')

    // Try to parse as chart
    if (className?.includes('chart')) {
      const spec = tryParseChart(code)
      if (spec) {
        return <ChartRenderer spec={spec} />
      }
    }

    // Normal code block
    return (
      <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-sm">
        <code {...props}>{children}</code>
      </pre>
    )
  },
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
          {children}
        </table>
      </div>
    )
  },
  thead({ children }: any) {
    return <thead className="bg-gray-50">{children}</thead>
  },
  tbody({ children }: any) {
    return <tbody className="divide-y divide-gray-200">{children}</tbody>
  },
  tr({ children }: any) {
    return <tr>{children}</tr>
  },
  th({ children }: any) {
    return (
      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
        {children}
      </th>
    )
  },
  td({ children }: any) {
    return (
      <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
        {children}
      </td>
    )
  },
  p({ children }: any) {
    return <p className="mb-2 text-gray-800 leading-relaxed">{children}</p>
  },
  ul({ children }: any) {
    return <ul className="list-disc list-inside mb-2 text-gray-800">{children}</ul>
  },
  ol({ children }: any) {
    return <ol className="list-decimal list-inside mb-2 text-gray-800">{children}</ol>
  },
  li({ children }: any) {
    return <li className="mb-1">{children}</li>
  },
  h1({ children }: any) {
    return <h1 className="text-xl font-bold text-gray-900 mb-2">{children}</h1>
  },
  h2({ children }: any) {
    return <h2 className="text-lg font-semibold text-gray-900 mb-2">{children}</h2>
  },
  h3({ children }: any) {
    return <h3 className="text-base font-semibold text-gray-900 mb-2">{children}</h3>
  },
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  )
}
