
import { Suit, Rank, CardData, HandType } from '../types';

export const createDeck = (): CardData[] => {
  const deck: CardData[] = [];
  const suits = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
  const ranks = [
    Rank.Ace, Rank.Two, Rank.Three, Rank.Four, Rank.Five, 
    Rank.Six, Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, 
    Rank.Jack, Rank.Queen, Rank.King
  ];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, isFaceUp: false });
    }
  }
  return shuffle(deck);
};

export const shuffle = (deck: CardData[]): CardData[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const getCardValue = (card: CardData, currentTotal: number, aceAsOne: boolean = false): number => {
  if (card.rank === Rank.Jack || card.rank === Rank.Queen || card.rank === Rank.King || card.rank === Rank.Ten) {
    return 10;
  }
  if (card.rank === Rank.Ace) {
    if (aceAsOne) return 1;
    // In Xì Dách, Ace can be 1, 10, or 11.
    // Usually logic: 11 if possible, else 10 if possible, else 1.
    return 11;
  }
  return parseInt(card.rank);
};

export const calculateHandScore = (hand: CardData[]): number => {
  let total = 0;
  let aceCount = 0;

  for (const card of hand) {
    if (card.rank === Rank.Ace) {
      aceCount++;
    } else {
      total += getCardValue(card, total);
    }
  }

  // Handle Aces flexibly
  for (let i = 0; i < aceCount; i++) {
    if (total + 11 <= 21 && (total + 11 + (aceCount - i - 1) <= 21)) {
      total += 11;
    } else if (total + 10 <= 21 && (total + 10 + (aceCount - i - 1) <= 21)) {
        total += 10;
    } else {
      total += 1;
    }
  }

  return total;
};

export const identifyHandType = (hand: CardData[]): HandType => {
  const score = calculateHandScore(hand);
  const count = hand.length;

  // Xì Bàng: 2 Aces in first 2 cards
  if (count === 2 && hand.every(c => c.rank === Rank.Ace)) {
    return HandType.XiBang;
  }

  // Xì Dách: 1 Ace + 1 (10, J, Q, K) in first 2 cards
  if (count === 2) {
    const hasAce = hand.some(c => c.rank === Rank.Ace);
    const hasTenValue = hand.some(c => [Rank.Ten, Rank.Jack, Rank.Queen, Rank.King].includes(c.rank));
    if (hasAce && hasTenValue) return HandType.XiDach;
  }

  // Ngũ Linh: 5 cards with total score <= 21
  if (count === 5 && score <= 21) {
    return HandType.NguLinh;
  }

  if (score > 21) return HandType.Quac;
  if (score < 16) return HandType.Non; // Minimum to stay for player is usually 16, dealer 15

  return HandType.Normal;
};

export const compareHands = (playerHand: CardData[], dealerHand: CardData[]): 'PLAYER' | 'DEALER' | 'PUSH' => {
  const pType = identifyHandType(playerHand);
  const dType = identifyHandType(dealerHand);
  const pScore = calculateHandScore(playerHand);
  const dScore = calculateHandScore(dealerHand);

  // Rank: Xi Bang > Xi Dach > Ngu Linh > Points (21 down to 16) > Quac / Non

  // Hierarchy of hand types
  const typeRank = {
    [HandType.XiBang]: 5,
    [HandType.XiDach]: 4,
    [HandType.NguLinh]: 3,
    [HandType.Normal]: 2,
    [HandType.Quac]: 1,
    [HandType.Non]: 0,
  };

  if (typeRank[pType] > typeRank[dType]) return 'PLAYER';
  if (typeRank[dType] > typeRank[pType]) return 'DEALER';

  // If same type
  if (pType === HandType.Normal) {
    if (pScore > dScore) return 'PLAYER';
    if (dScore > pScore) return 'DEALER';
    return 'PUSH';
  }

  if (pType === HandType.NguLinh) {
    if (pScore < dScore) return 'PLAYER'; // For Ngu Linh, lower is better if tied? (Wikipedia variation, but usually points matters)
    if (dScore < pScore) return 'DEALER';
    return 'PUSH';
  }

  // Xi Bang, Xi Dach ties are push
  return 'PUSH';
};
