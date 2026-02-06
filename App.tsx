
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
  const [copied, setCopied] = useState(false);
  const myId = useRef<string>('');

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const broadcastState = (newState: GameState) => {
    network.broadcast({ 
      type: MessageType.STATE_UPDATE, 
      payload: newState, 
      senderId: myId.current, 
      senderName: userName 
    });
  };

  const handleRemoteAction = useCallback((playerId: string, action: string, data: any) => {
    setState(prev => {
      let nextState = { ...prev };
      const pIdx = nextState.players.findIndex(p => p.id === playerId);
      if (pIdx === -1) return prev;

      if (action === 'BET') {
        nextState.players[pIdx].bet = data.amount;
        nextState.players[pIdx].isReady = true;
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

      if (nextState.activePlayerIndex >= nextState.players.length && nextState.players.length > 0) {
        nextState.phase = GamePhase.DealerTurn;
      }

      broadcastState(nextState);
      return nextState;
    });
  }, [userName]);

  useEffect(() => {
    network.onPlayerJoined = (id, name) => {
      if (stateRef.current.isHost) {
        setState(prev => {
          // Prevent duplicate players
          if (prev.players.find(p => p.id === id)) return prev;

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
          
          // CRITICAL: Immediate direct message to the new player with current state
          network.sendTo(id, { 
              type: MessageType.STATE_UPDATE, 
              payload: newState, 
              senderId: myId.current, 
              senderName: userName 
          });

          // Then broadcast to all others
          broadcastState(newState);
          return newState;
        });
      }
    };

    network.onMessageReceived = (msg: PeerMessage) => {
      if (msg.type === MessageType.STATE_UPDATE) {
        // Clients update their local state from Host
        setState(prev => ({ 
          ...msg.payload, 
          isHost: prev.isHost,
          roomCode: prev.roomCode // Keep the display code
        }));
      }
      
      if (stateRef.current.isHost && msg.type === MessageType.PLAYER_ACTION) {
        handleRemoteAction(msg.senderId, msg.payload.action, msg.payload.data);
      }
    };

    return () => {
      network.onPlayerJoined = undefined;
      network.onMessageReceived = undefined;
    };
  }, [userName, handleRemoteAction]);

  const createRoom = async () => {
    if (!userName.trim()) return alert('Vui lòng nhập tên');
    setIsConnecting(true);
    try {
      const code = network.generateCode();
      const displayId = await network.init(code);
      myId.current = network.getId();
      setState(prev => ({ ...prev, roomCode: displayId, isHost: true, players: [] }));
    } catch (e) {
      alert("Lỗi tạo phòng. Thử lại nhé!");
    } finally {
      setIsConnecting(false);
    }
  };

  const joinRoom = async () => {
    if (!userName.trim() || targetRoom.length !== 6) return alert('Nhập tên và mã phòng 6 số');
    setIsConnecting(true);
    try {
      await network.init();
      myId.current = network.getId();
      network.connectTo(targetRoom, userName);
      setState(prev => ({ ...prev, roomCode: targetRoom, isHost: false }));
      
      // Safety timeout if joining fails
      setTimeout(() => {
          setIsConnecting(false);
      }, 5000);
    } catch (e) {
      alert("Không kết nối được!");
      setIsConnecting(false);
    }
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
      message: 'Mời cả sòng đặt cược!'
    };
    setState(newState);
    broadcastState(newState);
  };

  useEffect(() => {
    if (state.isHost && (state.phase === GamePhase.Turns || state.phase === GamePhase.Resolution)) {
      const updateCommentary = async () => {
        const activePlayer = state.players[state.activePlayerIndex] || state.players[0];
        if (!activePlayer) return;
        
        const commentary = await getDealerCommentary(
          activePlayer.hand,
          state.dealerHand,
          state.phase,
          calculateHandScore(activePlayer.hand),
          calculateHandScore(state.dealerHand.filter(c => c.isFaceUp)),
          state.phase === GamePhase.Resolution ? "Kết thúc ván" : undefined
        );
        
        setState(prev => {
          const newState = { ...prev, dealerCommentary: commentary };
          broadcastState(newState);
          return newState;
        });
      };
      updateCommentary();
    }
  }, [state.phase, state.activePlayerIndex, state.isHost]);

  useEffect(() => {
    if (state.isHost && state.phase === GamePhase.InitialDeal) {
      const timer = setTimeout(() => {
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
          message: 'Lượt của ' + (updatedPlayers[0]?.name || 'mọi người')
        };
        setState(nextState);
        broadcastState(nextState);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.isHost]);

  useEffect(() => {
    if (state.isHost && state.phase === GamePhase.DealerTurn) {
      const runDealer = async () => {
        let dHand = [...state.dealerHand.map(c => ({ ...c, isFaceUp: true }))];
        let deck = [...state.deck];
        while (calculateHandScore(dHand) < 15 && dHand.length < 5) {
          await new Promise(r => setTimeout(r, 1000));
          dHand.push({ ...deck.pop()!, isFaceUp: true });
          setState(prev => {
            const s = { ...prev, dealerHand: [...dHand], deck };
            broadcastState(s);
            return s;
          });
        }
        setState(prev => {
            const s = { ...prev, phase: GamePhase.Resolution };
            broadcastState(s);
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
      const hostId = 'xd-host-' + state.roomCode;
      network.sendTo(hostId, {
        type: MessageType.PLAYER_ACTION,
        payload: { action, data },
        senderId: myId.current,
        senderName: userName
      });
    }
  };

  const isMeActive = () => {
      const activePlayer = state.players[state.activePlayerIndex];
      return activePlayer?.id === myId.current;
  };

  if (state.phase === GamePhase.Lobby && !state.roomCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#064e3b] overflow-auto">
        <div className="glass w-full max-w-sm p-10 rounded-[3rem] shadow-2xl space-y-8 text-white text-center border-white/20">
          <div className="space-y-1">
             <h1 className="text-6xl font-black italic text-yellow-400 tracking-tighter drop-shadow-2xl">XÌ DÁCH</h1>
             <p className="text-yellow-400/50 uppercase tracking-[0.3em] text-[10px] font-bold">Casino Online</p>
          </div>
          
          <div className="space-y-6 text-left">
            <div className="space-y-1">
              <label className="text-[10px] font-bold opacity-40 uppercase ml-2">Bạn tên là gì?</label>
              <input 
                value={userName} 
                onChange={e => setUserName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:ring-2 ring-yellow-400/50 transition-all font-bold"
                placeholder="Nhập tên..."
              />
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={createRoom}
                disabled={isConnecting}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black py-5 rounded-2xl transition-all shadow-[0_5px_0_rgb(161,98,7)] active:translate-y-1 active:shadow-none disabled:opacity-50 text-xl uppercase tracking-tighter"
              >
                {isConnecting ? 'Đang tạo...' : 'Làm Cái (Mở Sòng)'}
              </button>
              
              <div className="relative flex items-center py-4">
                <div className="flex-grow border-t border-white/5"></div>
                <span className="flex-shrink mx-4 text-[10px] font-bold opacity-20 uppercase">Hoặc nhập mã vào sòng</span>
                <div className="flex-grow border-t border-white/5"></div>
              </div>

              <div className="space-y-3">
                <input 
                  value={targetRoom} 
                  onChange={e => setTargetRoom(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-center text-2xl font-black tracking-[0.5em] outline-none focus:ring-2 ring-blue-500/50 transition-all text-blue-400 placeholder:text-white/10"
                  placeholder="000000"
                  maxLength={6}
                />
                <button 
                  onClick={joinRoom}
                  disabled={isConnecting || targetRoom.length !== 6}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-20 uppercase text-sm tracking-widest"
                >
                  {isConnecting ? 'Đang vào...' : 'Vào Sòng'}
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
      <div className="w-full max-w-6xl flex justify-between items-center mb-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold opacity-50 uppercase">Mã Sòng: </h1>
            <span 
              onClick={() => { navigator.clipboard.writeText(state.roomCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="bg-yellow-500 text-black px-4 py-1.5 rounded-xl cursor-pointer hover:bg-yellow-400 transition-all font-black text-xl shadow-lg flex items-center gap-2"
            >
              {state.roomCode}
              <span className="text-xs">{copied ? '✅' : '📋'}</span>
            </span>
          </div>
          <p className="text-[10px] font-bold opacity-30 uppercase mt-1">Sòng có {state.players.length + 1} người</p>
        </div>
        
        {state.isHost && state.phase === GamePhase.Lobby && (
          <button 
            onClick={startRound} 
            disabled={state.players.length === 0}
            className="bg-white text-black px-8 py-3 rounded-2xl font-black shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 uppercase tracking-tighter"
          >
            Chia Bài Ngay
          </button>
        )}
      </div>

      <div className="flex-1 w-full max-w-6xl flex flex-col items-center justify-center space-y-12 py-4">
        <div className="flex flex-col items-center relative">
          <div className="absolute -top-14 left-1/2 -translate-x-1/2 w-64 bg-white text-slate-900 p-3 rounded-2xl shadow-2xl text-[11px] font-bold text-center border-b-4 border-slate-200 z-50">
            {state.dealerCommentary}
          </div>
          <div className="flex gap-3 justify-center h-32 md:h-44">
            {state.dealerHand.length > 0 ? (
               state.dealerHand.map((c, i) => <Card key={i} card={c} index={i} />)
            ) : (
              <div className="w-24 h-32 md:w-32 md:h-44 border-4 border-dashed border-white/5 rounded-[2rem] flex items-center justify-center text-white/5 text-[10px] font-black uppercase text-center p-4">
                Chờ Nhà Cái<br/>Chia Bài
              </div>
            )}
          </div>
        </div>

        <div className="bg-black/30 backdrop-blur-md px-12 py-4 rounded-full border border-white/10 shadow-inner">
          <h2 className="text-lg font-black text-center text-yellow-400 drop-shadow-md uppercase tracking-wider">{state.message}</h2>
        </div>

        <div className="w-full flex flex-wrap justify-center gap-10 md:gap-20">
          {state.players.map((p, idx) => {
            const isMe = p.id === myId.current;
            const isActive = idx === state.activePlayerIndex;
            return (
              <div key={p.id} className={`flex flex-col items-center transition-all duration-500 ${isActive ? 'scale-110' : 'opacity-40 grayscale-[50%]'}`}>
                <div className={`relative p-1 rounded-2xl mb-4 ${isActive ? 'active-player-glow bg-yellow-400 shadow-[0_0_30px_rgba(234,179,8,0.5)]' : 'bg-white/5'}`}>
                   <div className="bg-slate-900 rounded-xl px-5 py-2 flex flex-col items-center min-w-[100px]">
                     <span className={`text-[11px] font-black uppercase tracking-tighter ${isMe ? 'text-blue-400' : 'text-yellow-500'}`}>
                       {p.name} {isMe && "★"}
                     </span>
                     <span className="text-[9px] opacity-40 font-bold italic">Cược: {p.bet || 0}</span>
                   </div>
                </div>
                <div className="flex -space-x-10 h-24 md:h-36">
                  {p.hand.length > 0 ? (
                    p.hand.map((c, i) => <Card key={i} card={c} index={i} />)
                  ) : (
                    <div className="w-20 h-24 border border-white/5 rounded-2xl opacity-10"></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-2xl glass p-8 rounded-[3rem] border-t border-white/20 flex items-center justify-center gap-6 shadow-2xl mb-4">
        {state.phase === GamePhase.Betting && !state.players.find(p => p.id === myId.current)?.isReady && (
          <div className="flex gap-4">
            {[50, 100, 500].map(amt => (
              <button 
                key={amt}
                onClick={() => sendAction('BET', { amount: amt })} 
                className="bg-white/10 hover:bg-yellow-500 hover:text-black px-8 py-4 rounded-2xl font-black transition-all text-sm border border-white/10 shadow-xl"
              >
                CƯỢC {amt}
              </button>
            ))}
          </div>
        )}

        {state.phase === GamePhase.Turns && (
          isMeActive() ? (
            <div className="flex gap-6">
              <button 
                onClick={() => sendAction('HIT')}
                className="px-12 py-5 bg-emerald-500 text-slate-900 rounded-3xl font-black text-2xl shadow-[0_6px_0_rgb(5,150,105)] hover:bg-emerald-400 transition-all active:translate-y-1 active:shadow-none"
              >
                RÚT
              </button>
              <button 
                onClick={() => sendAction('STAND')}
                className="px-12 py-5 bg-amber-500 text-slate-900 rounded-3xl font-black text-2xl shadow-[0_6px_0_rgb(180,83,9)] hover:bg-amber-400 transition-all active:translate-y-1 active:shadow-none"
              >
                DẰN
              </button>
            </div>
          ) : (
            <p className="font-black text-white/20 uppercase tracking-[0.2em] text-sm italic">Đang chờ lượt...</p>
          )
        )}

        {state.phase === GamePhase.Resolution && state.isHost && (
          <button onClick={startRound} className="px-14 py-5 bg-yellow-500 text-black rounded-3xl font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all">TIẾP TỤC</button>
        )}

        {state.phase === GamePhase.Lobby && !state.isHost && (
           <p className="font-black text-white/20 uppercase tracking-[0.2em] text-sm italic">Đã sẵn sàng. Chờ chia bài...</p>
        )}
      </div>
    </div>
  );
};

export default App;
