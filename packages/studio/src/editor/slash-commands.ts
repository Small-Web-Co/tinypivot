/**
 * Slash command configuration for quick block insertion
 */

export interface SlashCommand {
  id: string
  label: string
  description: string
  icon: string
  command: string
  aliases?: string[]
}

export const slashCommands: SlashCommand[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'h1',
    command: 'setHeading',
    aliases: ['heading1', 'title'],
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'h2',
    command: 'setHeading',
    aliases: ['heading2', 'subtitle'],
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'h3',
    command: 'setHeading',
    aliases: ['heading3'],
  },
  {
    id: 'bullet',
    label: 'Bullet List',
    description: 'Create a bulleted list',
    icon: 'bulletList',
    command: 'toggleBulletList',
    aliases: ['ul', 'unordered'],
  },
  {
    id: 'numbered',
    label: 'Numbered List',
    description: 'Create a numbered list',
    icon: 'orderedList',
    command: 'toggleOrderedList',
    aliases: ['ol', 'ordered'],
  },
  {
    id: 'quote',
    label: 'Blockquote',
    description: 'Add a quote block',
    icon: 'blockquote',
    command: 'toggleBlockquote',
    aliases: ['blockquote', 'bq'],
  },
  {
    id: 'code',
    label: 'Code Block',
    description: 'Add a code block',
    icon: 'codeBlock',
    command: 'toggleCodeBlock',
    aliases: ['codeblock', 'pre'],
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Insert a 3x3 table',
    icon: 'table',
    command: 'insertTable',
    aliases: ['grid'],
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Insert an image',
    icon: 'image',
    command: 'setImage',
    aliases: ['img', 'picture'],
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Insert a horizontal line',
    icon: 'divider',
    command: 'setHorizontalRule',
    aliases: ['hr', 'line', 'separator'],
  },
]

export function filterSlashCommands(query: string): SlashCommand[] {
  const lowerQuery = query.toLowerCase()
  return slashCommands.filter(cmd =>
    cmd.label.toLowerCase().includes(lowerQuery)
    || cmd.description.toLowerCase().includes(lowerQuery)
    || cmd.aliases?.some(alias => alias.includes(lowerQuery)),
  )
}

export const slashCommandIcons: Record<string, string> = {
  divider: 'M5 12h14',
}
