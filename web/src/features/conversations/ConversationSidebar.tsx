import { useState } from 'react'
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import type { Conversation } from '@/lib/api'

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeId: string | null
  loading: boolean
  error: string | null
  creating: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => Promise<void> | void
}

function formatRelative(dateStr: string) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '' // Handle invalid dates
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  error,
  creating,
  onSelect,
  onCreate,
  onDelete,
}: ConversationSidebarProps) {
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await onDelete(pendingDelete.id)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          variant="contained"
          startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <AddIcon />}
          onClick={onCreate}
          disabled={creating}
        >
          New chat
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {error && (
          <Typography color="error" variant="body2" sx={{ px: 2 }}>
            {error}
          </Typography>
        )}
        {!loading && conversations.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
            <ChatBubbleOutlineIcon color="disabled" />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              No conversations yet
            </Typography>
          </Box>
        )}

        <List dense disablePadding>
          {conversations.map((conv) => (
            <ListItemButton
              key={conv.id}
              selected={activeId === conv.id}
              onClick={() => onSelect(conv.id)}
              sx={{ pr: 7 }}
            >
              <ListItemText
                primary={conv.title || 'Untitled chat'}
                secondary={formatRelative(conv.updatedAt) || undefined}
                primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
                secondaryTypographyProps={{ fontSize: 12 }}
              />
              <IconButton
                edge="end"
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  setPendingDelete(conv)
                }}
                sx={{ position: 'absolute', right: 8, opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
                aria-label="delete conversation"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </ListItemButton>
          ))}
        </List>
      </Box>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <DialogTitle>Delete conversation?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            “{pendingDelete?.title || 'Untitled chat'}” and all its messages will be permanently removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
