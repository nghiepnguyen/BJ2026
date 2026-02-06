
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  GameState, CardData, GamePhase, HandType, Player, MessageType, PeerMessage 
} from './types';
import { 
  createDeck, calculateHandScore, identifyHandType, compareHands 
} from './services/gameLogic';
import { getDealerCommentary } from './services/geminiService';
import { network } from './services/networkService';
import Card from './components/Card';

const INITIAL_CHIPS = 1000;
const MIN_BET = 50;

const App: React.FC = () => {
  const [state, setState] = useState<GameState>({
    roomCode: '',
    isHost: false,
    players: [],
    dealerHand: [],
    phase: GamePhase.Lobby,
    activePlayerIndex: -1,
    deck: [],
    message: 'Chào mừng đến với Sòng Bài Xì Dách!',
    dealerCommentary: 'Sòng đang mở, vào kiếm tí lộc nào!',
    history: []
  });

  const [userName, setUserName] = useState('');
  const [targetRoom, setTargetRoom] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const myId = useRef<string>('');

  // Update commentary helper
  const updateAiCommentary = useCallback(async (pHand: CardData[], dHand: CardData[], phase: GamePhase, res?: string) => {
    if (!state.isHost) return;
    const pScore = pHand.length > 0 ? calculateHandScore(pHand) : 0;
    const dScore = dHand.length > 0 ? calculateHandScore(dHand) : 0;
    const text = await getDealerCommentary(pHand, dHand, phase, pScore, dScore, res);
    const newState = { ...state, dealerCommentary: text };
    setState(newState);
    network.broadcast({ type: MessageType.STATE_UPDATE, payload: newState, senderId: myId.current, senderName: userName });
  }, [state, userName]);

  // Handle network messages
  useEffect(() => {
    network.onPlayerJoined = (id, name) => {
      if (state.isHost) {
        setState(prev => {
          const newPlayer: Player = {
            id,
            name,
            hand: [],
            chips: INITIAL_CHIPS,
            bet: 0,
            isReady: false,
            status: 'WAITING'
          };
          const newState = { ...prev, players: [...prev.players, newPlayer] };
          network.broadcast({ type: MessageType.STATE_UPDATE, payload: newState, senderId: myId.current, senderName: userName });
          return newState;
        });
      }
    };

    network.onMessageReceived = (msg: PeerMessage) => {
      if (msg.type === MessageType.STATE_UPDATE) {
        setState(prev => ({ ...msg.payload, isHost: prev.isHost }));
      }
      
      if (state.isHost && msg.type === MessageType.PLAYER_ACTION) {
        handleRemoteAction(msg.senderId, msg.payload.action, msg.payload.data);
      }
    };
  }, [state.isHost, userName]);

  const handleRemoteAction = (playerId: string, action: string, data: any) => {
    setState(prev => {
      let nextState = { ...prev };
      const pIdx = nextState.players.findIndex(p => p.id === playerId);
      if (pIdx === -1) return prev;

      if (action === 'BET') {
        nextState.players[pIdx].bet = data.amount;
        nextState.players[pIdx].isReady = true;
        // If all ready, move to Initial Deal
        if (nextState.players.every(p => p.isReady)) {
          nextState.phase = GamePhase.InitialDeal;
        }
      }

      if (action === 'HIT') {
        const newCard = { ...nextState.deck.pop()!, isFaceUp: true };
        nextState.players[pIdx].hand.push(newCard);
        if (calculateHandScore(nextState.players[pIdx].hand) > 21) {
          nextState.players[pIdx].status = 'QUAC';
          nextState.activePlayerIndex++;
        }
      }

      if (action === 'STAND') {
        nextState.players[pIdx].status = 'STAY';
        nextState.activePlayerIndex++;
      }

      // Check if all players done
      if (nextState.activePlayerIndex >= nextState.players.length) {
        nextState.phase = GamePhase.DealerTurn;
      }

      network.broadcast({ type: MessageType.STATE_UPDATE, payload: nextState, senderId: myId.current, senderName: userName });
      return nextState;
    });
  };

  const createRoom = async () => {
    if (!userName) return alert('Nhập tên của bạn');
    setIsConnecting(true);
    const id = await network.init();
    myId.current = id;
    setState(prev => ({ ...prev, roomCode: id, isHost: true, players: [] }));
    setIsConnecting(false);
  };

  const joinRoom = async () => {
    if (!userName || !targetRoom) return alert('Nhập đủ tên và mã phòng');
    setIsConnecting(true);
    await network.init();
    myId.current = network.getId();
    network.connectTo(targetRoom, userName);
    setState(prev => ({ ...prev, roomCode: targetRoom, isHost: false }));
    setIsConnecting(false);
  };

  const startRound = () => {
    if (!state.isHost) return;
    const deck = createDeck();
    const newState = {
      ...state,
      deck,
      phase: GamePhase.Betting,
      players: state.players.map(p => ({ ...p, hand: [], bet: 0, isReady: false, status: 'WAITING' })),
      dealerHand: [],
      activePlayerIndex: 0,
      message: 'Đặt cược đi các con giời!'
    };
    setState(newState);
    network.broadcast({ type: MessageType.STATE_UPDATE, payload: newState, senderId: myId.current, senderName: userName });
  };

  // Host Only Deal logic
  useEffect(() => {
    if (state.isHost && state.phase === GamePhase.InitialDeal) {
      setTimeout(() => {
        let deck = [...state.deck];
        const updatedPlayers = state.players.map(p => ({
          ...p,
          hand: [{ ...deck.pop()!, isFaceUp: true }, { ...deck.pop()!, isFaceUp: true }],
          status: 'PLAYING' as const
        }));
        const dealerHand = [{ ...deck.pop()!, isFaceUp: false }, { ...deck.pop()!, isFaceUp: false }];
        
        const nextState = {
          ...state,
          deck,
          players: updatedPlayers,
          dealerHand,
          phase: GamePhase.Turns,
          activePlayerIndex: 0,
          message: 'Lượt của ' + updatedPlayers[0].name
        };
        setState(nextState);
        network.broadcast({ type: MessageType.STATE_UPDATE, payload: nextState, senderId: myId.current, senderName: userName });
      }, 1500);
    }
  }, [state.phase, state.isHost]);

  // Dealer Turn logic
  useEffect(() => {
    if (state.isHost && state.phase === GamePhase.DealerTurn) {
      const runDealer = async () => {
        let dHand = state.dealerHand.map(c => ({ ...c, isFaceUp: true }));
        let deck = [...state.deck];
        while (calculateHandScore(dHand) < 15 && dHand.length < 5) {
          await new Promise(r => setTimeout(r, 1000));
          dHand.push({ ...deck.pop()!, isFaceUp: true });
          setState(prev => {
            const s = { ...prev, dealerHand: [...dHand], deck };
            network.broadcast({ type: MessageType.STATE_UPDATE, payload: s, senderId: myId.current, senderName: userName });
            return s;
          });
        }
        setState(prev => {
            const s = { ...prev, phase: GamePhase.Resolution };
            network.broadcast({ type: MessageType.STATE_UPDATE, payload: s, senderId: myId.current, senderName: userName });
            return s;
        });
      };
      runDealer();
    }
  }, [state.phase, state.isHost]);

  const sendAction = (action: string, data?: any) => {
    if (state.isHost) {
      handleRemoteAction(myId.current, action, data);
    } else {
      network.sendTo(state.roomCode, {
        type: MessageType.PLAYER_ACTION,
        payload: { action, data },
        senderId: myId.current,
        senderName: userName
      });
    }
  };

  const activePlayer = state.players[state.activePlayerIndex];
  const isMyTurn = activePlayer?.id === myId.current;

  if (state.phase === GamePhase.Lobby && !state.roomCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#064e3b] overflow-auto">
        <div className="glass w-full max-w-md p-8 rounded-3xl shadow-2xl space-y-6 text-white text-center">
          <div className="space-y-2">
             <h1 className="text-5xl font-black italic text-yellow-400 tracking-tighter">XÌ DÁCH</h1>
             <p className="text-yellow-400/60 uppercase tracking-widest text-xs font-bold">Multiplayer Edition</p>
          </div>
          
          <div className="space-y-4 text-left">
            <div>
              <label className="text-xs font-bold opacity-50 uppercase mb-1 block">Tên hiển thị</label>
              <input 
                value={userName} 
                onChange={e => setUserName(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-yellow-400 transition-all"
                placeholder="VD: Tuấn 'The Shark'"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={createRoom}
                disabled={isConnecting}
                className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isConnecting ? 'Đang tạo...' : 'Tạo Phòng'}
              </button>
              <div className="space-y-2">
                <input 
                  value={targetRoom} 
                  onChange={e => setTargetRoom(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-center text-sm outline-none focus:ring-2 ring-blue-400 transition-all uppercase"
                  placeholder="Mã CODE"
                />
                <button 
                  onClick={joinRoom}
                  disabled={isConnecting}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                >
                  Vào Phòng
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 bg-[#064e3b] text-white">
      {/* Header */}
      <div className="w-full max-w-6xl flex justify-between items-center mb-4">
        <div className="flex flex-col">
          <h1 className="text-xl md:text-3xl font-black italic text-yellow-400">PHÒNG: {state.roomCode?.slice(0, 4).toUpperCase()}</h1>
          <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
             <span className="text-[10px] uppercase opacity-50 font-bold">{state.players.length + 1} Người đang chơi</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {state.isHost && state.phase === GamePhase.Lobby && (
             <button onClick={startRound} className="bg-yellow-500 text-black px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all">BẮT ĐẦU VÁN</button>
           )}
           <div className="glass px-4 py-2 rounded-full text-sm font-bold border border-yellow-500/20">
             💰 {INITIAL_CHIPS} CHIPS
           </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 w-full max-w-6xl flex flex-col items-center justify-center space-y-8 relative py-10">
        
        {/* Dealer (Host) */}
        <div className="flex flex-col items-center relative">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 bg-white text-slate-900 p-2 rounded-xl shadow-xl text-xs font-bold text-center">
            {state.dealerCommentary}
          </div>
          <div className="flex gap-2 justify-center h-32 md:h-40">
            {state.dealerHand.length > 0 ? (
               state.dealerHand.map((c, i) => <Card key={i} card={c} index={i} />)
            ) : (
              <div className="w-24 h-32 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center text-white/10 text-xs font-bold uppercase">Nhà Cái</div>
            )}
          </div>
          <div className="mt-2 text-[10px] font-bold text-yellow-500 tracking-widest uppercase">
            {state.phase === GamePhase.Resolution && `Tổng: ${calculateHandScore(state.dealerHand)}`}
          </div>
        </div>

        {/* Message Banner */}
        <div className="bg-black/40 px-10 py-3 rounded-full border-2 border-yellow-500/30 shadow-2xl">
          <h2 className="text-lg md:text-xl font-bold text-center drop-shadow-lg">{state.message}</h2>
        </div>

        {/* Players (Peers) Grid */}
        <div className="w-full flex flex-wrap justify-center gap-8 md:gap-16">
          {state.players.map((p, idx) => (
            <div key={p.id} className={`flex flex-col items-center transition-all ${idx === state.activePlayerIndex ? 'scale-110' : 'opacity-60'}`}>
              <div className={`relative p-1 rounded-2xl ${idx === state.activePlayerIndex ? 'active-player-glow bg-yellow-400' : 'bg-white/10'}`}>
                 <div className="bg-slate-900 rounded-xl px-4 py-1 flex flex-col items-center">
                   <span className="text-[10px] font-black uppercase text-yellow-500 leading-none">{p.name}</span>
                   <span className="text-[8px] opacity-50 font-bold">Cược: {p.bet || 0}</span>
                 </div>
              </div>
              <div className="flex -space-x-8 mt-2 h-24 md:h-32">
                {p.hand.map((c, i) => <Card key={i} card={c} index={i} />)}
              </div>
              <div className="text-[10px] font-bold mt-1 text-white/50">
                {p.status !== 'WAITING' && `Điểm: ${calculateHandScore(p.hand)}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Controls (Bottom Bar) */}
      <div className="w-full max-w-4xl glass p-6 rounded-t-[2.5rem] border-t border-white/20 flex items-center justify-center gap-4">
        {state.phase === GamePhase.Betting && !state.players.find(p => p.id === myId.current)?.isReady && (
          <div className="flex gap-4">
            <button onClick={() => sendAction('BET', { amount: 100 })} className="bg-red-600 px-8 py-3 rounded-xl font-bold hover:bg-red-500 transition-all">TỐ 100</button>
            <button onClick={() => sendAction('BET', { amount: 200 })} className="bg-blue-600 px-8 py-3 rounded-xl font-bold hover:bg-blue-500 transition-all">TỐ 200</button>
            <button onClick={() => sendAction('BET', { amount: 500 })} className="bg-yellow-600 px-8 py-3 rounded-xl font-bold hover:bg-yellow-500 transition-all">TẤT TAY</button>
          </div>
        )}

        {state.phase === GamePhase.Turns && isMyTurn && (
          <div className="flex gap-6">
            <button 
              onClick={() => sendAction('HIT')}
              className="px-10 py-4 bg-emerald-600 rounded-2xl font-black text-xl shadow-[0_4px_0_rgb(5,150,105)] hover:bg-emerald-500 transition-all"
            >
              RÚT BÀI
            </button>
            <button 
              onClick={() => sendAction('STAND')}
              className="px-10 py-4 bg-amber-600 rounded-2xl font-black text-xl shadow-[0_4px_0_rgb(180,83,9)] hover:bg-amber-500 transition-all"
            >
              DẰN
            </button>
          </div>
        )}

        {state.phase === GamePhase.Resolution && state.isHost && (
          <button onClick={startRound} className="px-12 py-4 bg-yellow-500 text-black rounded-2xl font-black text-xl animate-pulse">VÁN MỚI</button>
        )}

        {state.phase === GamePhase.Lobby && !state.isHost && (
          <p className="font-bold text-yellow-500 animate-pulse uppercase tracking-widest text-sm">Chờ nhà cái bắt đầu...</p>
        )}
      </div>
    </div>
  );
};

export default App;
