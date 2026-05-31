import {PointerPhase} from "./InteractionStateMachine"

export type PointerPacket = {
  type: "pointer"
  u: number
  v: number
  pinch: boolean
  phase: PointerPhase
  distanceToPlane: number
  timestamp: number
  scrollX?: number
  scrollY?: number
}

export class NetworkSender {
  private internetModule: InternetModule = require("LensStudio:InternetModule")
  private socket: WebSocket | null = null
  private connected = false
  private reconnectAt = 0
  private resolvedEndpoint: string

  constructor(
    endpoint: string,
    private reconnectDelaySeconds: number,
    private logEnabled: boolean,
    private onCommand?: (command: string) => void
  ) {
    this.resolvedEndpoint = normalizeEndpoint(endpoint)
    if (this.resolvedEndpoint !== endpoint) {
      this.log("normalized endpoint " + endpoint + " -> " + this.resolvedEndpoint)
    }
  }

  connect(): void {
    if (this.socket !== null || this.resolvedEndpoint.length === 0) {
      return
    }

    try {
      this.log("connecting " + this.resolvedEndpoint)
      this.socket = this.internetModule.createWebSocket(this.resolvedEndpoint)
      this.socket.onopen = () => {
        this.connected = true
        this.log("connected " + this.resolvedEndpoint)
      }
      this.socket.onclose = (event: WebSocketCloseEvent) => {
        const code = typeof event.code === "number" ? " code=" + event.code : ""
        const reason = event.reason ? " reason=" + event.reason : ""
        this.log("closed" + code + reason + " url=" + this.resolvedEndpoint)
        this.scheduleReconnect()
      }
      this.socket.onerror = (event: WebSocketEvent) => {
        const eventData = event as any
        const eventType = eventData && eventData.type ? " type=" + eventData.type : ""
        this.log("error" + eventType + " url=" + this.resolvedEndpoint)
        this.scheduleReconnect()
      }
      this.socket.onmessage = (event: WebSocketMessageEvent) => {
        this.handleMessage(event.data as string)
      }
    } catch (error) {
      this.log("connect failed: " + error)
      this.scheduleReconnect()
    }
  }

  update(): void {
    if (this.connected || getTime() < this.reconnectAt) {
      return
    }
    this.socket = null
    this.connect()
  }

  send(packet: PointerPacket): void {
    if (!this.connected || this.socket === null || this.socket.readyState !== 1) {
      return
    }

    try {
      this.socket.send(JSON.stringify(packet))
    } catch (error) {
      this.log("send failed: " + error)
      this.scheduleReconnect()
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  close(): void {
    if (this.socket !== null) {
      this.socket.close()
    }
    this.socket = null
    this.connected = false
  }

  private scheduleReconnect(): void {
    this.connected = false
    this.socket = null
    this.reconnectAt = getTime() + this.reconnectDelaySeconds
  }

  private log(message: string): void {
    if (this.logEnabled) {
      print("[AirTouch Network] " + message)
    }
  }

  private handleMessage(message: string): void {
    if (this.onCommand === undefined || message.length === 0) {
      return
    }

    try {
      const data = JSON.parse(message)
      if (data.type === "command" && typeof data.command === "string") {
        this.onCommand(data.command)
      }
    } catch (error) {
      this.log("ignored message: " + error)
    }
  }
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  if (!trimmed.startsWith("ws://")) {
    return trimmed
  }

  const withoutProtocol = trimmed.substring("ws://".length)
  const hostAndPort = withoutProtocol.split("/")[0]
  if (hostAndPort.indexOf(":") >= 0) {
    return trimmed
  }

  const isLocalHost = hostAndPort === "localhost"
  const isIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(hostAndPort)
  if (!isLocalHost && !isIPv4) {
    return trimmed
  }

  return "ws://" + hostAndPort + ":8765" + trimmed.substring("ws://".length + hostAndPort.length)
}
