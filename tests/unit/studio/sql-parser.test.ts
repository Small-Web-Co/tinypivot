/**
 * Unit tests for SQL parser utilities
 */
import { describe, expect, it } from 'vitest'
import {
  extractTablesFromSQL,
  injectWhereClause,
} from '../../../packages/studio/src/utils/sql-parser'

describe('extractTablesFromSQL', () => {
  describe('simple queries', () => {
    it('should extract table from simple SELECT', () => {
      const sql = 'SELECT * FROM users'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('users')
      expect(result[0].type).toBe('from')
    })

    it('should handle lowercase keywords', () => {
      const sql = 'select * from orders'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('orders')
    })

    it('should handle mixed case', () => {
      const sql = 'SELECT * From Products'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Products')
    })
  })

  describe('schema-qualified names', () => {
    it('should extract schema and table name', () => {
      const sql = 'SELECT * FROM public.users'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('users')
      expect(result[0].schema).toBe('public')
      expect(result[0].fullName).toBe('public.users')
    })

    it('should handle quoted schema-qualified names', () => {
      const sql = 'SELECT * FROM "my_schema"."my_table"'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('my_table')
      expect(result[0].schema).toBe('my_schema')
    })

    it('should handle bracket-quoted names (SQL Server style)', () => {
      const sql = 'SELECT * FROM [dbo].[users]'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('users')
      expect(result[0].schema).toBe('dbo')
    })
  })

  describe('jOINs', () => {
    it('should extract tables from INNER JOIN', () => {
      const sql = 'SELECT * FROM orders INNER JOIN customers ON orders.customer_id = customers.id'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(2)
      expect(result.find(t => t.name === 'orders')?.type).toBe('from')
      expect(result.find(t => t.name === 'customers')?.type).toBe('join')
    })

    it('should extract tables from LEFT JOIN', () => {
      const sql = 'SELECT * FROM orders LEFT JOIN products ON orders.product_id = products.id'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(2)
      expect(result.find(t => t.name === 'products')?.type).toBe('join')
    })

    it('should extract tables from RIGHT JOIN', () => {
      const sql = 'SELECT * FROM orders RIGHT JOIN products ON orders.product_id = products.id'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(2)
    })

    it('should extract tables from multiple JOINs', () => {
      const sql = `
        SELECT *
        FROM orders o
        INNER JOIN customers c ON o.customer_id = c.id
        LEFT JOIN products p ON o.product_id = p.id
        JOIN categories cat ON p.category_id = cat.id
      `
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(4)
      expect(result.map(t => t.name)).toContain('orders')
      expect(result.map(t => t.name)).toContain('customers')
      expect(result.map(t => t.name)).toContain('products')
      expect(result.map(t => t.name)).toContain('categories')
    })

    it('should not include duplicate tables', () => {
      const sql = 'SELECT * FROM users JOIN users AS u2 ON users.manager_id = u2.id'
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('users')
    })
  })

  describe('complex queries', () => {
    it('should handle subqueries (extracts outer tables only)', () => {
      const sql = 'SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers)'
      const result = extractTablesFromSQL(sql)

      expect(result.map(t => t.name)).toContain('orders')
      expect(result.map(t => t.name)).toContain('customers')
    })

    it('should handle multiline queries', () => {
      const sql = `
        SELECT
          o.id,
          c.name
        FROM
          orders o
        LEFT JOIN
          customers c
        ON
          o.customer_id = c.id
      `
      const result = extractTablesFromSQL(sql)

      expect(result).toHaveLength(2)
    })
  })
})

