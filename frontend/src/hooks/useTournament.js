import { useQuery } from '@tanstack/react-query';
import { tournamentsApi } from '@/lib/api';

// Get single tournament details
export function useTournament(id, mini = false) {
  return useQuery({
    queryKey: ['tournament', id, mini],
    queryFn: async () => {
      const response = await tournamentsApi.getById(id, mini);
      return response.data.data;
    },
    enabled: !!id,
  });
}

