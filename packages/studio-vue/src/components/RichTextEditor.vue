<!-- packages/studio-vue/src/components/RichTextEditor.vue -->
<script setup lang="ts">
// eslint-disable-next-line ts/consistent-type-imports
import {
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
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
/**
 * RichTextEditor - Tiptap-based rich text editor for Vue
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface RichTextEditorProps {
  /** Initial content (HTML string) */
  content: string
  /** Placeholder text */
  placeholder?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
  /** Auto-focus on mount */
  autoFocus?: boolean
}

const props = withDefaults(defineProps<RichTextEditorProps>(), {
  placeholder: 'Type something, or press / for commands...',
  readOnly: false,
  autoFocus: false,
})

const emit = defineEmits<{
  (e: 'update:content', value: string): void
}>()

const showSlashMenu = ref(false)
const slashQuery = ref('')
const slashMenuPosition = ref({ top: 0, left: 0 })
const selectedSlashIndex = ref(0)
const slashMenuRef = ref<HTMLDivElement | null>(null)

const allIcons = { ...menuIcons, ...slashCommandIcons }

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
    Placeholder.configure({ placeholder: props.placeholder }),
    Underline,
  ],
  content: props.content,
  editable: !props.readOnly,
  autofocus: props.autoFocus,
  onUpdate: ({ editor }) => {
    emit('update:content', editor.getHTML())
  },
})

const filteredCommands = computed(() => filterSlashCommands(slashQuery.value))

function handleKeyDown(event: KeyboardEvent) {
  if (!editor.value)
    return

  if (event.key === '/') {
    const { from } = editor.value.state.selection
    const textBefore = editor.value.state.doc.textBetween(Math.max(0, from - 1), from)

    if (from === 1 || /\s/.test(textBefore)) {
      const coords = editor.value.view.coordsAtPos(from)
      slashMenuPosition.value = { top: coords.bottom + 4, left: coords.left }
      showSlashMenu.value = true
      slashQuery.value = ''
      selectedSlashIndex.value = 0
    }
  }

  if (showSlashMenu.value) {
    if (event.key === 'Escape') {
      showSlashMenu.value = false
      event.preventDefault()
    }
    else if (event.key === 'ArrowDown') {
      selectedSlashIndex.value = Math.min(selectedSlashIndex.value + 1, filteredCommands.value.length - 1)
      event.preventDefault()
    }
    else if (event.key === 'ArrowUp') {
      selectedSlashIndex.value = Math.max(selectedSlashIndex.value - 1, 0)
      event.preventDefault()
    }
    else if (event.key === 'Enter' && filteredCommands.value.length > 0) {
      executeSlashCommand(filteredCommands.value[selectedSlashIndex.value])
      event.preventDefault()
    }
    else if (event.key === 'Backspace' && slashQuery.value === '') {
      showSlashMenu.value = false
    }
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      slashQuery.value += event.key
      selectedSlashIndex.value = 0
    }
  }
}

function handleClickOutside(event: MouseEvent) {
  if (slashMenuRef.value && !slashMenuRef.value.contains(event.target as Node)) {
    showSlashMenu.value = false
  }
}

watch(showSlashMenu, (show) => {
  if (show) {
    document.addEventListener('mousedown', handleClickOutside)
  }
  else {
    document.removeEventListener('mousedown', handleClickOutside)
  }
})

onMounted(() => {
  if (editor.value) {
    editor.value.view.dom.addEventListener('keydown', handleKeyDown)
  }
})

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.view.dom.removeEventListener('keydown', handleKeyDown)
  }
  document.removeEventListener('mousedown', handleClickOutside)
})

function executeSlashCommand(cmd: typeof slashCommands[0]) {
  if (!editor.value)
    return

  const { from } = editor.value.state.selection
  editor.value.chain().focus().deleteRange({ from: from - 1 - slashQuery.value.length, to: from }).run()

  switch (cmd.command) {
    case 'setHeading': {
      const level = Number.parseInt(cmd.id.replace('h', '')) as 1 | 2 | 3
      editor.value.chain().focus().toggleHeading({ level }).run()
      break
    }
    case 'toggleBulletList':
      editor.value.chain().focus().toggleBulletList().run()
      break
    case 'toggleOrderedList':
      editor.value.chain().focus().toggleOrderedList().run()
      break
    case 'toggleBlockquote':
      editor.value.chain().focus().toggleBlockquote().run()
      break
    case 'toggleCodeBlock':
      editor.value.chain().focus().toggleCodeBlock().run()
      break
    case 'insertTable':
      editor.value.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    case 'setImage': {
      const url = window.prompt('Enter image URL:')
      if (url) {
        editor.value.chain().focus().setImage({ src: url }).run()
      }
      break
    }
    case 'setHorizontalRule':
      editor.value.chain().focus().setHorizontalRule().run()
      break
  }

  showSlashMenu.value = false
  slashQuery.value = ''
}

