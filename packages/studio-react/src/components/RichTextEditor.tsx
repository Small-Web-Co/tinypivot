// eslint-disable-next-line ts/consistent-type-imports
import {
  bubbleMenuButtons,
  filterSlashCommands,
  type MenuButton,
  menuIcons,
  slashCommandIcons,
  slashCommands,
  toolbarGroups,
} from '@smallwebco/tinypivot-studio'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
/**
 * RichTextEditor - Tiptap-based rich text editor for React
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface RichTextEditorProps {
  /** Initial content (HTML string) */
  content: string
  /** Callback when content changes */
  onChange: (html: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
  /** Auto-focus on mount */
  autoFocus?: boolean
  /** Custom class name */
  className?: string
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Type something, or press / for commands...',
  readOnly = false,
  autoFocus = false,
  className = '',
}: RichTextEditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 })
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
  const slashMenuRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'tps-editor-link' },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: 'tps-editor-image' },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'tps-editor-table' },
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder }),
      Underline,
    ],
    content,
    editable: !readOnly,
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Handle slash command detection
  useEffect(() => {
    if (!editor)
      return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/') {
        const { from } = editor.state.selection
        const textBefore = editor.state.doc.textBetween(Math.max(0, from - 1), from)

        // Only trigger at start of line or after whitespace
        if (from === 1 || /\s/.test(textBefore)) {
          const coords = editor.view.coordsAtPos(from)
          setSlashMenuPosition({ top: coords.bottom + 4, left: coords.left })
          setShowSlashMenu(true)
          setSlashQuery('')
          setSelectedSlashIndex(0)
        }
      }

      if (showSlashMenu) {
        const cmds = filterSlashCommands(slashQuery)

        if (event.key === 'Escape') {
          setShowSlashMenu(false)
          event.preventDefault()
        }
        else if (event.key === 'ArrowDown') {
          setSelectedSlashIndex(i => Math.min(i + 1, cmds.length - 1))
          event.preventDefault()
        }
        else if (event.key === 'ArrowUp') {
          setSelectedSlashIndex(i => Math.max(i - 1, 0))
          event.preventDefault()
        }
        else if (event.key === 'Enter' && cmds.length > 0) {
          executeSlashCommand(cmds[selectedSlashIndex])
          event.preventDefault()
        }
        else if (event.key === 'Backspace' && slashQuery === '') {
          setShowSlashMenu(false)
        }
        else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          setSlashQuery(q => q + event.key)
          setSelectedSlashIndex(0)
        }
      }
    }

    const editorElement = editor.view.dom
    editorElement.addEventListener('keydown', handleKeyDown)
    return () => editorElement.removeEventListener('keydown', handleKeyDown)
  }, [editor, showSlashMenu, slashQuery, selectedSlashIndex])

  // Close slash menu on click outside
  useEffect(() => {
    if (!showSlashMenu)
      return

    const handleClickOutside = (event: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(event.target as Node)) {
        setShowSlashMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSlashMenu])

  const executeSlashCommand = useCallback((cmd: typeof slashCommands[0]) => {
    if (!editor)
      return

    // Delete the slash character
    const { from } = editor.state.selection
    editor.chain().focus().deleteRange({ from: from - 1 - slashQuery.length, to: from }).run()

    switch (cmd.command) {
      case 'setHeading': {
        const level = Number.parseInt(cmd.id.replace('h', '')) as 1 | 2 | 3
        editor.chain().focus().toggleHeading({ level }).run()
        break
      }
      case 'toggleBulletList':
        editor.chain().focus().toggleBulletList().run()
        break
      case 'toggleOrderedList':
        editor.chain().focus().toggleOrderedList().run()
        break
      case 'toggleBlockquote':
        editor.chain().focus().toggleBlockquote().run()
        break
      case 'toggleCodeBlock':
        editor.chain().focus().toggleCodeBlock().run()
        break
      case 'insertTable':
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        break
      case 'setImage': {
        const url = window.prompt('Enter image URL:')
        if (url) {
          editor.chain().focus().setImage({ src: url }).run()
        }
        break
      }
      case 'setHorizontalRule':
        editor.chain().focus().setHorizontalRule().run()
        break
    }

    setShowSlashMenu(false)
    setSlashQuery('')
  }, [editor, slashQuery])

  const executeCommand = useCallback((btn: MenuButton) => {
    if (!editor)
      return

    switch (btn.command) {
      case 'toggleBold':
        editor.chain().focus().toggleBold().run()
        break
      case 'toggleItalic':
        editor.chain().focus().toggleItalic().run()
        break
      case 'toggleUnderline':
        editor.chain().focus().toggleUnderline().run()
        break
      case 'toggleStrike':
        editor.chain().focus().toggleStrike().run()
        break
      case 'toggleHeading': {
        const level = Number.parseInt(btn.id.replace('h', '')) as 1 | 2 | 3
        editor.chain().focus().toggleHeading({ level }).run()
        break
      }
      case 'toggleBulletList':
        editor.chain().focus().toggleBulletList().run()
        break
      case 'toggleOrderedList':
        editor.chain().focus().toggleOrderedList().run()
        break
      case 'toggleBlockquote':
        editor.chain().focus().toggleBlockquote().run()
        break
      case 'toggleCodeBlock':
        editor.chain().focus().toggleCodeBlock().run()
        break
      case 'setLink':
        if (editor.isActive('link')) {
          editor.chain().focus().unsetLink().run()
        }
        else {
          const url = window.prompt('Enter URL:')
          if (url) {
            editor.chain().focus().setLink({ href: url }).run()
          }
        }
        break
      case 'setImage': {
        const imageUrl = window.prompt('Enter image URL:')
        if (imageUrl) {
          editor.chain().focus().setImage({ src: imageUrl }).run()
        }
        break
      }
      case 'setTextAlign': {
        const align = btn.id.replace('align', '').toLowerCase() as 'left' | 'center' | 'right'
        editor.chain().focus().setTextAlign(align).run()
        break
      }
      case 'insertTable':
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        break
      case 'undo':
        editor.chain().focus().undo().run()
        break
      case 'redo':
        editor.chain().focus().redo().run()
        break
      case 'unsetAllMarks':
        editor.chain().focus().unsetAllMarks().run()
        break
    }
  }, [editor])

  const isActive = useCallback((btn: MenuButton): boolean => {
    if (!editor || !btn.isActive)
      return false

    if (btn.isActive.startsWith('heading-')) {
      const level = Number.parseInt(btn.isActive.split('-')[1])
      return editor.isActive('heading', { level })
    }
    if (btn.isActive.startsWith('textAlign-')) {
      const align = btn.isActive.split('-')[1]
      return editor.isActive({ textAlign: align })
    }
    return editor.isActive(btn.isActive)
  }, [editor])

  if (!editor)
    return null

  const filteredCommands = filterSlashCommands(slashQuery)
  const allIcons = { ...menuIcons, ...slashCommandIcons }

  return (
    <div className={`tps-rich-editor ${className}`}>
      {/* Toolbar */}
      {!readOnly && (
        <div className="tps-editor-toolbar">
          {toolbarGroups.map(group => (
            <div key={group.id} className="tps-toolbar-group">
              {group.buttons.map(btn => (
                <button
                  key={btn.id}
                  type="button"
                  className={`tps-toolbar-btn ${isActive(btn) ? 'active' : ''}`}
                  onClick={() => executeCommand(btn)}
                  title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={allIcons[btn.icon]} />
                  </svg>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} className="tps-editor-content" />

      {/* Bubble Menu */}
      {!readOnly && (
        <BubbleMenu editor={editor} className="tps-bubble-menu">
          {bubbleMenuButtons.map(btn => (
            <button
              key={btn.id}
              type="button"
              className={`tps-toolbar-btn ${isActive(btn) ? 'active' : ''}`}
              onClick={() => executeCommand(btn)}
              title={btn.label}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={allIcons[btn.icon]} />
              </svg>
            </button>
          ))}
        </BubbleMenu>
      )}

      {/* Slash Command Menu */}
      {showSlashMenu && filteredCommands.length > 0 && (
        <div
          ref={slashMenuRef}
          className="tps-slash-menu"
          style={{ position: 'fixed', top: slashMenuPosition.top, left: slashMenuPosition.left }}
        >
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.id}
              type="button"
              className={`tps-slash-item ${index === selectedSlashIndex ? 'selected' : ''}`}
              onClick={() => executeSlashCommand(cmd)}
              onMouseEnter={() => setSelectedSlashIndex(index)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={allIcons[cmd.icon]} />
              </svg>
              <div className="tps-slash-item-text">
                <span className="tps-slash-item-label">{cmd.label}</span>
                <span className="tps-slash-item-description">{cmd.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
