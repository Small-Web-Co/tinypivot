/**
 * TinyPivot Core - AI Prompt Engineering
 * System prompts and context builders for the AI Data Analyst
 */
import type { AIColumnSchema, AIDataSource, AITableSchema } from '../types'

/**
 * Build the system prompt for the AI Data Analyst
 * @param dataSources - List of available data sources
 * @param schemas - Map of table schemas (selected table schema)
 * @param selectedSourceId - Currently selected data source ID
 * @param allSchemas - Optional: ALL table schemas for enabling JOINs
 */
export function buildSystemPrompt(
  dataSources: AIDataSource[],
  schemas: Map<string, AITableSchema>,
  selectedSourceId?: string,
  allSchemas?: AITableSchema[],
): string {
  const selectedSchema = selectedSourceId ? schemas.get(selectedSourceId) : undefined
  const selectedSource = selectedSourceId
    ? dataSources.find(ds => ds.id === selectedSourceId)
    : undefined

  // Filter out the selected table from allSchemas to get "other tables"
  const otherTables = allSchemas?.filter(s => s.table !== selectedSchema?.table) || []

  return `You are a data analyst assistant. Your job is to translate user questions into SQL queries and return data results.

## CRITICAL: ALWAYS GENERATE A SQL QUERY
**Every response MUST include a SQL query.** The user is here to explore data - they expect to see results.
- If the user asks a question → Generate a query to answer it
- If the user says "show me" or "what are" → Generate a query
- If the user asks for trends/patterns → Generate an aggregation query
- If the question is vague → Make reasonable assumptions and generate a query anyway
- If you're unsure what they want → Generate a sensible default query (like top 10 rows with key columns)

**NEVER respond with only text. ALWAYS include a SQL query in your response.**

## Available Data Sources
${formatDataSourcesList(dataSources)}

${selectedSource && selectedSchema ? formatSelectedSchemaContext(selectedSource, selectedSchema) : '## No Data Source Selected\nPlease ask the user to select a data source first.'}

${otherTables.length > 0 ? formatRelatedTablesContext(otherTables) : ''}

## Query Rules
1. **READ-ONLY**: ONLY use SELECT. NEVER use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or any write operations.
2. **LIMIT RESULTS**: Always use LIMIT (default 100-1000 rows) to avoid overwhelming results.
3. **PRIMARY TABLE**: The main table is \`${selectedSchema?.table || 'table_name'}\`
4. **JOINs ALLOWED**: You CAN JOIN with other tables listed in "Related Tables" when the user needs data from multiple tables.
5. **BE SPECIFIC**: Select relevant columns, not SELECT * (unless showing sample data)

## Query Format
Output queries in this EXACT format (the system auto-executes SQL blocks):

\`\`\`sql
SELECT column1, column2 FROM ${selectedSchema?.table || 'table_name'} WHERE condition LIMIT 100
\`\`\`

For JOINs (when user needs data from related tables):
\`\`\`sql
SELECT p.column1, r.column2 
FROM ${selectedSchema?.table || 'primary_table'} p
JOIN related_table r ON p.foreign_key = r.id
WHERE condition
LIMIT 100
\`\`\`

For complex analysis, use CTEs:
\`\`\`sql
WITH summary AS (
  SELECT category, COUNT(*) as count
  FROM ${selectedSchema?.table || 'table_name'}
  GROUP BY category
)
SELECT * FROM summary ORDER BY count DESC LIMIT 20
\`\`\`

## Response Format
Keep responses concise and insight-focused:
1. **Start with the SQL query** in a code block (REQUIRED) - this will be extracted and hidden from the user
2. **Then provide your insight/analysis** (2-3 sentences) explaining what the data shows
3. **Optional**: Suggest 1-2 follow-up questions

**IMPORTANT**: The SQL block is automatically extracted and shown separately. Your text response should focus on INSIGHTS about the data, not describing the query itself. Don't say "I'm querying..." or "This query shows...". Instead, provide the analytical insight directly.

Example response:
"\`\`\`sql
SELECT department, AVG(salary) as avg_salary FROM employees GROUP BY department ORDER BY avg_salary DESC LIMIT 10
\`\`\`

Engineering and Product teams have the highest average salaries at $145K and $138K respectively, while Support and Operations are at the lower end around $75K. This 2x salary gap may indicate market-driven compensation or role complexity differences.

Want to see how this breaks down by job level?"

## If Query Fails
- Acknowledge the error briefly
- Provide a corrected query immediately
- Don't apologize excessively, just fix it`
}

/**
 * Format the list of available data sources for the prompt
 */
function formatDataSourcesList(dataSources: AIDataSource[]): string {
  if (dataSources.length === 0) {
    return 'No data sources configured.'
  }

  return dataSources
    .map((ds) => {
      const desc = ds.description ? `: ${ds.description}` : ''
      return `- **${ds.name}** (${ds.table})${desc}`
    })
    .join('\n')
}

/**
 * Format the schema context for the currently selected data source
 */
function formatSelectedSchemaContext(
  source: AIDataSource,
  schema: AITableSchema,
): string {
  // Filter out hidden columns
  const visibleColumns = schema.columns.filter((col) => {
    const override = source.columns?.find(c => c.name === col.name)
    return !override?.hidden
  })

  // Merge descriptions from overrides
  const columnsWithDescriptions = visibleColumns.map((col) => {
    const override = source.columns?.find(c => c.name === col.name)
    return {
      ...col,
      description: override?.description || col.description,
    }
  })

  return `## Currently Selected: ${source.name}
Table: \`${schema.table}\`
${source.description ? `Description: ${source.description}` : ''}

### Columns
${formatColumnsTable(columnsWithDescriptions)}

### Query Tips
- Use column names exactly as shown above
- The table name is \`${schema.table}\`
- For text searches, use ILIKE for case-insensitive matching
- For date columns, use standard SQL date functions`
}

