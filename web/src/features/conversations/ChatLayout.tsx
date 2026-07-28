import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Paper,
  Toolbar,
  IconButton,
  Typography,
  Drawer,
  Menu,
  MenuItem,
  Avatar,
  Divider,
  Tooltip,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAuth } from '../auth/AuthContext'
import { useColorMode } from '@/theme'
import { ConversationSidebar } from './ConversationSidebar'
import { useConversations } from './useConversations'
import { ChatView } from '../chat/ChatView'
import { BudgetIndicator } from '../usage/BudgetIndicator'

const DRAWER_WIDTH = 280

export function ChatLayout() {
  const { user, logout } = useAuth()
  const { mode, toggle } = useColorMode()
  const { conversations, loading, error, reload, create, delete: deleteConv } = useConversations()
  const { conversationId } = useParams<{ conversationId?: string }>()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [usageRefresh, setUsageRefresh] = useState(0)

  // Sync URL with active conversation
  const activeId = conversationId ?? null

  const handleCreate = async () => {
    setCreating(true)
    try {
      const conv = await create()
      navigate(`/c/${conv.id}`)
      setMobileOpen(false)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteConv(id)
    if (activeId === id) navigate('/')
  }

  // ⌘K / Ctrl+K → new chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        handleCreate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sidebar = (
    <ConversationSidebar
      conversations={conversations}
      activeId={activeId}
      loading={loading}
      error={error}
      creating={creating}
      onSelect={(id) => {
        navigate(`/c/${id}`)
        setMobileOpen(false)
      }}
      onCreate={handleCreate}
      onDelete={handleDelete}
    />
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Paper component="header" elevation={0} square sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            onClick={() => setMobileOpen(true)}
            sx={{ display: { xs: 'inline-flex', md: 'none' } }}
            aria-label="open conversations"
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="h1" fontWeight={700} sx={{ mr: 'auto' }}>
            SMC Financial Chat
          </Typography>

          <BudgetIndicator refreshKey={usageRefresh} />

          <Tooltip title={mode === 'light' ? 'Dark mode' : 'Light mode'}>
            <IconButton onClick={toggle} color="inherit">
              {mode === 'light' ? <Brightness4Icon /> : <Brightness7Icon />}
            </IconButton>
          </Tooltip>

          <Tooltip title={user?.email ?? ''}>
            <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 15 }}>
                {(user?.email ?? '?')[0].toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
            <MenuItem disabled sx={{ pointerEvents: 'none', fontSize: 13 }}>
              {user?.email}
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setMenuAnchor(null)
                logout()
              }}
            >
              <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} /> Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </Paper>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Desktop sidebar */}
        <Box
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            display: { xs: 'none', md: 'block' },
          }}
        >
          {sidebar}
        </Box>

        {/* Mobile sidebar */}
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
        >
          {sidebar}
        </Drawer>

        <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {activeId ? (
            <ChatView
              key={activeId}
              conversationId={activeId}
              onTurnComplete={() => {
                reload()
                setUsageRefresh((n) => n + 1)
              }}
            />
          ) : (
            <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6">No conversation selected</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Click <strong>New chat</strong> or press <kbd>⌘K</kbd> to begin.
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
