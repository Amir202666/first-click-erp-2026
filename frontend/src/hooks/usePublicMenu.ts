import { useQuery } from '@tanstack/react-query'
import { publicMenuApi } from '../api/publicMenu'

export function usePublicMenu(slug: string | undefined) {
  return useQuery({
    queryKey: ['public-menu', slug],
    queryFn: () => publicMenuApi.getMenu(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}
