/**
 * Shared Tiptap extension configurations
 * These are plain objects - actual extension imports happen in framework packages
 */

export interface ExtensionConfig {
  name: string
  options?: Record<string, unknown>
}

/**
 * Core extensions included in StarterKit
 * StarterKit includes: Document, Paragraph, Text, Bold, Italic, Strike, Code,
 * Heading, Blockquote, BulletList, OrderedList, ListItem, CodeBlock, HorizontalRule,
 * HardBreak, History, Dropcursor, Gapcursor
 */
export const starterKitConfig: ExtensionConfig = {
  name: 'starterKit',
  options: {
    heading: {
      levels: [1, 2, 3],
    },
  },
}

export const linkConfig: ExtensionConfig = {
  name: 'link',
  options: {
    openOnClick: false,
    HTMLAttributes: {
      class: 'tps-editor-link',
    },
  },
}

export const imageConfig: ExtensionConfig = {
  name: 'image',
  options: {
    inline: false,
    allowBase64: true,
    HTMLAttributes: {
      class: 'tps-editor-image',
    },
  },
}

export const tableConfig: ExtensionConfig = {
  name: 'table',
  options: {
    resizable: true,
    HTMLAttributes: {
      class: 'tps-editor-table',
    },
  },
}

export const textAlignConfig: ExtensionConfig = {
  name: 'textAlign',
  options: {
    types: ['heading', 'paragraph'],
  },
}

export const placeholderConfig: ExtensionConfig = {
  name: 'placeholder',
  options: {
    placeholder: 'Type something, or press / for commands...',
  },
}

export const underlineConfig: ExtensionConfig = {
  name: 'underline',
  options: {},
}

export const allExtensionConfigs = [
  starterKitConfig,
  linkConfig,
  imageConfig,
  tableConfig,
  textAlignConfig,
  placeholderConfig,
  underlineConfig,
]
