export type PlayerLevel = 'beginner' | 'intermediate' | 'confirmed';
export type Gender = 'male' | 'female';
export type PaymentMethod = 'online' | 'cash';
export type PaymentType = 'single' | 'shared';
export type RacketNeeded = 0 | 1 | 2;
export type TableName = 'gold' | 'silver' | 'bronze' | 'copper';

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: Gender;
  nationality: string;
  governorate: string;
  phone: string;
  email: string;
  level: PlayerLevel;
  isCaptain: boolean;
}

export interface Team {
  id: string;
  teamId: string;
  players: [Player, Player];
  level: PlayerLevel;
  racketsNeeded: RacketNeeded;
  restaurationOption: string;
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  amount: number;
  paymentStatus: 'pending' | 'confirmed' | 'cancelled';
  registrationDate: Date;
  notes?: string;
}

export interface Match {
  id: string;
  teamA: Team;
  teamB: Team;
  setA: number;
  setB: number;
  gameA: number;
  gameB: number;
  isTiebreak: boolean;
  tiebreakScore?: { pointsA: number; pointsB: number };
  winner?: Team;
  status: 'pending' | 'in_progress' | 'completed';
  round: number;
  table: TableName;
}

export interface Tournament {
  id: string;
  name: string;
  date: Date;
  location: string;
  totalTeams: number;
  teams: Team[];
  matches: Match[];
  goldTable: Team[];
  silverTable: Team[];
  bronzeTable: Team[];
  copperTable: Team[];
  status: 'planning' | 'active' | 'completed';
}

export interface SponsorshipRequest {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  sponsorshipLevel: 'platinum' | 'gold' | 'silver' | 'partner';
  message: string;
  submittedAt: Date;
  status: 'new' | 'reviewed' | 'accepted' | 'rejected';
}
