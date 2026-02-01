/**
 * Theme Types for TinyPivot Studio
 * Defines theme configuration for page styling
 */

/**
 * Theme preset names
 */
export type ThemePreset = 'article' | 'infographic' | 'dashboard' | 'presentation' | 'minimal' | 'custom'

/**
 * Font family options
 */
export type FontFamily =
  | 'system'
  | 'inter'
  | 'roboto'
  | 'open-sans'
  | 'lato'
  | 'poppins'
  | 'montserrat'
  | 'playfair-display'
  | 'merriweather'
  | 'source-sans-pro'

/**
 * Theme configuration for pages
 */
export interface ThemeConfig {
  /** Theme preset name (or 'custom' for fully custom) */
  preset?: ThemePreset
  /** Primary color (hex) */
  primaryColor?: string
  /** Secondary color (hex) */
  secondaryColor?: string
  /** Accent color (hex) */
  accentColor?: string
  /** Background color (hex) */
  backgroundColor?: string
  /** Text color (hex) */
  textColor?: string
  /** Muted text color (hex) */
  mutedTextColor?: string
  /** Border color (hex) */
  borderColor?: string
  /** Surface color for cards and widgets (hex) */
  surfaceColor?: string
  /** Font family for headings */
  headingFont?: FontFamily
  /** Font family for body text */
  bodyFont?: FontFamily
  /** Base font size in pixels */
  baseFontSize?: number
  /** Line height multiplier */
  lineHeight?: number
  /** Border radius in pixels */
  borderRadius?: number
  /** Spacing scale multiplier (1 = default) */
  spacingScale?: number
  /** Maximum content width in pixels (null for full width) */
  maxWidth?: number | null
  /** Padding around the page content in pixels */
  padding?: number
  /** Color palette for charts (array of hex colors) */
  chartColors?: string[]
  /** Dark mode variant */
  darkMode?: {
    backgroundColor?: string
    textColor?: string
    mutedTextColor?: string
    borderColor?: string
    surfaceColor?: string
  }
  /** Custom CSS to inject */
  customCSS?: string
}

/**
 * A complete theme definition with all required properties
 */
export interface Theme {
  /** Theme name */
  name: string
  /** Theme preset */
  preset: ThemePreset
  /** Theme configuration */
  config: Required<Omit<ThemeConfig, 'preset' | 'customCSS' | 'darkMode'>> & {
    darkMode?: ThemeConfig['darkMode']
    customCSS?: string
  }
}

/**
 * Default theme configurations for each preset
 */
export const DEFAULT_THEMES: Record<'article' | 'infographic' | 'dashboard', ThemeConfig> = {
  /**
   * Article theme - Clean, readable design for long-form content
   * Optimized for text-heavy pages with occasional visualizations
   */
  article: {
    preset: 'article',
    primaryColor: '#1a1a1a',
    secondaryColor: '#4a5568',
    accentColor: '#3182ce',
    backgroundColor: '#ffffff',
    textColor: '#1a1a1a',
    mutedTextColor: '#718096',
    borderColor: '#e2e8f0',
    surfaceColor: '#f7fafc',
    headingFont: 'merriweather',
    bodyFont: 'system',
    baseFontSize: 18,
    lineHeight: 1.7,
    borderRadius: 4,
    spacingScale: 1,
    maxWidth: 720,
    padding: 48,
    chartColors: ['#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#319795'],
    darkMode: {
      backgroundColor: '#1a202c',
      textColor: '#f7fafc',
      mutedTextColor: '#a0aec0',
      borderColor: '#2d3748',
      surfaceColor: '#2d3748',
    },
  },

  /**
   * Infographic theme - Visual and bold design
   * Optimized for charts, graphics, and visual storytelling
   */
  infographic: {
    preset: 'infographic',
    primaryColor: '#2d3748',
    secondaryColor: '#4a5568',
    accentColor: '#ed8936',
    backgroundColor: '#f7fafc',
    textColor: '#2d3748',
    mutedTextColor: '#718096',
    borderColor: '#e2e8f0',
    surfaceColor: '#ffffff',
    headingFont: 'poppins',
    bodyFont: 'inter',
    baseFontSize: 16,
    lineHeight: 1.5,
    borderRadius: 12,
    spacingScale: 1.25,
    maxWidth: 1200,
    padding: 32,
    chartColors: ['#ed8936', '#38b2ac', '#805ad5', '#e53e3e', '#38a169', '#3182ce', '#d69e2e'],
    darkMode: {
      backgroundColor: '#1a202c',
      textColor: '#f7fafc',
      mutedTextColor: '#a0aec0',
      borderColor: '#2d3748',
      surfaceColor: '#2d3748',
    },
  },

  /**
   * Dashboard theme - Dense, functional design
   * Optimized for multiple widgets and real-time data
   */
  dashboard: {
    preset: 'dashboard',
    primaryColor: '#1a202c',
    secondaryColor: '#2d3748',
    accentColor: '#4299e1',
    backgroundColor: '#edf2f7',
    textColor: '#1a202c',
    mutedTextColor: '#718096',
    borderColor: '#cbd5e0',
    surfaceColor: '#ffffff',
    headingFont: 'inter',
    bodyFont: 'inter',
    baseFontSize: 14,
    lineHeight: 1.4,
    borderRadius: 8,
    spacingScale: 0.875,
    maxWidth: null, // Full width
    padding: 24,
    chartColors: ['#4299e1', '#48bb78', '#ed8936', '#f56565', '#9f7aea', '#38b2ac', '#ecc94b'],
    darkMode: {
      backgroundColor: '#0d1117',
      textColor: '#f0f6fc',
      mutedTextColor: '#8b949e',
      borderColor: '#30363d',
      surfaceColor: '#161b22',
    },
  },
}

/**
 * Creates a merged theme config with defaults applied
 */
export function mergeThemeWithDefaults(
  theme: ThemeConfig | undefined,
  defaultPreset: 'article' | 'infographic' | 'dashboard' = 'dashboard',
): ThemeConfig {
  const base = DEFAULT_THEMES[defaultPreset]
  if (!theme) {
    return { ...base }
  }

  // If a preset is specified, use that as the base
  const presetBase = theme.preset && theme.preset !== 'custom'
    ? DEFAULT_THEMES[theme.preset as 'article' | 'infographic' | 'dashboard'] ?? base
    : base

  return {
    ...presetBase,
    ...theme,
    darkMode: theme.darkMode
      ? { ...presetBase.darkMode, ...theme.darkMode }
      : presetBase.darkMode,
  }
}
