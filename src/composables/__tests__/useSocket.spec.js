import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSocket } from '../useSocket'

const handlers = {}
const mockSocket = {
    connected: false,
    on: vi.fn((event, cb) => { handlers[event] = cb }),
    emit: vi.fn(),
    disconnect: vi.fn()
}

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => mockSocket)
}))

describe('useSocket', () => {
    beforeEach(() => {
        Object.keys(handlers).forEach((key) => delete handlers[key])
        mockSocket.connected = false
        mockSocket.on.mockClear()
        mockSocket.emit.mockClear()
        mockSocket.disconnect.mockClear()
    })

    it('queues room joins until connected', () => {
        const socket = useSocket({})
        socket.connect()
        socket.joinRoom('car-1')
        expect(mockSocket.emit).not.toHaveBeenCalledWith('join', 'car-1')

        mockSocket.connected = true
        handlers.connect()
        expect(mockSocket.emit).toHaveBeenCalledWith('join', 'car-1')
    })

    it('stores error message on connect_error', () => {
        const socket = useSocket({})
        socket.connect()
        handlers.connect_error({ message: 'boom' })
        expect(socket.lastError.value).toBe('boom')
    })

    it('tracks reconnect lifecycle state', () => {
        const socket = useSocket({})
        socket.connect()
        expect(socket.connectionState.value).toBe('connecting')

        handlers.reconnect_attempt(2)
        expect(socket.connectionState.value).toBe('reconnecting')
        expect(socket.reconnectAttempts.value).toBe(2)

        handlers.connect()
        expect(socket.connectionState.value).toBe('connected')
        expect(socket.isReconnecting.value).toBe(false)
    })
})