describe('injectWhereClause', () => {
  describe('adding WHERE to queries without WHERE', () => {
    it('should add WHERE clause to simple SELECT', () => {
      const sql = 'SELECT * FROM users'
      const result = injectWhereClause(sql, 'status', 'active')

      expect(result).toBe('SELECT * FROM users WHERE status = \'active\'')
    })

    it('should add WHERE before GROUP BY', () => {
      const sql = 'SELECT region, COUNT(*) FROM orders GROUP BY region'
      const result = injectWhereClause(sql, 'status', 'completed')

      expect(result).toContain('WHERE status = \'completed\'')
      expect(result).toMatch(/WHERE.*GROUP BY/)
    })

    it('should add WHERE before ORDER BY', () => {
      const sql = 'SELECT * FROM products ORDER BY name'
      const result = injectWhereClause(sql, 'in_stock', true)

      expect(result).toContain('WHERE in_stock = TRUE')
      expect(result).toMatch(/WHERE.*ORDER BY/)
    })

    it('should add WHERE before LIMIT', () => {
      const sql = 'SELECT * FROM logs LIMIT 100'
      const result = injectWhereClause(sql, 'level', 'error')

      expect(result).toContain('WHERE level = \'error\'')
      expect(result).toMatch(/WHERE.*LIMIT/)
    })
  })

  describe('adding AND to existing WHERE', () => {
    it('should add AND to existing WHERE clause', () => {
      const sql = 'SELECT * FROM users WHERE role = \'admin\''
      const result = injectWhereClause(sql, 'status', 'active')

      expect(result).toContain('AND status = \'active\'')
      expect(result).toContain('WHERE role = \'admin\'')
    })

    it('should add AND before GROUP BY', () => {
      const sql = 'SELECT region, COUNT(*) FROM orders WHERE status = \'shipped\' GROUP BY region'
      const result = injectWhereClause(sql, 'year', 2024)

      expect(result).toContain('AND year = 2024')
      expect(result).toMatch(/AND year = 2024.*GROUP BY/)
    })

    it('should add AND before ORDER BY', () => {
      const sql = 'SELECT * FROM products WHERE category = \'electronics\' ORDER BY price'
      const result = injectWhereClause(sql, 'in_stock', true)

      expect(result).toContain('AND in_stock = TRUE')
      expect(result).toMatch(/AND.*ORDER BY/)
    })
  })

  describe('value types', () => {
    it('should handle string values with proper quoting', () => {
      const sql = 'SELECT * FROM users'
      const result = injectWhereClause(sql, 'name', 'John')

      expect(result).toContain('name = \'John\'')
    })

    it('should escape single quotes in strings', () => {
      const sql = 'SELECT * FROM users'
      const result = injectWhereClause(sql, 'name', 'O\'Brien')

      expect(result).toContain('name = \'O\'\'Brien\'')
    })

    it('should handle number values without quotes', () => {
      const sql = 'SELECT * FROM products'
      const result = injectWhereClause(sql, 'price', 99.99)

      expect(result).toContain('price = 99.99')
      expect(result).not.toContain('\'99.99\'')
    })

    it('should handle boolean TRUE', () => {
      const sql = 'SELECT * FROM users'
      const result = injectWhereClause(sql, 'is_active', true)

      expect(result).toContain('is_active = TRUE')
    })

    it('should handle boolean FALSE', () => {
      const sql = 'SELECT * FROM users'
      const result = injectWhereClause(sql, 'is_deleted', false)

      expect(result).toContain('is_deleted = FALSE')
    })

    it('should handle null with IS NULL', () => {
      const sql = 'SELECT * FROM orders'
      const result = injectWhereClause(sql, 'shipped_date', null)

      expect(result).toContain('shipped_date IS NULL')
    })

    it('should handle Date values', () => {
      const sql = 'SELECT * FROM orders'
      const date = new Date('2024-03-15T10:30:00.000Z')
      const result = injectWhereClause(sql, 'created_at', date)

      expect(result).toContain('created_at = \'2024-03-15T10:30:00.000Z\'')
    })

    it('should handle array of strings with IN clause', () => {
      const sql = 'SELECT * FROM products'
      const result = injectWhereClause(sql, 'category', ['electronics', 'books', 'toys'])

      expect(result).toContain('category IN (\'electronics\', \'books\', \'toys\')')
    })

    it('should handle array of numbers with IN clause', () => {
      const sql = 'SELECT * FROM orders'
      const result = injectWhereClause(sql, 'status_id', [1, 2, 3])

      expect(result).toContain('status_id IN (1, 2, 3)')
    })

    it('should handle empty array', () => {
      const sql = 'SELECT * FROM products'
      const result = injectWhereClause(sql, 'category', [])

      // Empty array should result in impossible condition
      expect(result).toContain('1 = 0')
    })

    it('should escape quotes in array string values', () => {
      const sql = 'SELECT * FROM users'
      const result = injectWhereClause(sql, 'name', ['O\'Reilly', 'McDonald\'s'])

      expect(result).toContain('\'O\'\'Reilly\'')
      expect(result).toContain('\'McDonald\'\'s\'')
    })
  })

  describe('complex queries', () => {
    it('should handle queries with JOINs', () => {
      const sql = 'SELECT o.*, c.name FROM orders o JOIN customers c ON o.customer_id = c.id'
      const result = injectWhereClause(sql, 'o.status', 'pending')

      expect(result).toContain('WHERE o.status = \'pending\'')
    })

    it('should handle queries with subqueries', () => {
      const sql = 'SELECT * FROM orders WHERE id IN (SELECT order_id FROM line_items)'
      const result = injectWhereClause(sql, 'status', 'active')

      expect(result).toContain('AND status = \'active\'')
    })

    it('should handle queries with HAVING', () => {
      const sql = 'SELECT region, SUM(amount) FROM orders GROUP BY region HAVING SUM(amount) > 1000'
      const result = injectWhereClause(sql, 'year', 2024)

      expect(result).toContain('WHERE year = 2024')
      expect(result).toMatch(/WHERE.*GROUP BY/)
    })

    it('should handle queries with UNION', () => {
      const sql = 'SELECT * FROM active_users UNION SELECT * FROM archived_users'
      const result = injectWhereClause(sql, 'status', 'verified')

      expect(result).toContain('WHERE status = \'verified\'')
      expect(result).toMatch(/WHERE.*UNION/)
    })
  })
})
