export const Colors = {
  // Azul principal (familia navy #102e50)
  primary:      '#102e50',   // navy principal — mismo que botones y headers
  primaryDark:  '#0b2240',   // navy oscuro — sombras
  primaryDeep:  '#071529',   // navy profundo
  primaryMid:   '#1a4a7a',   // navy medio
  primaryLight: '#4d8ab8',   // azul acero claro — visible sobre fondos oscuros y claros
  primaryPale:  '#8ab0cc',   // azul acero pálido
  primaryBg:    '#e8eef5',   // fondo muy claro — ya usado en avatares y chips

  // Neutros
  background:   '#F9FAFB',
  surface:      '#F1F5F9',
  white:        '#FFFFFF',
  black:        '#000000',
  text:         '#111827',
  textSecondary:'#6B7280',
  border:       '#E5E7EB',

  // Estado
  success:      '#10B981',
  warning:      '#F59E0B',
  error:        '#EF4444',

  // Barra lateral (dark)
  drawerBg:     '#0F172A',
  drawerItem:   'rgba(16,46,80,0.40)',
  drawerText:   '#F1F5F9',
  drawerMuted:  'rgba(255,255,255,0.45)',
  drawerBorder: 'rgba(255,255,255,0.08)',
} as const
