
import { PeerMessage, MessageType } from '../types';

declare const Peer: any;

const HOST_PREFIX = 'xd-host-';
const CLIENT_PREFIX = 'xd-client-';

class NetworkService {
  private peer: any;
  private connections: Map<string, any> = new Map();
  public onMessageReceived?: (msg: PeerMessage) => void;
  public onPlayerJoined?: (id: string, name: string) => void;
  public onConnectionClosed?: (id: string) => void;

  generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  init(customDigitCode?: string): Promise<string> {
    // If we have a code, we are a HOST. If not, we are a CLIENT.
    const peerId = customDigitCode ? HOST_PREFIX + customDigitCode : CLIENT_PREFIX + Math.random().toString(36).substr(2, 9);
    
    return new Promise((resolve, reject) => {
      if (this.peer) {
        this.peer.destroy();
      }

      this.peer = new Peer(peerId, {
        debug: 1,
        config: {
          'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
          ]
        }
      });

      this.peer.on('open', (id: string) => {
        const displayId = id.replace(HOST_PREFIX, '').replace(CLIENT_PREFIX, '');
        resolve(displayId);
      });

      this.peer.on('connection', (conn: any) => {
        this.setupConnection(conn);
      });

      this.peer.on('error', (err: any) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
           // If ID taken, just resolve with random
           this.init().then(resolve).catch(reject);
        } else {
           reject(err);
        }
      });
    });
  }

  private setupConnection(conn: any) {
    const handleData = (data: PeerMessage) => {
      this.connections.set(conn.peer, conn);
      if (data.type === MessageType.JOIN) {
        this.onPlayerJoined?.(conn.peer, data.payload.name);
      }
      this.onMessageReceived?.(data);
    };

    conn.on('data', handleData);
    
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.onConnectionClosed?.(conn.peer);
    });
  }

  connectTo(digitCode: string, myName: string) {
    const fullTargetId = HOST_PREFIX + digitCode;
    const conn = this.peer.connect(fullTargetId, {
      reliable: true
    });
    
    this.setupConnection(conn);

    // Immediate attempt and backup interval for JOIN
    const sendJoin = () => {
      if (conn.open) {
        conn.send({
          type: MessageType.JOIN,
          payload: { name: myName },
          senderId: this.peer.id,
          senderName: myName
        });
        return true;
      }
      return false;
    };

    conn.on('open', () => {
      sendJoin();
    });

    // Retry sending JOIN every second until connection is established and data flows
    let retryCount = 0;
    const interval = setInterval(() => {
      if (sendJoin() || retryCount > 10) {
        clearInterval(interval);
      }
      retryCount++;
    }, 1000);
  }

  broadcast(msg: PeerMessage) {
    this.connections.forEach(conn => {
      if (conn && conn.open) {
        conn.send(msg);
      }
    });
  }

  sendTo(targetPeerId: string, msg: PeerMessage) {
    const conn = this.connections.get(targetPeerId);
    if (conn && conn.open) {
      conn.send(msg);
    } else {
      // Direct lookup in peer.connections as backup
      const conns = this.peer.connections[targetPeerId];
      conns?.forEach((c: any) => {
        if (c.open) c.send(msg);
      });
    }
  }

  getId(): string {
    return this.peer?.id || '';
  }
}

export const network = new NetworkService();
