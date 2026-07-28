import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createTheme, CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material'
import type { ReactNode } from 'react'

type Mode = 'light' | 'dark'

interface ColorModeCtx {
  mode: Mode
  toggle: () => void
}

const ColorModeContext = createContext<ColorModeCtx>({ mode: 'light', toggle: () => {} })

export function useColorMode() {
  return useContext(ColorModeContext)
}

function buildTheme(mode: Mode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#2563eb' }, // blue-600
      ...(mode === 'dark'
        ? { background: { default: '#0f172a', paper: '#1e293b' } }
        : { background: { default: '#f8fafc', paper: '#ffffff' } }),
    },
    shape: { borderRadius: 10 },
    typography: { fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
    },
  })
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'light'
    return (localStorage.getItem('theme-mode') as Mode) || 'light'
  })

  useEffect(() => {
    localStorage.setItem('theme-mode', mode)
  }, [mode])

  const colorMode = useMemo(
    () => ({
      mode,
      toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')),
    }),
    [mode],
  )

  const theme = useMemo(() => buildTheme(mode), [mode])

  return (
    <ColorModeContext.Provider value={colorMode}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ColorModeContext.Provider>
  )
}
