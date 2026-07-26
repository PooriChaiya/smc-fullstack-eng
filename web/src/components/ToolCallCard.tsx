import { useState } from 'react'

interface ToolCallCardProps {
  toolName: string
  args: string
  result?: {
    columns?: string[]
    rows?: Record<string, unknown>[]
    rowCount?: number
    rationale?: string
  }
  rowCount?: number
  durationMs?: number
  error?: string
  isStreaming?: boolean
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
  const [isExpanded, setIsExpanded] = useState(false)

  // Format the SQL for display
  const formatArgs = (argsStr: string) => {
    try {
      const parsed = JSON.parse(argsStr)
      if (parsed.sql) {
        return parsed.sql
      }
      return JSON.stringify(parsed, null, 2)
    } catch {
      return argsStr
    }
  }

  const getDisplayTitle = () => {
    if (toolName === 'execute_financial_query') {
      return 'SQL Query'
    }
    if (toolName === 'get_data_coverage') {
      return 'Data Coverage'
    }
    return toolName
  }

  const getStatusIndicator = () => {
    if (error) {
      return <span className="text-red-600">Error</span>
    }
    if (isStreaming) {
      return <span className="text-blue-600 animate-pulse">Running...</span>
    }
    if (result) {
      return <span className="text-green-600">Done</span>
    }
    return <span className="text-gray-400">Pending</span>
    }

  return (
    <div className="my-2 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-100 transition"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-700">{getDisplayTitle()}</span>
          {getStatusIndicator()}
          {result?.rationale && (
            <span className="text-xs text-gray-500 italic">{result.rationale}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {durationMs && <span>{durationMs}ms</span>}
          {rowCount !== undefined && <span>{rowCount} rows</span>}
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 border-t border-gray-200 bg-white">
          {/* SQL/Arguments */}
          <div className="mb-2">
            <div className="text-xs font-semibold text-gray-500 mb-1 uppercase">
              {toolName === 'execute_financial_query' ? 'SQL' : 'Arguments'}
            </div>
            <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">
              {formatArgs(args)}
            </pre>
          </div>

          {/* Result or Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
              {error}
            </div>
          )}

          {result && result.columns && result.rows && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1 uppercase">
                Results
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs border border-gray-200 rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      {result.columns.map((col) => (
                        <th key={col} className="px-2 py-1 text-left font-medium border-b border-gray-200">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 10).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {result.columns!.map((col) => (
                          <td key={col} className="px-2 py-1 border-b border-gray-100">
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rowCount! > 10 && (
                  <div className="text-xs text-gray-500 mt-1 italic">
                    Showing 10 of {result.rowCount} rows
                  </div>
                )}
              </div>
            </div>
          )}

          {result && !result.columns && (
            <div className="text-sm text-gray-700">
              <pre className="bg-gray-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
