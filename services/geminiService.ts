
import { GoogleGenAI } from "@google/genai";
import { CardData, HandType, GamePhase } from "../types";

// Always use named parameter for apiKey and get it directly from process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getDealerCommentary = async (
  playerHand: CardData[],
  dealerHand: CardData[],
  phase: GamePhase,
  playerScore: number,
  dealerScore: number,
  result?: string
): Promise<string> => {
  const modelName = 'gemini-3-flash-preview';
  
  const playerHandStr = playerHand.map(c => `${c.rank}${c.suit}`).join(', ');
  const dealerHandStr = dealerHand.map(c => c.isFaceUp ? `${c.rank}${c.suit}` : '??').join(', ');

  const prompt = `You are a charismatic, slightly witty Vietnamese casino dealer playing "Xì Dách". 
  Current Game State:
  - Phase: ${phase}
  - Player Hand: [${playerHandStr}] (Total: ${playerScore})
  - Dealer Visible Hand: [${dealerHandStr}] (Total: ${dealerScore})
  - Result of turn: ${result || 'Game in progress'}

  Rules brief: Xi Bang (2 Aces), Xi Dach (A+10/J/Q/K), Ngu Linh (5 cards <= 21). 
  Min points to stay: Player 16, Dealer 15.

  Task: Give a short, engaging comment in Vietnamese (under 20 words) as the dealer. 
  Be encouraging if they are losing, or slightly salty if they are winning with a big hand like Xi Bang.
  Don't repeat yourself. Use casino slang like "Quắc rồi", "Dằn chưa?", "Ăn non thế".`;

  try {
    // Correct usage: call generateContent directly on ai.models
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.8,
        topP: 0.9,
      }
    });
    // Extract text using the .text property (not a method)
    return response.text?.trim() || "Chúc may mắn!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Lên bài nào!";
  }
};
