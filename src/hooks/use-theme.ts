import { useContext } from 'react'
import { ThemeProviderContext } from '@/lib/theme-context'

export const useTheme = () => {
  return useContext(ThemeProviderContext)
}
