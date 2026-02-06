
export enum Suit {
  Hearts = '♥',
  Diamonds = '♦',
  Clubs = '♣',
  Spades = '♠'
}

export enum Rank {
  Ace = 'A',
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = '10',
  Jack = 'J',
  Queen = 'Q',
  King = 'K'
}

export interface CardData {
  suit: Suit;
  rank: Rank;
  isFaceUp: boolean;
}

export enum GamePhase {
  Lobby = 'LOBBY',
  Betting = 'BETTING',
  InitialDeal = 'INITIAL_DEAL',
  Turns = 'TURNS',
  DealerTurn = 'DEALER_TURN',
  Resolution = 'RESOLUTION'
}

export enum HandType {
  Normal = 'NORMAL',
  XiBang = 'XI_BANG',
  XiDach = 'XI_DACH',
  NguLinh = 'NGU_LINH',
  Quac = 'QUAC',
  Non = 'NON'
}

export interface Player {
  id: string;
  name: string;
  hand: CardData[];
  chips: number;
  bet: number;
  isReady: boolean;
  status: 'WAITING' | 'PLAYING' | 'DONE' | 'QUAC' | 'STAY';
}

export interface GameState {
  roomCode: string;
  isHost: boolean;
  players: Player[];
  dealerHand: CardData[];
  phase: GamePhase;
  activePlayerIndex: number;
  deck: CardData[];
  message: string;
  dealerCommentary: string;
  history: string[];
}

export enum MessageType {
  JOIN = 'JOIN',
  STATE_UPDATE = 'STATE_UPDATE',
  PLAYER_ACTION = 'PLAYER_ACTION',
  CHAT = 'CHAT'
}

export interface PeerMessage {
  type: MessageType;
  payload: any;
  senderId: string;
  senderName: string;
}
