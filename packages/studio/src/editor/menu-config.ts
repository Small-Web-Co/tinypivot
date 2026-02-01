/**
 * Toolbar and menu configuration for the rich text editor
 */

export interface MenuButton {
  id: string
  label: string
  icon: string
  command: string
  shortcut?: string
  isActive?: string
}

export interface MenuGroup {
  id: string
  buttons: MenuButton[]
}

/**
 * SVG icon paths for toolbar buttons
 */
export const menuIcons: Record<string, string> = {
  bold: 'M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z',
  italic: 'M19 4h-9 M14 20H5 M15 4L9 20',
  underline: 'M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3 M4 21h16',
  strikethrough: 'M16 4H9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H7 M4 12h16',
  h1: 'M4 12h8 M4 18V6 M12 18V6 M17 12l3-2v8',
  h2: 'M4 12h8 M4 18V6 M12 18V6 M21 18h-4l4-6a2 2 0 0 0-4 0',
  h3: 'M4 12h8 M4 18V6 M12 18V6 M17.5 10.5a1.5 1.5 0 0 1 3 0v0a1.5 1.5 0 0 1-3 0 M17.5 15.5a1.5 1.5 0 0 1 3 0v0a1.5 1.5 0 0 1-3 0',
  bulletList: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  orderedList: 'M10 6h11 M10 12h11 M10 18h11 M4 6h1v4 M4 10h2 M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  blockquote: 'M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z',
  codeBlock: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  image: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  alignLeft: 'M17 10H3 M21 6H3 M21 14H3 M17 18H3',
  alignCenter: 'M18 10H6 M21 6H3 M21 14H3 M18 18H6',
  alignRight: 'M21 10H7 M21 6H3 M21 14H3 M21 18H7',
  table: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  undo: 'M3 7v6h6 M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.87 3.2L3 13',
  redo: 'M21 7v6h-6 M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.87 3.2L21 13',
  clearFormat: 'M6 18L18 6M6 6l12 12',
}

export const toolbarGroups: MenuGroup[] = [
  {
    id: 'text',
    buttons: [
      { id: 'bold', label: 'Bold', icon: 'bold', command: 'toggleBold', shortcut: 'Mod-b', isActive: 'bold' },
      { id: 'italic', label: 'Italic', icon: 'italic', command: 'toggleItalic', shortcut: 'Mod-i', isActive: 'italic' },
      { id: 'underline', label: 'Underline', icon: 'underline', command: 'toggleUnderline', shortcut: 'Mod-u', isActive: 'underline' },
      { id: 'strike', label: 'Strikethrough', icon: 'strikethrough', command: 'toggleStrike', shortcut: 'Mod-Shift-s', isActive: 'strike' },
    ],
  },
  {
    id: 'headings',
    buttons: [
      { id: 'h1', label: 'Heading 1', icon: 'h1', command: 'toggleHeading', shortcut: 'Mod-Alt-1', isActive: 'heading-1' },
      { id: 'h2', label: 'Heading 2', icon: 'h2', command: 'toggleHeading', shortcut: 'Mod-Alt-2', isActive: 'heading-2' },
      { id: 'h3', label: 'Heading 3', icon: 'h3', command: 'toggleHeading', shortcut: 'Mod-Alt-3', isActive: 'heading-3' },
    ],
  },
  {
    id: 'lists',
    buttons: [
      { id: 'bulletList', label: 'Bullet List', icon: 'bulletList', command: 'toggleBulletList', shortcut: 'Mod-Shift-8', isActive: 'bulletList' },
      { id: 'orderedList', label: 'Ordered List', icon: 'orderedList', command: 'toggleOrderedList', shortcut: 'Mod-Shift-7', isActive: 'orderedList' },
    ],
  },
  {
    id: 'blocks',
    buttons: [
      { id: 'blockquote', label: 'Blockquote', icon: 'blockquote', command: 'toggleBlockquote', shortcut: 'Mod-Shift-b', isActive: 'blockquote' },
      { id: 'codeBlock', label: 'Code Block', icon: 'codeBlock', command: 'toggleCodeBlock', shortcut: 'Mod-Alt-c', isActive: 'codeBlock' },
    ],
  },
  {
    id: 'media',
    buttons: [
      { id: 'link', label: 'Link', icon: 'link', command: 'setLink', shortcut: 'Mod-k', isActive: 'link' },
      { id: 'image', label: 'Image', icon: 'image', command: 'setImage', shortcut: 'Mod-Shift-i' },
    ],
  },
  {
    id: 'align',
    buttons: [
      { id: 'alignLeft', label: 'Align Left', icon: 'alignLeft', command: 'setTextAlign', isActive: 'textAlign-left' },
      { id: 'alignCenter', label: 'Align Center', icon: 'alignCenter', command: 'setTextAlign', isActive: 'textAlign-center' },
      { id: 'alignRight', label: 'Align Right', icon: 'alignRight', command: 'setTextAlign', isActive: 'textAlign-right' },
    ],
  },
  {
    id: 'table',
    buttons: [
      { id: 'table', label: 'Insert Table', icon: 'table', command: 'insertTable' },
    ],
  },
  {
    id: 'history',
    buttons: [
      { id: 'undo', label: 'Undo', icon: 'undo', command: 'undo', shortcut: 'Mod-z' },
      { id: 'redo', label: 'Redo', icon: 'redo', command: 'redo', shortcut: 'Mod-Shift-z' },
    ],
  },
]

export const bubbleMenuButtons: MenuButton[] = [
  { id: 'bold', label: 'Bold', icon: 'bold', command: 'toggleBold', isActive: 'bold' },
  { id: 'italic', label: 'Italic', icon: 'italic', command: 'toggleItalic', isActive: 'italic' },
  { id: 'underline', label: 'Underline', icon: 'underline', command: 'toggleUnderline', isActive: 'underline' },
  { id: 'strike', label: 'Strikethrough', icon: 'strikethrough', command: 'toggleStrike', isActive: 'strike' },
  { id: 'link', label: 'Link', icon: 'link', command: 'setLink', isActive: 'link' },
  { id: 'clearFormat', label: 'Clear Formatting', icon: 'clearFormat', command: 'unsetAllMarks' },
]
