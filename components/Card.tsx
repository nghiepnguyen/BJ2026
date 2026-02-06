
import React from 'react';
import { CardData, Suit } from '../types';

interface CardProps {
  card: CardData;
  index: number;
}

const Card: React.FC<CardProps> = ({ card, index }) => {
  const isRed = card.suit === Suit.Hearts || card.suit === Suit.Diamonds;
  
  return (
    <div 
      className={`relative w-24 h-36 md:w-32 md:h-48 perspective-1000 animate-deal`}
      style={{ 
        animationDelay: `${index * 0.1}s`,
        zIndex: index 
      }}
    >
      <div className={`card-inner relative w-full h-full rounded-xl shadow-xl ${card.isFaceUp ? '' : 'card-flipped'}`}>
        {/* Front */}
        <div className="card-face absolute inset-0 w-full h-full bg-white rounded-xl border-2 border-gray-200 flex flex-col p-2 backface-hidden">
          <div className={`text-xl md:text-2xl font-bold flex flex-col leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
            <span>{card.rank}</span>
            <span className="text-lg md:text-xl">{card.suit}</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className={`text-4xl md:text-6xl ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
              {card.suit}
            </span>
          </div>
          <div className={`text-xl md:text-2xl font-bold flex flex-col leading-none rotate-180 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
            <span>{card.rank}</span>
            <span className="text-lg md:text-xl">{card.suit}</span>
          </div>
        </div>
        
        {/* Back */}
        <div className="card-face card-back absolute inset-0 w-full h-full rounded-xl border-4 border-white bg-blue-800 flex items-center justify-center backface-hidden shadow-inner overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
          <div className="z-10 text-white font-bold text-center">
            <div className="text-2xl opacity-50">♠ ♥</div>
            <div className="text-sm tracking-widest uppercase opacity-80">Master</div>
            <div className="text-2xl opacity-50">♣ ♦</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Card;
