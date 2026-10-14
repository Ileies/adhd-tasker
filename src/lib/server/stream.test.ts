/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { effectiveDisplay, publish, subscribe, type StreamMessage } from '#lib/server/stream.js';

const collect = () => {
	const received: StreamMessage[] = [];
	return { received, send: (message: StreamMessage) => received.push(message) };
};

describe('subscribe and publish', () => {
	test('publish reaches every open tab of the user and returns how many', () => {
		const a = collect();
		const b = collect();
		const off = [subscribe('pub@test', 'a', a.send), subscribe('pub@test', 'b', b.send)];
		expect(publish('pub@test', { type: 'agent' })).toBe(2);
		expect(a.received).toEqual([{ type: 'agent' }]);
		expect(b.received).toEqual([{ type: 'agent' }]);
		off.forEach((stop) => stop());
	});

	test('other users hear nothing', () => {
		const other = collect();
		const off = subscribe('other@test', null, other.send);
		expect(publish('alone@test', { type: 'schedule' })).toBe(0);
		expect(other.received).toEqual([]);
		off();
	});

	test('unsubscribing stops delivery to that tab only', () => {
		const a = collect();
		const b = collect();
		const offA = subscribe('unsub@test', 'a', a.send);
		const offB = subscribe('unsub@test', 'b', b.send);
		offA();
		expect(publish('unsub@test', { type: 'schedule' })).toBe(1);
		expect(a.received).toEqual([]);
		expect(b.received).toEqual([{ type: 'schedule' }]);
		offB();
	});

	test('after the last tab closes the user has no connections left', () => {
		const a = collect();
		const off = subscribe('last@test', null, a.send);
		off();
		expect(publish('last@test', { type: 'agent' })).toBe(0);
	});

	test('closing twice is harmless', () => {
		const off = subscribe('twice@test', null, () => {});
		off();
		expect(() => off()).not.toThrow();
	});
});

describe('effectiveDisplay', () => {
	test('no chosen device means every device plays', () => {
		expect(effectiveDisplay('disp@test', null)).toBeNull();
	});

	test('the chosen device counts while it is connected', () => {
		const off = subscribe('disp2@test', 'wall', () => {});
		expect(effectiveDisplay('disp2@test', 'wall')).toBe('wall');
		off();
	});

	test('falls back to every device when the chosen one is not connected', () => {
		const off = subscribe('disp3@test', 'phone', () => {});
		expect(effectiveDisplay('disp3@test', 'wall')).toBeNull();
		off();
		expect(effectiveDisplay('disp3@test', 'phone')).toBeNull();
	});
});
