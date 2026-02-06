
import { PeerMessage, MessageType } from '../types';

declare const Peer: any;

class NetworkService {
  private peer: any;
  private connections: Map<string, any> = new Map();
  public onMessageReceived?: (msg: PeerMessage) => void;
  public onPlayerJoined?: (id: string, name: string) => void;
  public onConnectionClosed?: (id: string) => void;

  init(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(id, {
        debug: 1
      });

      this.peer.on('open', (id: string) => {
        resolve(id);
      });

      this.peer.on('connection', (conn: any) => {
        this.setupConnection(conn);
      });

      this.peer.on('error', (err: any) => {
        console.error('Peer error:', err);
        reject(err);
      });
    });
  }

  private setupConnection(conn: any) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on('data', (data: PeerMessage) => {
      if (data.type === MessageType.JOIN) {
        this.onPlayerJoined?.(conn.peer, data.payload.name);
      }
      this.onMessageReceived?.(data);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.onConnectionClosed?.(conn.peer);
    });
  }

  connectTo(targetId: string, myName: string) {
    const conn = this.peer.connect(targetId);
    this.setupConnection(conn);
    conn.on('open', () => {
      conn.send({
        type: MessageType.JOIN,
        payload: { name: myName },
        senderId: this.peer.id,
        senderName: myName
      });
    });
  }

  broadcast(msg: PeerMessage) {
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }

  sendTo(targetId: string, msg: PeerMessage) {
    const conn = this.connections.get(targetId);
    if (conn && conn.open) {
      conn.send(msg);
    }
  }

  getId(): string {
    return this.peer?.id || '';
  }

  disconnect() {
    this.peer?.destroy();
    this.connections.clear();
  }
}

export const network = new NetworkService();