function executeCommand(btn: MenuButton) {
  if (!editor.value)
    return

  switch (btn.command) {
    case 'toggleBold':
      editor.value.chain().focus().toggleBold().run()
      break
    case 'toggleItalic':
      editor.value.chain().focus().toggleItalic().run()
      break
    case 'toggleUnderline':
      editor.value.chain().focus().toggleUnderline().run()
      break
    case 'toggleStrike':
      editor.value.chain().focus().toggleStrike().run()
      break
    case 'toggleHeading': {
      const headingLevel = Number.parseInt(btn.id.replace('h', '')) as 1 | 2 | 3
      editor.value.chain().focus().toggleHeading({ level: headingLevel }).run()
      break
    }
    case 'toggleBulletList':
      editor.value.chain().focus().toggleBulletList().run()
      break
    case 'toggleOrderedList':
      editor.value.chain().focus().toggleOrderedList().run()
      break
    case 'toggleBlockquote':
      editor.value.chain().focus().toggleBlockquote().run()
      break
    case 'toggleCodeBlock':
      editor.value.chain().focus().toggleCodeBlock().run()
      break
    case 'setLink':
      if (editor.value.isActive('link')) {
        editor.value.chain().focus().unsetLink().run()
      }
      else {
        const linkUrl = window.prompt('Enter URL:')
        if (linkUrl) {
          editor.value.chain().focus().setLink({ href: linkUrl }).run()
        }
      }
      break
    case 'setImage': {
      const imageUrl = window.prompt('Enter image URL:')
      if (imageUrl) {
        editor.value.chain().focus().setImage({ src: imageUrl }).run()
      }
      break
    }
    case 'setTextAlign': {
      const align = btn.id.replace('align', '').toLowerCase() as 'left' | 'center' | 'right'
      editor.value.chain().focus().setTextAlign(align).run()
      break
    }
    case 'insertTable':
      editor.value.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    case 'undo':
      editor.value.chain().focus().undo().run()
      break
    case 'redo':
      editor.value.chain().focus().redo().run()
      break
    case 'unsetAllMarks':
      editor.value.chain().focus().unsetAllMarks().run()
      break
  }
}

function isActive(btn: MenuButton): boolean {
  if (!editor.value || !btn.isActive)
    return false

  if (btn.isActive.startsWith('heading-')) {
    const level = Number.parseInt(btn.isActive.split('-')[1])
    return editor.value.isActive('heading', { level })
  }
  if (btn.isActive.startsWith('textAlign-')) {
    const align = btn.isActive.split('-')[1]
    return editor.value.isActive({ textAlign: align })
  }
  return editor.value.isActive(btn.isActive)
}
</script>

<template>
  <div class="tps-rich-editor">
    <!-- Toolbar -->
    <div v-if="!readOnly && editor" class="tps-editor-toolbar">
      <div v-for="group in toolbarGroups" :key="group.id" class="tps-toolbar-group">
        <button
          v-for="btn in group.buttons"
          :key="btn.id"
          type="button"
          class="tps-toolbar-btn"
          :class="{ active: isActive(btn) }"
          :title="btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label"
          @click="executeCommand(btn)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path :d="allIcons[btn.icon]" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Editor Content -->
    <EditorContent v-if="editor" :editor="editor" class="tps-editor-content" />

    <!-- Slash Command Menu -->
    <div
      v-if="showSlashMenu && filteredCommands.length > 0"
      ref="slashMenuRef"
      class="tps-slash-menu"
      :style="{ position: 'fixed', top: `${slashMenuPosition.top}px`, left: `${slashMenuPosition.left}px` }"
    >
      <button
        v-for="(cmd, index) in filteredCommands"
        :key="cmd.id"
        type="button"
        class="tps-slash-item"
        :class="{ selected: index === selectedSlashIndex }"
        @click="executeSlashCommand(cmd)"
        @mouseenter="selectedSlashIndex = index"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path :d="allIcons[cmd.icon]" />
        </svg>
        <div class="tps-slash-item-text">
          <span class="tps-slash-item-label">{{ cmd.label }}</span>
          <span class="tps-slash-item-description">{{ cmd.description }}</span>
        </div>
      </button>
    </div>
  </div>
</template>
