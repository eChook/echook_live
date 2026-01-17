import { describe, it, expect } from 'vitest'
import { encodeMsgpack, decodeMsgpack } from '../msgpack'

describe('msgpack encoding/decoding', () => {
    it('roundtrips simple objects', () => {
        const data = { voltage: 24.5, current: 15.2, rpm: 3500 }
        const encoded = encodeMsgpack(data)
        const decoded = decodeMsgpack(encoded)

        expect(decoded).toEqual(data)
    })

    it('roundtrips arrays', () => {
        const data = [1, 2, 3, 'test', { nested: true }]
        const encoded = encodeMsgpack(data)
        const decoded = decodeMsgpack(encoded)

        expect(decoded).toEqual(data)
    })

    it('roundtrips nested objects', () => {
        const data = {
            telemetry: {
                voltage: 24.5,
                temps: [25.1, 26.3]
            },
            meta: {
                timestamp: 1234567890,
                id: 'car123'
            }
        }
        const encoded = encodeMsgpack(data)
        const decoded = decodeMsgpack(encoded)

        expect(decoded).toEqual(data)
    })

    it('handles null and undefined', () => {
        const data = { a: null, b: undefined }
        const encoded = encodeMsgpack(data)
        const decoded = decodeMsgpack(encoded)

        expect(decoded.a).toBeNull()
        // undefined becomes undefined in msgpack
    })

    it('handles numbers including floats', () => {
        const data = {
            int: 42,
            float: 3.14159,
            negative: -273.15,
            zero: 0
        }
        const encoded = encodeMsgpack(data)
        const decoded = decodeMsgpack(encoded)

        expect(decoded.int).toBe(42)
        expect(decoded.float).toBeCloseTo(3.14159)
        expect(decoded.negative).toBeCloseTo(-273.15)
        expect(decoded.zero).toBe(0)
    })

    it('decodes ArrayBuffer correctly', () => {
        const data = { test: 'value' }
        const encoded = encodeMsgpack(data)

        // Create a proper ArrayBuffer
        const arrayBuffer = new ArrayBuffer(encoded.length)
        const view = new Uint8Array(arrayBuffer)
        view.set(encoded)

        const decoded = decodeMsgpack(arrayBuffer)
        expect(decoded).toEqual(data)
    })
})
