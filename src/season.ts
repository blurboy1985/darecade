export type SeasonProgress = {
  id: string;
  name: string;
  startsAt: number;
  endsAt: number | null;
  xp: number;
};
export type SeasonStanding = SeasonProgress & {
  points: number;
  rank: number | null;
  standings: { id: string; name: string; points: number; rank: number }[];
};