/**
 * Format the context for related tables that can be JOINed
 */
function formatRelatedTablesContext(tables: AITableSchema[]): string {
  if (tables.length === 0)
    return ''

  const tablesSummary = tables.map((table) => {
    // Show table name and key columns (likely join keys)
    const keyColumns = table.columns
      .filter(col =>
        col.name === 'id'
        || col.name.endsWith('_id')
        || col.name.startsWith('id_')
        || col.name === 'uuid',
      )
      .map(col => `\`${col.name}\``)
      .join(', ')

    const otherColumns = table.columns
      .filter(col =>
        col.name !== 'id'
        && !col.name.endsWith('_id')
        && !col.name.startsWith('id_')
        && col.name !== 'uuid',
      )
      .slice(0, 5) // Show up to 5 other columns
      .map(col => `\`${col.name}\` (${col.type})`)
      .join(', ')

    const moreCount = table.columns.length - (keyColumns ? keyColumns.split(',').length : 0) - 5
    const moreText = moreCount > 0 ? `, +${moreCount} more` : ''

    return `- **\`${table.table}\`**
  - Keys: ${keyColumns || 'none'}
  - Columns: ${otherColumns}${moreText}`
  }).join('\n')

  return `## Related Tables (Available for JOINs)
You can JOIN with these tables when the user needs additional data.
Look for foreign key relationships (columns ending in \`_id\`).

${tablesSummary}
`
}

/**
 * Format columns as a readable table for the prompt
 */
function formatColumnsTable(columns: AIColumnSchema[]): string {
  return columns
    .map((col) => {
      const nullable = col.nullable ? 'nullable' : 'required'
      const desc = col.description ? ` - ${col.description}` : ''
      return `- \`${col.name}\` (${col.type}, ${nullable})${desc}`
    })
    .join('\n')
}

/**
 * Build a user message with additional context
 */
export function buildUserMessage(
  userInput: string,
  context?: {
    previousQueryFailed?: boolean
    errorMessage?: string
    rowCount?: number
  },
): string {
  let message = userInput

  if (context?.previousQueryFailed && context.errorMessage) {
    message = `[Previous query failed: ${context.errorMessage}]\n\n${userInput}`
  }

  return message
}

/**
 * Extract SQL query from AI response
 * Returns the SQL if found, null otherwise
 */
export function extractSQLFromResponse(response: string): string | null {
  // Match SQL code blocks
  const sqlBlockRegex = /```sql\s*([\s\S]*?)```/i
  const match = response.match(sqlBlockRegex)

  if (match && match[1]) {
    const sql = match[1].trim()

    // Validate it's a SELECT statement
    if (!sql.toUpperCase().startsWith('SELECT')) {
      return null
    }

    return sql
  }

  return null
}

/**
 * Validate that a SQL query is safe (read-only)
 */
export function validateSQLSafety(sql: string): { valid: boolean, error?: string } {
  const upperSQL = sql.toUpperCase().trim()

  // Must start with SELECT or WITH (for CTEs)
  if (!upperSQL.startsWith('SELECT') && !upperSQL.startsWith('WITH')) {
    return { valid: false, error: 'Only SELECT queries (including CTEs with WITH) are allowed' }
  }

  // If it starts with WITH, ensure it ends with a SELECT
  if (upperSQL.startsWith('WITH') && !upperSQL.includes('SELECT')) {
    return { valid: false, error: 'CTE queries must include a final SELECT statement' }
  }

  // Check for dangerous keywords
  const dangerousKeywords = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'ALTER',
    'TRUNCATE',
    'CREATE',
    'GRANT',
    'REVOKE',
    'EXEC',
    'EXECUTE',
    'INTO', // SELECT INTO
  ]

  for (const keyword of dangerousKeywords) {
    // Check for keyword as a whole word (not part of column name)
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(sql)) {
      return { valid: false, error: `Query contains forbidden keyword: ${keyword}` }
    }
  }

  // Check for multiple statements
  if (sql.includes(';')) {
    const statements = sql.split(';').filter(s => s.trim().length > 0)
    if (statements.length > 1) {
      return { valid: false, error: 'Multiple statements are not allowed' }
    }
  }

  return { valid: true }
}

/**
 * Build a summary message after query results are returned
 */
export function buildResultsSummary(
  rowCount: number,
  truncated: boolean,
  maxRows: number,
): string {
  if (rowCount === 0) {
    return 'The query returned no results. You may want to adjust your filters or try a different approach.'
  }

  if (truncated) {
    return `Retrieved ${rowCount} rows (limited to ${maxRows}). There may be more data matching your query. Consider adding filters to narrow down the results.`
  }

  return `Retrieved ${rowCount} row${rowCount === 1 ? '' : 's'}.`
}

/**
 * Strip SQL code blocks from message content for display
 * The SQL is stored in metadata and shown via a button instead
 */
export function stripSQLFromContent(content: string): string {
  // Remove SQL code blocks and any surrounding whitespace
  return content
    .replace(/```sql\s*[\s\S]*?```\s*/gi, '')
    .trim()
}
